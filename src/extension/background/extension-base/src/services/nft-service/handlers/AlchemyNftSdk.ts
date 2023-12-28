import { type Network, Alchemy, NftFilters } from 'alchemy-sdk';
import { type NftState } from '@extension-base/services/nft-service/types';
// import type { FearlessNft } from '@extension-base/services/nft-service/types';

export default class AlchemyNftController {
  sdk: Alchemy;

  constructor(private network: Network) {
    this.sdk = new Alchemy({
      apiKey: process.env.FL_ALCHEMY_API_ETHEREUM_KEY,
      network,
    });
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

  async fetchNftsForWallet(address: string): Promise<NftState> {
    const ownedNfts = await this.getNfts(address);
    const collections = await this.getCollectionsForOwner(address);

    const ownedCollections: NftState = {};

    for (const nft of ownedNfts.ownedNfts) {
      const address = nft.contract.address;
      const collection = collections.contracts.find((contract) => contract.address === address);

      if (collection && !ownedCollections[address]) {
        //init Collection
        ownedCollections[address] = {
          name: collection.openSeaMetadata.collectionName,
          address: collection.address,
          image: collection.openSeaMetadata.imageUrl ?? collection?.image.cachedUrl,
          network: this.network,
          ownedNfts: [],
        };
      }

      ownedCollections[address].ownedNfts.push({
        id: nft.tokenId,
        isOwned: true,
        meta: {
          description: nft.description,
        }, //todo fill the req meta
        type: nft.tokenType,
        img: nft.image.originalUrl ?? nft.image.cachedUrl,
      });
    }

    return ownedCollections;
  }
}
