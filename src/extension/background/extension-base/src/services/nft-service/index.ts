import { type Network } from 'alchemy-sdk';
import NftStore from '@extension-base/stores/Nfts';
import { Subject } from 'rxjs';
import { createSubscription, unsubscribe } from '@extension-base/background/handlers/subscriptions';
import AlchemyNftController from '@extension-base/services/nft-service/handlers/AlchemyNftSdk';
import { PROD_NFT_NETWORKS } from '@extension-base/services/nft-service/consts';
import { storage } from '@extension-base/stores/Storage';
import { getContract } from '@extension-base/api/evm/utils/eth';
import { parseEther, formatUnits, Wallet, type Contract } from 'ethers';
import {
  BasicTxErrorCode,
  type Port,
  type RequestNftTransfer,
  type ResponseNftTransfer,
} from '@extension-base/background/types/types';
import { getBalanceItem, getSubstrateAddress } from '@extension-base/background/utils/utils';
import { FPNumber } from '@sora-substrate/util';
import type { CheckNftResponse, NftSettings, NftState, NftTx } from '@extension-base/services/nft-service/types';
import type State from '@extension-base/background/handlers/State';
import { VALID_ETHEREUM_ADDRESS } from '@/consts/networks';

export class NftService {
  private store: NftStore;
  private sdks: Partial<Record<Network, AlchemyNftController>> = {};
  private nftMap: Record<string, NftState> = {};
  public nftSubject = new Subject<Record<string, NftState>>();

  hideSettings: NftSettings = {
    spam: true,
    airdrop: true,
  };

  constructor(public state: State) {
    Object.entries(PROD_NFT_NETWORKS).forEach(([chainId, network]) => {
      this.sdks[network] = new AlchemyNftController(network, chainId, this);
    });

    this.store = new NftStore();
    this.init();
  }

  async init() {
    const { nftSettings } = await storage.get(['nftSettings']);
    if (nftSettings) this.hideSettings = nftSettings;

    const account = await this.state.currentAccount;
    if (account) this.getNftForAllNetworks(account.ethereumAddress);
  }

  async fetchNfts() {
    const account = await this.state.currentAccount;
    if (account) this.getNftForAllNetworks(account.ethereumAddress);
  }

  async getNftForAllNetworks(address: string) {
    const networks = Object.keys(this.sdks) as Network[];
    let nfts: NftState = {};

    for (const network of networks) {
      if (this.sdks[network]) {
        const timespan = this.sdks[network]!.timespan;

        if (Date.now() - timespan > 30000 || timespan === Number.MAX_VALUE) {
          const networkNfts = await this.sdks[network]?.fetchNftsForWallet(address);
          this.sdks[network]!.timespan = Date.now();
          nfts = { ...nfts, ...networkNfts };
        }
      }
    }

    this.nftMap[address] = nfts;
    this.nftSubject.next(this.nftMap);
  }

  changeSettings(settings: NftSettings) {
    const isChanged = this.hideSettings.airdrop !== settings.airdrop || this.hideSettings.spam !== settings.spam;

    if (isChanged) {
      this.hideSettings = settings;

      this.state.currentAccount.then((account) => {
        if (account) this.getNftForAllNetworks(account.ethereumAddress);
      });
    }

    storage.set({ nftSettings: this.hideSettings });
  }

  async sendNft(tx: RequestNftTransfer): Promise<ResponseNftTransfer> {
    const { from, contract: contractAddress } = tx;
    const api = this.state.getEvmApi(tx.network);
    const contract = await getContract(contractAddress, api, 'erc721');
    const pair = this.state.keyringService.getPair(from);

    if (pair?.isLocked) {
      const isUnlock = this.state.keyringService.unlockPair(pair, tx.password);

      if (!isUnlock) {
        return { status: false, errors: [{ message: 'Invalid password', code: BasicTxErrorCode.INVALID_PASSWORD }] };
      }
    }

    try {
      const res = await this.checkSend(tx);

      if (res.error) {
        return { status: false, errors: [{ message: 'Balance to low', code: BasicTxErrorCode.BALANCE_TO_LOW }] };
      }

      const { privateKey } = this.state.accountExportPrivateKey({ address: from, password: tx.password });
      const signer = new Wallet(privateKey, api);
      const isApproved: boolean = await contract.isApprovedForAll(contract, tx.to);

      const contractMaster = contract.connect(signer) as Contract;

      if (!isApproved) {
        await contractMaster.setApprovalForAll(tx.to, true);
      }

      await contractMaster['safeTransferFrom(address,address,uint256)'](from, tx.to, tx.tokenId);

      return {
        errors: [],
        status: true,
      };
    } catch (e) {
      console.info(e);

      return {
        errors: [],
        status: false,
      };
    }

    return {
      errors: [],
      status: true,
    };
  }

  async checkSend({ from, tokenId, network, contract: contractAddress }: NftTx): Promise<CheckNftResponse> {
    const api = this.state.getEvmApi(network);
    const networkJson = this.state.getNetworkByKey(network);
    const utilityAsset = networkJson.assets.find((el) => el.isUtility)!;
    const contract = await getContract(contractAddress, api, 'erc721');
    const feeData = await api.getFeeData();
    const substrateAddress = getSubstrateAddress(from, this.state);

    const accountBalance = this.state.balanceService.getAccountBalance(substrateAddress);
    const tokenBalance = accountBalance.find((el) => el.symbol === utilityAsset.symbol);
    if (!tokenBalance) return { error: 'unsufficientFunds', fee: '0' };
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
        ...feeData,
      });
      const block = await api.provider.getBlock('latest');
      const baseFeePerGas = block?.baseFeePerGas ?? BigInt(0);
      const maxFeePerGas = feeData.maxPriorityFeePerGas ?? BigInt(0);
      const prepGasPrice = baseFeePerGas + maxFeePerGas;
      const estimateFee = prepGasPrice * gasLimit;
      const formatFees = formatUnits(estimateFee);
      const isUnsufficientFunds = new FPNumber(formatFees).isGreaterThan(new FPNumber(balance?.total ?? 0));

      if (isUnsufficientFunds) {
        return {
          error: 'unsufficientFunds',
          fee: formatFees,
        };
      }

      return {
        fee: formatUnits(estimateFee),
      };
    } catch (e) {
      return {
        fee: '0.0',
      };
    }
  }

  async nftSubscribe(id: string, port: Port): Promise<NftState> {
    const cb = createSubscription<'pri(nft.subscribe)'>(id, port);

    const subscription = this.nftSubject.subscribe((nfts: Record<string, NftState>): void => {
      this.state.currentAccount.then((account) => {
        if (account?.ethereumAddress && nfts?.[account.ethereumAddress]) {
          return cb(nfts[account.ethereumAddress]);
        }
      });
    });

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });

    const account = await this.state.currentAccount;

    if (!account || !account.ethereumAddress || !this.nftMap[account.ethereumAddress]) return {};

    return this.nftMap[account.ethereumAddress];
  }
}
