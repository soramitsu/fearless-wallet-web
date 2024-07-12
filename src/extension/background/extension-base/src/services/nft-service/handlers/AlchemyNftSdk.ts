import { type Network, Alchemy, type Nft } from 'alchemy-sdk';
import { type NftService } from '@extension-base/services/nft-service';
import type { AvailableNftResponse, FearlessNft, NftState } from '@extension-base/services/nft-service/types';
import type State from '@extension-base/background/handlers/State';

export default class AlchemyNftController {
  sdk: Alchemy;
  timespan: Record<string, number>;

  constructor(private network: Network, public chainId: string, private nftService: NftService, private state: State) {
    this.sdk = new Alchemy({
      apiKey: process.env.FL_WEB_ALCHEMY_API_ETHEREUM_KEY,
      network,
    });

    this.timespan = {};
  }

  get readableNetwork() {
    return (
      Object.values(this.state.networkMap).find((net) => net.chainId.toLowerCase() === this.chainId.toString())?.name ??
      this.network
    );
  }

  getNfts(address: string) {
    return this.sdk.nft.getNftsForOwner(address, {
      excludeFilters: this.nftService.excludeFilters(address),
    });
  }

  getCollectionsForOwner(address: string) {
    return this.sdk.nft.getContractsForOwner(address, { excludeFilters: this.nftService.excludeFilters(address) });
  }

  convertNft(nft: Nft): FearlessNft {
    return {
      id: nft.tokenId,
      isOwned: false,
      meta: {
        description: nft.description,
        name: nft.name,
      },
      type: nft.tokenType,
      image: nft.image.cachedUrl ?? nft.image.pngUrl,
      creator: nft.mint?.mintAddress,
      network: this.readableNetwork,
      ownedBy: '',
      contentType: nft.image.contentType,
    };
  }

  async getCollectionPage(contract: string, address: string, pageKey?: string): Promise<AvailableNftResponse> {
    try {
      const nfts = await this.sdk.nft.getNftsForContract(contract, { pageKey });
      const ids = this.nftService.nftMap[address][this.chainId][contract].ownedNfts.map((el) => el.id);
      const fearlessNft: FearlessNft[] = [];

      for (const nft of nfts.nfts) {
        if (ids.some((id) => id === nft.tokenId)) continue;

        fearlessNft.push(this.convertNft(nft));
      }

      return { nfts: fearlessNft, pageKey: nfts.pageKey };
    } catch (e) {
      console.info(e);

      return { nfts: [], pageKey: undefined };
    }
  }

  async fetchNftsForWallet(address: string): Promise<NftState> {
    const ownedNfts = await this.getNfts(address);
    const collections = await this.getCollectionsForOwner(address);

    const network = Object.values(this.state.networkMap).find((net) => net.chainId === this.chainId.toString());
    const ownedCollections: NftState = {};

    for (const nft of ownedNfts.ownedNfts) {
      const address = nft.contract.address;
      const collection = collections.contracts.find((contract) => contract.address === address);

      if (collection && !ownedCollections[address]) {
        //init Collection

        ownedCollections[address] = {
          name: collection.openSeaMetadata.collectionName ?? collection.name ?? collection.displayNft.name ?? '',
          address: collection.address,
          isSpam: collection.isSpam,
          image: collection.openSeaMetadata.imageUrl ?? collection.image.cachedUrl,
          network: network?.name ?? this.network,
          total: collection.totalSupply,
          ownedNfts: [],
        };
      }

      const prepImg =
        nft.image.originalUrl ?? nft.image.cachedUrl ?? nft.image.pngUrl ?? nft.contract.openSeaMetadata.imageUrl;

      ownedCollections[address].ownedNfts.push({
        id: nft.tokenId,
        isOwned: true,
        meta: {
          description: nft.description,
          name: nft.name,
        }, //todo fill the req meta
        type: nft.tokenType,
        image: prepImg,
        creator: nft.mint?.mintAddress,
        network: network?.name ?? this.network,
        ownedBy: address,
        contentType: nft.image.contentType,
      });
    }

    return ownedCollections;
  }
}
