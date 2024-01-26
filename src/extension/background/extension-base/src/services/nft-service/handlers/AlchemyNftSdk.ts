import { type Network, Alchemy, NftFilters } from 'alchemy-sdk';
import { type NftState } from '@extension-base/services/nft-service/types';
import { type NftService } from '@/extension/background/extension-base/src/services/nft-service';

export default class AlchemyNftController {
  sdk: Alchemy;
  chainId: number;
  nftService: NftService;
  constructor(private network: Network, chainId: string, nftService: NftService) {
    this.sdk = new Alchemy({
      apiKey: process.env.FL_ALCHEMY_API_ETHEREUM_KEY,
      network,
    });
    this.nftService = nftService;
    this.chainId = +chainId;
  }

  async getChainId() {
    const chainId = (await this.sdk.core.getNetwork()).chainId;

    return chainId;
  }

  get excludeFilters() {
    const filters: NftFilters[] = [];

    if (this.nftService.hideSettings.airdrop) filters.push(NftFilters.AIRDROPS);
    if (this.nftService.hideSettings.spam) filters.push(NftFilters.SPAM);

    return filters;
  }

  getNfts(address: string) {
    return this.sdk.nft.getNftsForOwner(address, {
      excludeFilters: this.excludeFilters,
    });
  }

  getCollectionsForOwner(address: string) {
    return this.sdk.nft.getContractsForOwner(address, { excludeFilters: this.excludeFilters });
  }

  async fetchNftsForWallet(address: string): Promise<NftState> {
    const ownedNfts = await this.getNfts(address);
    const collections = await this.getCollectionsForOwner(address);

    const network = Object.values(this.nftService.state.networkMap).find(
      (net) => net.chainId === this.chainId.toString()
    );
    const ownedCollections: NftState = {};

    for (const nft of ownedNfts.ownedNfts) {
      const address = nft.contract.address;
      const collection = collections.contracts.find((contract) => contract.address === address);

      if (collection && !ownedCollections[address]) {
        //init Collection
        ownedCollections[address] = {
          name: collection.openSeaMetadata.collectionName ?? collection.name ?? collection.displayNft.name ?? '',
          address: collection.address,
          image: collection.openSeaMetadata.imageUrl ?? collection.image.cachedUrl,
          network: network?.name ?? this.network,
          ownedNfts: [],
        };
      }

      const prepImg =
        nft.contract.openSeaMetadata.imageUrl ?? nft.image.originalUrl ?? nft.image.cachedUrl ?? nft.image.pngUrl;
      ownedCollections[address].ownedNfts.push({
        id: nft.tokenId,
        isOwned: true,
        meta: {
          description: nft.description,
          name: nft.name,
        }, //todo fill the req meta
        type: nft.tokenType,
        image: prepImg,
        creator: '',
        network: network?.name ?? this.network,
        ownedBy: address,
      });
    }

    return ownedCollections;
  }
}
