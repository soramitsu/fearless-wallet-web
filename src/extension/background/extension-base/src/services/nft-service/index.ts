import { Network, Alchemy, type Nft } from 'alchemy-sdk';
import NftStore from '@extension-base/stores/Nfts';
import { Subject } from 'rxjs';

export class NftService {
  sdk: Alchemy;
  store: NftStore;
  private nftMap: Record<string, Nft> = {};
  public nftSubject = new Subject<Nft[]>();

  constructor() {
    this.sdk = new Alchemy({
      apiKey: process.env.FL_ALCHEMY_API_ETHEREUM_KEY,
      network: Network.ETH_MAINNET,
    });
    this.store = new NftStore();
  }

  async getNfts(address: string) {
    return this.sdk.nft.getNftsForOwner(address);
  }
}
