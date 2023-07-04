import { WebSocketProvider } from 'ethers';

export const initWeb3Api = (url: string): WebSocketProvider => {
  return new WebSocketProvider(url);
};
