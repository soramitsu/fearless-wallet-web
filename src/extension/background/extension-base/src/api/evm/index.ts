import { JsonRpcProvider, WebSocketProvider } from 'ethers';
import { EvmProvider } from '@extension-base/background/types/types';

const initListeners = (provider: EvmProvider) => {
  provider.on('error', () => {
    provider.removeAllListeners();
    provider.destroy();
  });
};

export const initWeb3Api = (url: string): EvmProvider => {
  const provider = url.startsWith('http') ? new JsonRpcProvider(url) : new WebSocketProvider(url);
  initListeners(provider);

  return provider;
};
