import { type Network } from 'alchemy-sdk';
import NftStore from '@extension-base/stores/Nfts';
import { Subject } from 'rxjs';
import { createSubscription, unsubscribe } from '@extension-base/background/handlers/subscriptions';
import AlchemyNftController from '@extension-base/services/nft-service/handlers/AlchemyNftSdk';
import { PROD_NFT_NETWORKS } from '@extension-base/services/nft-service/consts';
import { storage } from '@extension-base/stores/Storage';
import { getContract } from '@extension-base/api/evm/utils/eth';
import { parseEther, formatUnits } from 'ethers';
import type { NftSettings, NftState, NftTx } from '@extension-base/services/nft-service/types';
import type { Port } from '@extension-base/background/types/types';
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

  async getNftForAllNetworks(address: string) {
    const networks = Object.keys(this.sdks) as Network[];
    let nfts: NftState = {};

    for (const network of networks) {
      const networkNfts = await this.sdks[network]?.fetchNftsForWallet(address);
      nfts = { ...nfts, ...networkNfts };
    }

    this.nftMap[address] = nfts;

    this.nftSubject.next(this.nftMap);
  }

  changeSettings(settings: NftSettings) {
    const isChanged = this.hideSettings.airdrop !== settings.airdrop || this.hideSettings.spam !== settings.spam;

    if (isChanged) {
      this.hideSettings = settings;
      storage.set({ nftSettings: this.hideSettings });
      this.state.currentAccount.then((account) => {
        if (account) this.getNftForAllNetworks(account.ethereumAddress);
      });
    }
  }

  async sendNft(tx: NftTx) {
    // const { from, contract: contractAddress } = tx;
    // const api = this.state.getEvmApi(tx.network);
    // // const { privateKey } = this.state.accountExportPrivateKey({ address: from, password: '' });
    // // const signer = new Wallet(privateKey, api);

    // // const contract = await getContract(contractAddress, api, 'erc721');

    // const feeData = await api.getFeeData();
    // const data = contract.interface.encodeFunctionData('safeTransferFrom(address,address,uint256)', [
    //   from,
    //   to,
    //   tokenId,
    // ]);

    try {
      const checkTx = await this.checkSend(tx);

      if (!checkTx.isApproved) {
        // const contractMaster = contract.connect(signer) as Contract;
        // const approve = await contractMaster.setApprovalForAll(to, true);
        // const transaction = await contractMaster['safeTransferFrom(address,address,uint256)'](from, to, tokenId);
      }
    } catch (e) {
      console.info(e);

      return false;
    }

    // const fees = api.estimateGas({
    //   data,
    //   to,
    //   from,
    //   value: parseEther('0'),
    //   ...feeData,
    // });

    //Call the safetransfer method
    // const transaction = await contract['safeTransferFrom(address,address,uint256)'](from, to, tokenId, {
    //   gasLimit: parseEther('21000'),
    // });
    //Wait for the transaction to complete
    // await transaction.wait();
  }

  async checkSend({ from, tokenId, network, contract: contractAddress }: NftTx) {
    const api = this.state.getEvmApi(network);
    const contract = await getContract(contractAddress, api, 'erc721');
    const feeData = await api.getFeeData();
    const data = contract.interface.encodeFunctionData('safeTransferFrom(address,address,uint256)', [
      from,
      VALID_ETHEREUM_ADDRESS,
      tokenId,
    ]);

    try {
      const isApproved: boolean = await contract.isApprovedForAll(contract, VALID_ETHEREUM_ADDRESS);
      const fees = await api.estimateGas({
        data,
        to: VALID_ETHEREUM_ADDRESS,
        value: parseEther('0'),
        ...feeData,
      });

      return {
        isApproved,
        fee: formatUnits(fees, 'gwei'),
      };
    } catch (e) {
      return {
        isApproved: false,
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
