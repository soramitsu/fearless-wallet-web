import { JsonRpcProvider } from 'ethers';

export const initWeb3Api = (url: string): JsonRpcProvider => {
  return new JsonRpcProvider(url);
};
