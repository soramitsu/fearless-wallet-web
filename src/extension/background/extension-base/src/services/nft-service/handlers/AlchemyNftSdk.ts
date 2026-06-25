import { type NftService } from '@extension-base/services/nft-service';
import type { AlchemyNetwork } from '@extension-base/services/nft-service/consts';
import type {
  AlchemyContractsForOwnerResponse,
  AlchemyNft,
  AlchemyNftsForContractResponse,
  AlchemyOwnedNftsResponse,
  AvailableNftResponse,
  FearlessNft,
  NftState,
} from '@extension-base/services/nft-service/types';
import type State from '@extension-base/background/handlers/State';
import { isSameString } from '@/helpers';

const DEFAULT_ALCHEMY_API_KEY = 'demo';
const ALCHEMY_NFT_API_VERSION = 'v3';
const IPFS_GATEWAY_URL = 'https://ipfs.io';

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type QueryParamValue = string | number | boolean | undefined | null | readonly string[];

const normalizeIpfsPath = (value: string, namespace: 'ipfs' | 'ipns') => {
  const path = value.slice(`${namespace}://`.length).replace(new RegExp(`^${namespace}/`), '');

  return path ? `${IPFS_GATEWAY_URL}/${namespace}/${path}` : undefined;
};

const sanitizeMediaUrl = (value?: string) => {
  const trimmed = value?.trim();

  if (!trimmed) return undefined;

  if (trimmed.startsWith('ipfs://')) return normalizeIpfsPath(trimmed, 'ipfs');
  if (trimmed.startsWith('ipns://')) return normalizeIpfsPath(trimmed, 'ipns');

  try {
    const url = new URL(trimmed);

    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
};

const firstSafeMediaUrl = (...values: (string | undefined)[]) => values.map(sanitizeMediaUrl).find(Boolean);

export default class AlchemyNftController {
  timespan: Record<string, number>;
  private readonly apiKey: string;
  private readonly fetchFn: FetchLike;

  constructor(
    private network: AlchemyNetwork,
    public chainId: string,
    private nftService: NftService,
    private state: State,
    fetchFn: FetchLike = globalThis.fetch.bind(globalThis)
  ) {
    this.apiKey = process.env.FL_WEB_ALCHEMY_API_ETHEREUM_KEY || DEFAULT_ALCHEMY_API_KEY;
    this.fetchFn = fetchFn;
    this.timespan = {};
  }

  get readableNetwork() {
    return (
      Object.values(this.state.networkService.networkMap).find(
        (net) => net.chainId.toLowerCase() === this.chainId.toString()
      )?.name ?? this.network
    );
  }

  getNfts(address: string) {
    return this.request<AlchemyOwnedNftsResponse>('getNFTsForOwner', {
      owner: address,
      excludeFilters: this.nftService.excludeFilters(address),
      withMetadata: true,
    });
  }

  getCollectionsForOwner(address: string) {
    return this.request<AlchemyContractsForOwnerResponse>('getContractsForOwner', {
      owner: address,
      excludeFilters: this.nftService.excludeFilters(address),
    });
  }

  convertNft(nft: AlchemyNft): FearlessNft {
    return {
      id: nft.tokenId,
      isOwned: false,
      meta: {
        description: nft.description,
        name: nft.name,
      },
      type: nft.tokenType ?? '',
      image: firstSafeMediaUrl(nft.image?.cachedUrl, nft.image?.pngUrl, nft.image?.originalUrl),
      creator: nft.mint?.mintAddress,
      network: this.readableNetwork,
      ownedBy: '',
      contentType: nft.image?.contentType,
    };
  }

  async getCollectionPage(contract: string, address: string, pageKey?: string): Promise<AvailableNftResponse> {
    try {
      const nfts = await this.request<AlchemyNftsForContractResponse>('getNFTsForContract', {
        contractAddress: contract,
        pageKey,
        withMetadata: true,
      });
      const ids = this.nftService.nftMap[address]?.[this.chainId]?.[contract]?.ownedNfts.map((el) => el.id) ?? [];
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

  async fetchNftsForWallet(ownerAddress: string): Promise<NftState> {
    const [ownedNfts, collections] = await Promise.all([
      this.getNfts(ownerAddress),
      this.getCollectionsForOwner(ownerAddress),
    ]);

    const network = Object.values(this.state.networkService.networkMap).find(({ chainId }) =>
      isSameString(chainId, this.chainId)
    );

    const ownedCollections: NftState = {};

    for (const nft of ownedNfts.ownedNfts) {
      const contractAddress = nft.contract.address;
      const collection = collections.contracts.find((contract) => isSameString(contract.address, contractAddress));

      if (!ownedCollections[contractAddress]) {
        ownedCollections[contractAddress] = {
          name:
            collection?.openSeaMetadata?.collectionName ??
            collection?.name ??
            collection?.displayNft?.name ??
            nft.contract.openSeaMetadata?.collectionName ??
            nft.contract.name ??
            '',
          address: collection?.address ?? contractAddress,
          isSpam: collection?.isSpam ?? nft.contract.isSpam,
          image: firstSafeMediaUrl(
            collection?.image?.cachedUrl,
            collection?.openSeaMetadata?.imageUrl,
            collection?.image?.originalUrl,
            collection?.image?.pngUrl,
            nft.contract.openSeaMetadata?.imageUrl,
            nft.image?.cachedUrl
          ),
          network: network?.name ?? this.network,
          total: collection?.totalSupply ?? nft.contract.totalSupply,
          ownedNfts: [],
        };
      }

      const prepImg = firstSafeMediaUrl(
        nft.image?.cachedUrl,
        nft.image?.pngUrl,
        nft.image?.originalUrl,
        nft.contract.openSeaMetadata?.imageUrl
      );

      ownedCollections[contractAddress].ownedNfts.push({
        id: nft.tokenId,
        isOwned: true,
        meta: {
          description: nft.description,
          name: nft.name,
        }, //todo fill the req meta
        type: nft.tokenType ?? '',
        image: prepImg,
        creator: nft.mint?.mintAddress,
        network: network?.name ?? this.network,
        ownedBy: ownerAddress,
        contentType: nft.image?.contentType,
      });
    }

    return ownedCollections;
  }

  private async request<T>(endpoint: string, params: Record<string, QueryParamValue>): Promise<T> {
    const url = new URL(
      `https://${this.network}.g.alchemy.com/nft/${ALCHEMY_NFT_API_VERSION}/${this.apiKey}/${endpoint}`
    );

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;

      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(`${key}[]`, item);
      } else {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await this.fetchFn(url, {
      headers: {
        'Alchemy-Ethers-Sdk-Method': endpoint,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');

      throw new Error(`Alchemy NFT ${endpoint} failed with ${response.status}: ${body.slice(0, 200)}`);
    }

    return response.json() as Promise<T>;
  }
}
