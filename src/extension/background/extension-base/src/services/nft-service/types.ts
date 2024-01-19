import { type NftMetadata } from 'alchemy-sdk';

type NftMeta = Partial<NftMetadata>;
export type FearlessNft = {
  id: string;
  img?: string;
  type: string;
  isOwned: boolean;
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
  network: string;
  tokenId: string;
};

export type NftSettings = {
  spam: boolean;
  airdrop: boolean;
};
