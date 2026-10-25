export type AlchemyNetwork =
  | 'eth-mainnet'
  | 'eth-sepolia'
  | 'opt-mainnet'
  | 'arb-mainnet'
  | 'polygon-mainnet'
  | 'polygon-mumbai';

export const NFT_FILTERS = {
  AIRDROPS: 'AIRDROPS',
  SPAM: 'SPAM',
} as const;

export type NftFilter = (typeof NFT_FILTERS)[keyof typeof NFT_FILTERS];

export const TEST_NFT_NETWORKS: Record<number, AlchemyNetwork> = {
  80001: 'polygon-mumbai',
  11155111: 'eth-sepolia',
};

export const PROD_NFT_NETWORKS: Record<number, AlchemyNetwork> = {
  1: 'eth-mainnet',
  10: 'opt-mainnet',
  42161: 'arb-mainnet',
  137: 'polygon-mainnet',
};

export const SUPPORTED_NFT_NETWORKS: Record<number, AlchemyNetwork> = {
  ...PROD_NFT_NETWORKS,
  ...TEST_NFT_NETWORKS,
};
