import { WebSocketProvider } from 'ethers';

export const initWeb3Api = (url: string): WebSocketProvider => {
  const api = new WebSocketProvider(url);

  return api;
};
