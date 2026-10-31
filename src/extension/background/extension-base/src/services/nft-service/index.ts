import { Subject } from 'rxjs';
import AlchemyNftController from '@extension-base/services/nft-service/handlers/AlchemyNftSdk';
import {
  NFT_FILTERS,
  SUPPORTED_NFT_NETWORKS,
  type AlchemyNetwork,
  type NftFilter,
} from '@extension-base/services/nft-service/consts';
import { storage } from '@extension-base/stores/Storage';
import { formatUnits, isAddress, Wallet, type Contract } from 'ethers';
import {
  BasicTxErrorCode,
  type Port,
  type RequestNftTransfer,
  type ResponseNftTransfer,
} from '@extension-base/background/types/types';
import type {
  AvailableNftPayload,
  ChainNftState,
  CheckNftResponse,
  NftSettings,
  NftState,
  NftTx,
  RequestSettingsChangePayload,
} from '@extension-base/services/nft-service/types';
import type State from '@extension-base/background/handlers/State';
import { FPNumber } from '@/sora/number';
import { getBalanceItem } from '@/extension/background/extension-base/src/background/handlers/utils';
import { isNftNetworkScannable, markNftStateStale, stampNftState } from '@/portfolio/nftDiscovery';

export class NftService {
  private refreshTime = 10000;
  private settingsChanged = new Set<string>();
  private settingsReady: Promise<void>;
  private settingsWrites = Promise.resolve();
  private refreshTokens = new Map<string, Map<string, symbol>>();
  private sdks: Record<string, AlchemyNftController> = {};
  public nftMap: Record<string, ChainNftState> = {};
  public nftSubject = new Subject<ChainNftState>();

  hideSettings: Record<string, NftSettings> = {};

  constructor(private state: State) {
    Object.entries(SUPPORTED_NFT_NETWORKS).forEach(([chainId, network]) => {
      this.sdks[network] = new AlchemyNftController(network, chainId, this, this.state);
    });

    this.settingsReady = this.init().catch((error) => console.info('Unable to load NFT settings', error));
  }

  async init() {
    const { nftSettings } = await storage.get(['nftSettings']);

    for (const [address, settings] of Object.entries(nftSettings ?? {})) {
      if (!this.settingsChanged.has(address)) this.hideSettings[address] = settings;
    }
  }

  isNeedUpdate(address: string) {
    const networks = Object.keys(this.sdks) as AlchemyNetwork[];

    for (const network of networks) {
      const timespan = this.sdks[network].timespan;

      if (!timespan[address] || timespan[address] + this.refreshTime < Date.now()) return true;
    }

    return false;
  }

  resetTime(address: string) {
    const networks = Object.keys(this.sdks) as AlchemyNetwork[];

    for (const network of networks) {
      this.sdks[network].timespan[address] = Number.MAX_VALUE;
    }

    return false;
  }

  async fetchNfts(address?: string) {
    if (!address) return;

    await this.getNftForActiveNetworks(address);
  }

  excludeFilters(address: string) {
    const filters: NftFilter[] = [];

    if (!this.hideSettings[address]) {
      this.hideSettings[address] = {
        airdrop: false,
        spam: true, //it's dummy for now
      };
    }

    if (this.hideSettings[address].airdrop) filters.push(NFT_FILTERS.AIRDROPS);

    return filters;
  }

  availableNftsForContract({ network, contract, address, pageKey }: AvailableNftPayload) {
    const net = this.state.networkService.getNetworkJson(network);
    const key = SUPPORTED_NFT_NETWORKS[+net.chainId];

    if (!this.sdks[key])
      return {
        nfts: [],
        pageKey: undefined,
      };

    return this.sdks[key].getCollectionPage(contract, address, pageKey);
  }

