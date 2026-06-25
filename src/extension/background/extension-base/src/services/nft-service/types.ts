type NftMeta = Record<string, unknown>;

export type AlchemyNftImage = {
  cachedUrl?: string;
  originalUrl?: string;
  pngUrl?: string;
  contentType?: string;
};

export type AlchemyOpenSeaMetadata = {
  collectionName?: string;
  imageUrl?: string;
};

export type AlchemyNftContract = {
  address: string;
  name?: string;
  tokenType?: string;
  totalSupply?: string;
  openSeaMetadata?: AlchemyOpenSeaMetadata;
};

export type AlchemyNftContractForOwner = AlchemyNftContract & {
  displayNft?: {
    name?: string;
  };
  image?: AlchemyNftImage;
  isSpam?: boolean;
};

export type AlchemyNft = {
  contract: AlchemyNftContract & {
    isSpam?: boolean;
    spamClassifications?: string[];
  };
  tokenId: string;
  tokenType?: string;
  name?: string;
  description?: string;
  image?: AlchemyNftImage;
  mint?: {
    mintAddress?: string;
  };
};

export type AlchemyOwnedNft = AlchemyNft & {
  balance?: string;
};

export type AlchemyOwnedNftsResponse = {
  ownedNfts: AlchemyOwnedNft[];
  pageKey?: string;
  totalCount: number;
  validAt?: unknown;
};

export type AlchemyContractsForOwnerResponse = {
  contracts: AlchemyNftContractForOwner[];
  pageKey?: string;
  totalCount: number;
};

export type AlchemyNftsForContractResponse = {
  nfts: AlchemyNft[];
  pageKey?: string;
};

export type FearlessNft = {
  id: string;
  type: string;
  isOwned: boolean;
  ownedBy: string;
  creator?: string;
  network: string;
  meta: NftMeta;
  image?: string;
  contentType?: string;
};

export type NftCollection = {
  name?: string;
  image?: string;
  network: string;
  address: string;
  total?: string;
  isSpam?: boolean;
  ownedNfts: FearlessNft[];
};

export type AvailableNftPayload = {
  contract: string;
  network: string;
  address: string;
  pageKey?: string;
};

export type AvailableNftResponse = {
  nfts: FearlessNft[];
  pageKey?: string;
};

export type NftState = Record<string, NftCollection>;
export type ChainNftState = Record<string, NftState>;

export type AvailableNftState = Record<string, { collection: FearlessNft[]; pageKey?: string }>;

export type NftTx = {
  type: string;
  contract: string;
  to: string;
  from: string;
  network: string;
  tokenId: string;
};

export type CheckNftResponse = {
  fee: string;
  data: string;
  error?: 'insufficientFunds' | 'incorrectRecipient';
};

export type NftSettings = {
  spam: boolean;
  airdrop: boolean;
};

export type RequestSettingsChangePayload = {
  settings: NftSettings;
  address: string;
};

export type NftStoreState = {
  nfts: NftState;
  settings: NftSettings;
};
