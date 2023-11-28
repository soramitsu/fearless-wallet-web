import { Network, Alchemy, NftFilters } from 'alchemy-sdk';
import NftStore from '@extension-base/stores/Nfts';
import { Subject } from 'rxjs';
import { createSubscription, unsubscribe } from '@extension-base/background/handlers/subscriptions';
import type { FearlessNft } from '@extension-base/services/nft-service/types';
import type { Port } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';

export class NftService {
  store: NftStore;
  sdk: Alchemy;
  private network: Network;
  private nftMap: Record<string, FearlessNft> = {};
  public nftSubject = new Subject<FearlessNft[]>();
  private state: State;

  constructor(state: State, network: Network = Network.ETH_MAINNET) {
    this.network = network;
    this.state = state;
    state.currentAccount.then((res) => {
      if (res) this.fetchNftsForWallet(res.ethereumAddress);
    });
    this.sdk = new Alchemy({
      apiKey: process.env.FL_ALCHEMY_API_ETHEREUM_KEY,
      network: network,
    });

    this.store = new NftStore();
  }

  getNfts(address: string) {
    return this.sdk.nft.getNftsForOwner(address, {
      excludeFilters: [NftFilters.SPAM],
    });
  }

  getCollectionsForOwner(address: string) {
    return this.sdk.nft.getContractsForOwner(address, { excludeFilters: [NftFilters.SPAM] });
  }

  getNftCollection(address: string) {
    return this.sdk.nft.getNftsForContract(address);
  }

  async fetchNftsForWallet(address: string) {
    //fetch collections
    const { contracts } = await this.getCollectionsForOwner(address);
    //fetch nfts for collections
    const collections = await Promise.all(contracts.map((contract) => this.getNftCollection(contract.address)));
    //fetch owned nfts
    const ownedNfts = await this.getNfts(address);
    const ownedIds = ownedNfts.ownedNfts.map((nft) => nft.tokenId);

    const fearlessNft: Record<string, FearlessNft[]> = {};
    collections.forEach((collection) => {
      const contractAddress = collection.nfts[0].contract.address;

      fearlessNft[contractAddress] = collection.nfts.map<FearlessNft>(
        ({ tokenId, contract, image, raw, tokenType }) => {
          return {
            id: tokenId,
            contract: contract.address,
            img: image.originalUrl,
            type: tokenType,
            network: this.network,
            isOwned: ownedIds.some((id) => id === tokenId),
            meta: raw.metadata,
          };
        }
      );
    });
    //map info
    //save
  }

  async nftSubscribe(id: string, port: Port): Promise<FearlessNft[]> {
    const cb = createSubscription<'pri(nft.subscribe)'>(id, port);

    const subscription = this.nftSubject.subscribe((nfts: FearlessNft[]): void => {
      cb(nfts);
    });

    port.onDisconnect.addListener((): void => {
      unsubscribe(id);
      subscription.unsubscribe();
    });

    return Object.values(this.nftMap);
  }
}
