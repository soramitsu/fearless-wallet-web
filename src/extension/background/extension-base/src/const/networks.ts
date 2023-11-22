export const PREP_NETWORKS_NAME: Record<string, string> = {
  'Integritee Network (Kusama)': 'Integritee Network',
  'integritee network (kusama)': 'Integritee Network',
};

export const getEvmApiKey = (url: string) => {
  const host = new URL(url).host;
  const keys: Record<string, string> = {
    'polygon-mainnet.blastapi.io': process.env.FL_BLAST_API_POLYGON_KEY,
    'polygon-testnet.blastapi.io': process.env.FL_BLAST_API_POLYGON_KEY,
    'bsc-mainnet.blastapi.io': process.env.FL_BLAST_API_BSC_KEY,
    'bsc-testnet.blastapi.io': process.env.FL_BLAST_API_BSC_KEY,
    'eth-mainnet.blastapi.io': process.env.FL_BLAST_API_ETHEREUM_KEY,
    'eth-goerli.blastapi.io': process.env.FL_BLAST_API_GOERLI_KEY,
    'eth-sepolia.blastapi.io': process.env.FL_BLAST_API_SEPOLIA_KEY,
    'moonbeam.blastapi.io': process.env.FL_BLAST_API_MOONBEAM_KEY,
    'moonriver.blastapi.io': process.env.FL_BLAST_API_MOONRIVER_KEY,
    'oktc-mainnet.blastapi.io': process.env.FL_BLAST_API_OKTC_MAINNET_KEY,
    'optimism-mainnet.blastapi.io': process.env.FL_BLAST_API_OPTIMISM_MAINNET_KEY,
  };

  return keys[host];
};
