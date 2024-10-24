import { NftFilters, type Network } from 'alchemy-sdk';
import { Subject } from 'rxjs';
import { createSubscription, unsubscribe } from '@extension-base/services';
import AlchemyNftController from '@extension-base/services/nft-service/handlers/AlchemyNftSdk';
import { PROD_NFT_NETWORKS } from '@extension-base/services/nft-service/consts';
import { storage } from '@extension-base/stores/Storage';
import { getContract } from '@extension-base/api/evm/contracts';
import { parseEther, formatUnits, Wallet, type Contract } from 'ethers';
import {
  BasicTxErrorCode,
  type Port,
  type RequestNftTransfer,
  type ResponseNftTransfer,
} from '@extension-base/background/types/types';
import { FPNumber } from '@sora-substrate/util';
import { calcEvmFees } from '@extension-base/api/evm/transfer';
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
import { getBalanceItem } from '@/extension/background/extension-base/src/background/handlers/utils';
import { VALID_ETHEREUM_ADDRESS } from '@/consts/networks';

export class NftService {
  private refreshTime = 10000;
  private sdks: Record<string, AlchemyNftController> = {};
  public nftMap: Record<string, ChainNftState> = {};
  public nftSubject = new Subject<ChainNftState>();

  hideSettings: Record<string, NftSettings> = {};

  constructor(private state: State) {
    Object.entries(PROD_NFT_NETWORKS).forEach(([chainId, network]) => {
      this.sdks[network] = new AlchemyNftController(network, chainId, this, this.state);
    });

    this.init();
  }

  async init() {
    const { nftSettings } = await storage.get(['nftSettings']);

    if (nftSettings) this.hideSettings = nftSettings;
  }

  isNeedUpdate(address: string) {
    const networks = Object.keys(this.sdks) as Network[];

    for (const network of networks) {
      const timespan = this.sdks[network].timespan;

      if (!timespan[address] || timespan[address] + this.refreshTime < Date.now()) return true;
    }

    return false;
  }

  resetTime(address: string) {
    const networks = Object.keys(this.sdks) as Network[];

    for (const network of networks) {
      this.sdks[network].timespan[address] = Number.MAX_VALUE;
    }

    return false;
  }

  async fetchNfts(address?: string) {
    if (!address) return;

    this.getNftForActiveNetworks(address);
  }

  excludeFilters(address: string) {
    const filters: NftFilters[] = [];

    if (!this.hideSettings[address]) {
      this.hideSettings[address] = {
        airdrop: false,
        spam: true, //it's dummy for now
      };
    }

    if (this.hideSettings[address].airdrop) filters.push(NftFilters.AIRDROPS);

    return filters;
  }

  availableNftsForContract({ network, contract, address, pageKey }: AvailableNftPayload) {
    const net = this.state.networkService.getNetworkJson(network);
    const key = PROD_NFT_NETWORKS[+net.chainId];

    if (!this.sdks[key])
      return {
        nfts: [],
        pageKey: undefined,
      };

    return this.sdks[key].getCollectionPage(contract, address, pageKey);
  }

  async getNftForActiveNetworks(address: string, force = false) {
    const substrateAddress = this.state.keyringService.getSubstrateAddress(address);
    const activeNetworks = this.state.getActiveNetworksCurrentWallet(substrateAddress);
    const chainIds = Array.from(activeNetworks).map(({ chainId }) => chainId);
    const networks = Object.keys(this.sdks);

    for (const network of networks) {
      const sdk = this.sdks[network];

      if (!sdk || chainIds.every((el) => el !== sdk.chainId)) continue;

      const timespan = sdk.timespan;

      if (force || !timespan[address] || timespan[address] + this.refreshTime > Date.now()) {
        sdk.timespan[address] = Date.now();

        sdk.fetchNftsForWallet(address).then((networkNfts) => {
          if (!this.nftMap[address]) this.nftMap[address] = {};

          this.nftMap[address][sdk.chainId] = JSON.parse(JSON.stringify(networkNfts)) as NftState;

          if (this.state.currentAccount?.ethereumAddress === address) this.nftSubject.next(this.nftMap[address]);
        });
      }
    }
  }

  changeSettings({ address, settings }: RequestSettingsChangePayload) {
    if (!this.hideSettings[address]) this.hideSettings[address] = { airdrop: false, spam: true };

    const addressSettings = this.hideSettings[address];

    const isChanged = addressSettings.airdrop !== settings.airdrop || addressSettings.spam !== settings.spam;

    if (isChanged) {
      this.hideSettings[address] = settings;

      const currentAccount = this.state.currentAccount;

      if (currentAccount) this.getNftForActiveNetworks(currentAccount.ethereumAddress, true);
    }

    storage.set({ nftSettings: this.hideSettings });
  }

