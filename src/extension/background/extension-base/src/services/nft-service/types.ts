import { type NftMetadata } from 'alchemy-sdk';

type NftMeta = Partial<NftMetadata>;
export type FearlessNft = {
  id: string;
  image?: string;
  type: string;
  isOwned: boolean;
  ownedBy: string;
  creator: string;
  network: string;
  meta: NftMeta;
};

export type NftCollection = {
  name?: string;
  image?: string;
  network?: string;
  address: string;
  ownedNfts: FearlessNft[];
};

export type NftState = Record<string, NftCollection>;

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
  isApproved: boolean;
  fee: string;
  error?: 'unsufficientFunds' | 'wrongpassword' | 'incorrenctRecipient';
};

export type NftSettings = {
  spam: boolean;
  airdrop: boolean;
};

export type NftStoreState = {
  nfts: NftState;
  settings: NftSettings;
};
