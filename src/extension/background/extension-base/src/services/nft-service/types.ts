import { type NftMetadata } from 'alchemy-sdk';

type NftMeta = Partial<NftMetadata>;
export type FearlessNft = {
  id: string;
  image?: string;
  type: string;
  isOwned: boolean;
  ownedBy: string;
  creator?: string;
  network: string;
  meta: NftMeta;
};

export type NftCollection = {
  name?: string;
  image?: string;
  network: string;
  address: string;
  total?: string;
  ownedNfts: FearlessNft[];
};

export type AvailableNftPayload = {
  contract: string;
  network: string;
  pageKey?: string;
};

export type AvailableNftResponse = {
  nfts: FearlessNft[];
  pageKey?: string;
};
export type NftState = Record<string, NftCollection>;

export type AvailableNftState = Record<string, { collection: FearlessNft[]; pageKey?: string }>;
export type NftTx = {
  type: string;
  contract: string;
  to: string;
  from: string;
  network: string;
  tokenId: string;
  password?: string;
};

export type CheckNftResponse = {
  fee: string;
  data: string;
  error?: 'unsufficientFunds' | 'incorrenctRecipient';
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
