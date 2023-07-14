export const ALL_ACCOUNT_KEY = 'ALL';
export const ALL_NETWORK_KEY = 'all';

export const evmBlockExplorer: Record<string, string> = {
  ethereum: 'https://api.etherscan.io',
  ethereum_goerli: 'https://goerli.etherscan.io',
};

export const moonbeamBaseChains = ['moonbase', 'moonbeam', 'moonriver'];
export const IGNORE_GET_SUBSTRATE_FEATURES_LIST: string[] = [
  'astarEvm',
  'ethereum',
  'ethereum_goerli',
  'binance',
  'binance_test',
  'boba_rinkeby',
  'boba',
  'bobabase',
  'bobabeam',
];
