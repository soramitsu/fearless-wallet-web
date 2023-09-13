import { JsonRpcProvider, WebSocketProvider } from 'ethers';

export const initWeb3Api = (url: string): JsonRpcProvider | WebSocketProvider => {
  if (url.startsWith('http')) return new JsonRpcProvider(url);

  return new WebSocketProvider(url);
};