  async getNftForActiveNetworks(address: string, force = false) {
    const networks = Object.keys(this.sdks);
    const activeChainIds = new Set(
      Object.values(this.state.networkService.networkMap)
        .filter(({ active }) => active)
        .map(({ chainId }) => String(chainId))
    );

    await Promise.all(networks.map(async (network) => {
      const sdk = this.sdks[network];
      if (!sdk || !isNftNetworkScannable(sdk.chainId, activeChainIds)) return;
      const lastFetch = sdk.timespan[address];
      if (!force && lastFetch && lastFetch + this.refreshTime >= Date.now()) return;

      const requests = this.refreshTokens.get(address) ?? new Map<string, symbol>();
      const token = Symbol(network);
      requests.set(network, token);
      this.refreshTokens.set(address, requests);
      const isCurrent = () => this.refreshTokens.get(address)?.get(network) === token;
      sdk.timespan[address] = Date.now();
      try {
        const networkNfts = await sdk.fetchNftsForWallet(address);
        if (!isCurrent()) return;
        if (!this.nftMap[address]) this.nftMap[address] = {};
        const syncedNfts = stampNftState(networkNfts, Date.now());
        this.nftMap[address][sdk.chainId] = JSON.parse(JSON.stringify(syncedNfts)) as NftState;
        if (this.state.currentAccount?.ethereumAddress === address) this.nftSubject.next(this.nftMap[address]);
      } catch (error) {
        if (!isCurrent()) return;
        const previous = this.nftMap[address]?.[sdk.chainId];
        if (previous) {
          this.nftMap[address][sdk.chainId] = markNftStateStale(previous);
          if (this.state.currentAccount?.ethereumAddress === address) this.nftSubject.next(this.nftMap[address]);
        }
        console.info(error);
      }
    }));
  }

  changeSettings({ address, settings }: RequestSettingsChangePayload) {
    this.settingsChanged.add(address);
    if (!this.hideSettings[address]) this.hideSettings[address] = { airdrop: false, spam: true };

    const addressSettings = this.hideSettings[address];

    const isChanged = addressSettings.airdrop !== settings.airdrop || addressSettings.spam !== settings.spam;

    if (isChanged) {
      this.hideSettings[address] = { ...settings };

      void this.getNftForActiveNetworks(address, true);
    }

    this.settingsWrites = this.settingsWrites.then(() => this.settingsReady)
      .then(() => storage.set({ nftSettings: structuredClone(this.hideSettings) }))
      .catch((error) => console.info('Unable to save NFT settings', error));
  }

  async sendNft(tx: RequestNftTransfer): Promise<ResponseNftTransfer> {
    const res = await this.checkSend(tx);
    if (res.error) return {
      status: false,
      errors: [{ message: res.error, code: res.error === 'insufficientFunds' ? BasicTxErrorCode.BALANCE_TO_LOW : BasicTxErrorCode.INVALID_PARAM }],
    };
    const { from, contract: contractAddress } = tx;
    const api = this.state.getEvmApi(tx.network)?.api;
    const contract = await this.state.evmContractService.getContract(contractAddress, api, tx.type === 'ERC721' ? 'ERC721' : 'ERC1155');
    this.state.keyringService.unlockPair(from);

    const { privateKey } = this.state.keyringService.accountExportPrivateKey({ address: from });
    const signer = new Wallet(privateKey, api);
    const contractMaster = contract.connect(signer) as Contract;

    try {
      let txResponse;

      // The owner signs this transfer; granting the recipient operator rights
      // would let them drain the rest of the collection without another prompt.
      if (tx.type === 'ERC721')
        txResponse = await contractMaster['safeTransferFrom(address,address,uint256)'](from, tx.to, tx.tokenId);
      else if (tx.type === 'ERC1155')
        txResponse = await contractMaster['safeTransferFrom(address,address,uint256,uint256,bytes)'](
          from,
          tx.to,
          tx.tokenId,
          1,
          '0x'
        );

      void txResponse.wait().then(() => this.getNftForActiveNetworks(from, true)).catch((error: unknown) => console.info('NFT confirmation unavailable', error));

      return {
        errors: [],
        hash: txResponse.hash,
        status: true,
      };
    } catch (e) {
      console.info(e);
      return {
        errors: [],
        status: false,
      };
    }
  }

