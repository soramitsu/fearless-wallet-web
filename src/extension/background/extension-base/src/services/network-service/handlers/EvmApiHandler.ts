import { JsonRpcProvider, WebSocketProvider } from 'ethers';
import { getEvmApiKey } from '@extension-base/const/networks';
import { getCurrentProvider } from '@extension-base/utils';
import type { NetworkMap } from '..';
import type { EvmApiProps } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';

export class EvmApiHandler {
  api: Record<string, EvmApiProps> = {};

  constructor(readonly networkMap: NetworkMap) {}

  refreshEvmApi(network: string) {
    this.initEvmApi(this.networkMap[network]);
  }

  initEvmApi(network: NetworkJson | undefined) {
    if (network === undefined) return;

    const { name } = network;
    const currentProvider = getCurrentProvider(network);

    if (currentProvider) this.api[name.toLowerCase()] = this.createEvmProvider(currentProvider);
  }

  private createEvmProvider(url: string): EvmApiProps {
    const apiKey = getEvmApiKey(url);
    const providerUrl = `${url}${apiKey ?? ''}`;

    const provider = url.startsWith('http')
      ? new JsonRpcProvider(providerUrl, undefined, {
          batchStallTime: 10,
          batchMaxCount: 30,
        })
      : new WebSocketProvider(providerUrl);

    return {
      api: provider,
      timeout: {},
    };
  }
}
