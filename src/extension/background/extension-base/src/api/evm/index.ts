import { JsonRpcProvider, WebSocketProvider } from 'ethers';
import { EvmProvider } from '@extension-base/background/types/types';
import { getEvmApiKey } from '@extension-base/const/networks';

const initListeners = (provider: EvmProvider) => {
  provider.on('error', () => {
    provider.removeAllListeners();
    provider.destroy();
  });
};

export const initWeb3Api = (url: string): EvmProvider => {
  const apiKey = getEvmApiKey(url);
  const providerUrl = `${url}${apiKey ?? ''}`;
  const provider = url.startsWith('http') ? new JsonRpcProvider(providerUrl) : new WebSocketProvider(providerUrl);

  initListeners(provider);

  return provider;
};
