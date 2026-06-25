import { getTonApiBaseUrl } from '@extension-base/services/network-service/handlers/TonApiHandler';
import type { NetworkJson } from '@extension-base/types';
import { UNIVERSAL_WALLET_INDEXERS } from '@/consts/universalWallet';

const network = (name: string, url?: string): Pick<NetworkJson, 'name' | 'nodes'> =>
  ({
    name,
    nodes: url === undefined ? [] : [{ name: 'configured', url }],
  }) as Pick<NetworkJson, 'name' | 'nodes'>;

describe('TonApiHandler URL selection', () => {
  it('uses the shared TI URL for TON mainnet even when network config contains a stale URL', () => {
    expect(getTonApiBaseUrl(network('TON Mainnet', 'https://stale-ton.example.com'))).toBe(UNIVERSAL_WALLET_INDEXERS.ton);
  });

  it('keeps explicit non-mainnet TON URLs for isolated QA networks', () => {
    expect(getTonApiBaseUrl(network('TON Testnet', 'https://testnet.ton.example.com'))).toBe(
      'https://testnet.ton.example.com'
    );
  });

  it('rejects non-mainnet TON networks without an explicit URL', () => {
    expect(() => getTonApiBaseUrl(network('TON Testnet'))).toThrow('missing_ton_api_base_url');
  });
});
