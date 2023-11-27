import { Network, Alchemy, type Nft } from 'alchemy-sdk';
import NftStore from '@extension-base/stores/Nfts';
import { Subject } from 'rxjs';
import type State from '@extension-base/background/handlers/State';
import {
  createSubscription,
  unsubscribe,
} from '@/extension/background/extension-base/src/background/handlers/subscriptions';
import { type Port } from '@/extension/background/extension-base/src/background/types/types';

export class NftService {
  store: NftStore;
  sdk: Alchemy;
  private nftMap: Record<string, Nft> = {};
  public nftSubject = new Subject<Nft[]>();
  private state: State;

  constructor(state: State) {
    this.state = state;

    this.sdk = new Alchemy({
      apiKey: process.env.FL_ALCHEMY_API_ETHEREUM_KEY,
      network: Network.ETH_MAINNET,
    });

    this.store = new NftStore();
  }

  getNfts(address: string) {
    return this.sdk.nft.getNftsForOwner(address);
  }

  getCollectionsForOwner(address: string) {
    return this.sdk.nft.getContractsForOwner(address);
  }

  getNftCollection(address: string) {
    return this.sdk.nft.getNftsForContract(address);
  }

  async fetchNftsForWallet(address: string) {
    //fetch collections
    const contracts = await this.getCollectionsForOwner(address);
    //fetch nfts for collections
    const collections = await Promise.all(contracts.contracts.map((el) => this.getNftCollection(el.address)));
    //fetch owned nfts
    const ownedNfts = this.getNfts(address);
    console.info(collections, ownedNfts);
    //map info
    //save
  }

  async nftSubscribe(id: string, port: Port): Promise<Nft[]> {
    const cb = createSubscription<'pri(nft.subscribe)'>(id, port);

    const subscription = this.nftSubject.subscribe((nfts: Nft[]): void => {
      cb(nfts);
    });

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });

    return Object.values(this.nftMap);
  }
}
