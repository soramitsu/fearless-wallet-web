import { JsonRpcProvider, WebSocketProvider } from 'ethers';
import { type EvmApiProps } from '@extension-base/background/types/types';
import { getEvmApiKey } from '@extension-base/const/networks';
import { type NetworkService } from '@extension-base/services';
import { type NetworkJson } from '@extension-base/types';
import { getCurrentProvider } from '@extension-base/utils';

export class EvmApiHandler {
  readonly networkService: NetworkService;
  api: Record<string, EvmApiProps> = {};

  constructor(networkService: NetworkService) {
    this.networkService = networkService;
  }

  refreshEvmApi(network: string) {
    this.initEvmApi(this.networkService.networkMap[network]);
  }

  initEvmApi(network: NetworkJson | undefined) {
    if (network === undefined) return;

    const { name } = network;
    const currentProvider = getCurrentProvider(network);

    if (currentProvider) this.api[name.toLowerCase()] = this.initApi(currentProvider);
  }

  private initApi(url: string): EvmApiProps {
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
