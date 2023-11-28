import { type NftMetadata } from 'alchemy-sdk';

type NftMeta = Partial<NftMetadata>;
export type FearlessNft = {
  id: string;
  contract: string;
  img?: string;
  type: string;
  isOwned: boolean;

  meta: NftMeta;
};
