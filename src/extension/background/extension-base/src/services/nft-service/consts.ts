import { Network } from 'alchemy-sdk';

const testNets: Record<number, Network> = {
  80001: Network.MATIC_MUMBAI,
  11155111: Network.ETH_SEPOLIA,
};

export const PROD_NFT_NETWORKS: Record<number, Network> = {
  1: Network.ETH_MAINNET,
  10: Network.OPT_MAINNET,
  42161: Network.ARB_MAINNET,
  137: Network.MATIC_MAINNET,
  ...testNets,
};
