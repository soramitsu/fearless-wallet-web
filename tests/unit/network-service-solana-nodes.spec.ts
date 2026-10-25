import { describe, expect, it, vi } from 'vitest';

import { NetworkService } from '@extension-base/services/network-service';
import type { NetworkJson } from '@extension-base/types';

const solanaNetwork = (overrides: Partial<NetworkJson> = {}) =>
  ({
    active: true,
    chainId: 'solana:mainnet-beta',
    assets: [],
    currentProvider: 'rpc',
    customNodes: [],
    ecosystem: 'solana',
    key: 'Solana',
    name: 'Solana',
    nodes: [],
    providers: {},
    ...overrides,
  }) as unknown as NetworkJson;

const serviceWith = (network: NetworkJson) => {
  const substrateApiHandler = { api: {} as Record<string, unknown>, initApi: vi.fn() };
  const service = Object.assign(Object.create(NetworkService.prototype), {
    evmApiHandler: { initEvmApi: vi.fn() },
    networkMap: { [network.name]: network },
    networkPreferenceRevision: {},
    preferenceRevision: 0,
    networkMapStore: {
      updateAndWait: vi.fn(async (_key, update, publish) => { publish(update({ [network.name]: network })); }),
      getSubject: () => ({ next: vi.fn() }),
    },
    substrateApiHandler,
    tonApiHandler: { initApi: vi.fn() },
    updateNetworkStore: vi.fn(),
  }) as NetworkService;

  return { service, substrateApiHandler };
};

describe('saving a Solana node', () => {
  it('stores the custom node without opening a Substrate connection', async () => {
    const { service, substrateApiHandler } = serviceWith(solanaNetwork());
    const customNodes = [{ name: 'My node', url: 'https://solana.example/rpc' }];

    await expect(service.upsertNetworkMap(solanaNetwork({ currentProvider: 'https://solana.example/rpc', customNodes }))).resolves.toBeUndefined();

    expect(service.networkMap.Solana.customNodes).toEqual(customNodes);
    expect(service.networkMap.Solana.currentProvider).toBe('https://solana.example/rpc');
    expect(substrateApiHandler.initApi).not.toHaveBeenCalled();
  });
});