  async sendNft(tx: RequestNftTransfer): Promise<ResponseNftTransfer> {
    const { from, contract: contractAddress } = tx;
    const api = this.state.getEvmApi(tx.network)?.api;
    const contract = await getContract(contractAddress, api, tx.type === 'ERC721' ? 'ERC721' : 'ERC1155');
    const pair = this.state.keyringService.getPair(from);

    if (pair?.isLocked) {
      const isUnlock = this.state.keyringService.unlockPair(pair);

      if (!isUnlock)
        return { status: false, errors: [{ message: 'Invalid password', code: BasicTxErrorCode.INVALID_PASSWORD }] };
    }

    const res = await this.checkSend(tx);

    if (res.error)
      return { status: false, errors: [{ message: 'Balance to low', code: BasicTxErrorCode.BALANCE_TO_LOW }] };

    const { privateKey } = this.state.keyringService.accountExportPrivateKey({ address: from });
    const signer = new Wallet(privateKey, api);
    const isApproved: boolean = await contract.isApprovedForAll(contract, tx.to);
    const contractMaster = contract.connect(signer) as Contract;

    try {
      let txResponse;

      if (!isApproved) await contractMaster.setApprovalForAll(tx.to, true);

      if (tx.type === 'ERC721')
        txResponse = await contractMaster['safeTransferFrom(address,address,uint256)'](from, tx.to, tx.tokenId);
      else if (tx.type === 'ERC1155')
        txResponse = await contractMaster['safeTransferFrom(address,address,uint256,uint256,bytes)'](
          from,
          tx.to,
          tx.tokenId,
          1,
          res.data
        );

      txResponse.wait().then(() => this.getNftForActiveNetworks(from, true));

      return {
        errors: [],
        hash: txResponse.hash,
        status: true,
      };
    } catch (e) {
      console.info(e);
      await contractMaster.setApprovalForAll(tx.to, false);

      return {
        errors: [],
        status: false,
      };
    }
  }

  async checkSend({ from, tokenId, network, contract: contractAddress, type }: NftTx): Promise<CheckNftResponse> {
    const api = this.state.getEvmApi(network)?.api;
    if (!api) throw new Error('API not found');
    const networkJson = this.state.networkService.getNetworkJson(network);
    const utilityAsset = networkJson.assets.find((el) => el.isUtility)!;
    const contract = await getContract(contractAddress, api, type === 'ERC721' ? 'ERC721' : 'ERC1155');
    const feeData = await api.getFeeData();
    const substrateAddress = this.state.keyringService.getSubstrateAddress(from);

    const accountBalance = this.state.balanceService.getAccountBalance(substrateAddress);
    const tokenBalance = accountBalance.find((el) => el.symbol === utilityAsset.symbol && el.relayChain === 'ethereum');

    if (!tokenBalance) return { error: 'insufficientFunds', fee: '0', data: '0x' };

    const balance = getBalanceItem(tokenBalance.balances, network);

    const data = contract.interface.encodeFunctionData('safeTransferFrom(address,address,uint256)', [
      from,
      VALID_ETHEREUM_ADDRESS,
      tokenId,
    ]);

    try {
      const gasLimit = await api.estimateGas({
        data,
        to: VALID_ETHEREUM_ADDRESS,
        value: parseEther('0'),
        maxFeePerGas: feeData.maxFeePerGas,
      });

      const block = await api.provider.getBlock('latest');

      const estimateFee = calcEvmFees(feeData.maxFeePerGas ?? feeData.gasPrice, block?.baseFeePerGas, gasLimit);
      const formatFees = formatUnits(estimateFee);

      const isInsufficientFunds = new FPNumber(formatFees).isGreaterThan(new FPNumber(balance?.total ?? 0));

      if (isInsufficientFunds)
        return {
          error: 'insufficientFunds',
          data,
          fee: formatFees,
        };

      return {
        data,
        fee: formatUnits(estimateFee),
      };
    } catch (e) {
      console.info(e);

      return {
        data,
        fee: '0.0',
      };
    }
  }

  publishNfts() {
    const account = this.state.currentAccount;

    if (account?.ethereumAddress) {
      const nfts = this.nftMap[account.ethereumAddress] ?? {};

      this.nftSubject.next(nfts);
    }
  }

  nftSubscribe(id: string, port: Port): ChainNftState {
    const cb = createSubscription<'pri(nft.subscribe)'>(id, port);

    const subscription = this.nftSubject.subscribe({
      next: (rs) => cb(rs),
    });

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });

    const account = this.state.currentAccount;

    if (!account || !account.ethereumAddress || !this.nftMap[account.ethereumAddress]) return {};

    return this.nftMap[account.ethereumAddress];
  }

  deleteSavedNfts(address: string) {
    const ethereumAddress = this.state.keyringService.getEthereumAddress(address);

    delete this.nftMap[ethereumAddress];
  }
}
