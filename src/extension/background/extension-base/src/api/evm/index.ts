import { JsonRpcProvider } from 'ethers';

export const initWeb3Api = (url: string): JsonRpcProvider => {
  if (url === 'https://bsc-dataseed.binance.org/') return new JsonRpcProvider(url, { name: 'binance', chainId: 56 });

  return new JsonRpcProvider(url);
};