  async checkSend({ from, to, tokenId, network, contract: contractAddress, type }: NftTx): Promise<CheckNftResponse> {
    const unavailable: CheckNftResponse = { error: 'estimationFailed', fee: '', data: '0x' };
    if (!isAddress(to)) return { error: 'incorrectRecipient', fee: '', data: '0x' };
    if (!['ERC721', 'ERC1155'].includes(type) || !isAddress(from) || !isAddress(contractAddress)) return unavailable;

    try {
      const api = this.state.getEvmApi(network)?.api;
      if (!api) return unavailable;
      const networkJson = this.state.networkService.getNetworkJson(network);
      const utilityAsset = networkJson.assets.find((asset) => asset.isUtility);
      if (!utilityAsset) return unavailable;
      const account = this.state.keyringService.getSubstrateAddress(from);
      const tokenBalance = this.state.balanceService.getAccountBalance(account).find((item) =>
        item.symbol === utilityAsset.symbol && getBalanceItem(item.balances, network)?.id === utilityAsset.id
      );
      const balance = tokenBalance && getBalanceItem(tokenBalance.balances, network);
      if (!balance) return { error: 'insufficientFunds', fee: '', data: '0x' };

      const contract = await this.state.evmContractService.getContract(contractAddress, api, type as 'ERC721' | 'ERC1155');
      const data = type === 'ERC721'
        ? contract.interface.encodeFunctionData('safeTransferFrom(address,address,uint256)', [from, to, tokenId])
        : contract.interface.encodeFunctionData('safeTransferFrom(address,address,uint256,uint256,bytes)', [from, to, tokenId, 1, '0x']);
      const { maxFeePerGas, gasPrice } = await api.getFeeData();
      const price = maxFeePerGas ?? gasPrice;
      if (price === null || price < 0n) return unavailable;
      const gasLimit = await api.estimateGas({ from, to: contractAddress, data, value: 0n,
        ...(maxFeePerGas !== null ? { maxFeePerGas } : { gasPrice }) });
      if (gasLimit <= 0n) return unavailable;
      const fee = formatUnits(price * gasLimit);
      const spendable = new FPNumber(balance.transferable ?? 0);
      if (!spendable.isFinity() || spendable.isLessThan(new FPNumber(fee)))
        return { error: 'insufficientFunds', data, fee };
      return { data, fee };
    } catch (error) {
      console.info(error);
      return unavailable;
    }
  }

  publishNfts() {
    const address = this.state.currentAccount?.ethereumAddress;
    this.nftSubject.next(address ? this.nftMap[address] ?? {} : {});
  }

  nftSubscribe(id: string, port?: Port): ChainNftState {
    const cb = this.state.subscriptionService.createSubscription<'pri(nft.subscribe)'>(id, port);

    const nftSubscription = this.nftSubject.subscribe({
      next: (rs) => cb(rs),
    });

    this.state.subscriptionService.setUnsubscriptionHandle(id, () => nftSubscription.unsubscribe());

    port?.onDisconnect.addListener(() => this.state.subscriptionService.cancelSubscription(id));

    const account = this.state.currentAccount;

    if (!account || !account.ethereumAddress || !this.nftMap[account.ethereumAddress]) return {};

    return this.nftMap[account.ethereumAddress];
  }

  deleteSavedNfts(address: string) {
    const ethereumAddress = this.state.keyringService.getEthereumAddress(address);

    this.refreshTokens.delete(ethereumAddress);
    for (const sdk of Object.values(this.sdks)) delete sdk.timespan[ethereumAddress];
    delete this.nftMap[ethereumAddress];
  }
}
