import { JsonRpcProvider, WebSocketProvider } from 'ethers';
import { type EvmApiProps, type EvmProvider } from '@extension-base/background/types/types';
import { getEvmApiKey } from '@extension-base/const/networks';
import { state } from '@extension-base/background/handlers';

const initListeners = (provider: EvmProvider, key: string) => {
  provider.on('error', () => {
    provider.removeAllListeners();
    provider.destroy();

    delete state.apis.evm[key];
  });
};

export const initWeb3Api = (url: string, key: string): EvmApiProps => {
  const apiKey = getEvmApiKey(url);
  const providerUrl = `${url}${apiKey ?? ''}`;

  const provider = url.startsWith('http')
    ? new JsonRpcProvider(providerUrl, undefined, {
        batchStallTime: 10,
        batchMaxCount: 30,
      })
    : new WebSocketProvider(providerUrl);

  initListeners(provider, key);

  return {
    api: provider,
    timeout: {},
  };
};
