import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { type NetworkJson } from '@extension-base/types';
import { TonApiClient } from '@ton-api/client';
import type { TonApiProps } from './../../../background/types/types';
import type { NetworkName } from '@/interfaces';
import type State from '@extension-base/background/handlers/State';
import { UNIVERSAL_WALLET_INDEXERS } from '@/consts/universalWallet';
import { isTonMainnet } from '@/helpers';

export class TonApiHandler {
  api: Record<NetworkName, TonApiProps> = {};

  constructor(private state: State) {}

  async initApi(network: NetworkJson) {
    const apiKey = process.env.FL_WEB_TON_API_KEY;

    this.destroyApi(network.name);

    try {
      const baseUrl = getTonApiBaseUrl(network);

      const api = new TonApiClient({ baseUrl, apiKey });

      this.api[network.name.toLowerCase()] = {
        api,
        nodeIndex: 0,
        apiStatus: NETWORK_STATUS.CONNECTED,
      };

      return true;
    } catch (error) {
      console.error('[TON] Failed to initialize TonApiClient:', error);

      return false;
    }
  }

  destroyApi(network: string) {
    const networkLower = network.toLowerCase();

    delete this.api[networkLower];
  }
}

function getTonApiBaseUrl(network: Pick<NetworkJson, 'name' | 'nodes'>): string {
  if (isTonMainnet(network.name)) return UNIVERSAL_WALLET_INDEXERS.ton;

  const configuredUrl = network.nodes[0]?.url?.trim();

  if (!configuredUrl) throw new Error('missing_ton_api_base_url');

  return configuredUrl;
}

export { getTonApiBaseUrl };
