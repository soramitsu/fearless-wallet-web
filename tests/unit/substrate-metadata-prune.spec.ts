import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetworkService } from '@extension-base/services/network-service';
import { substrateMetadataCache } from '@extension-base/stores/SubstrateMetadataCache';
import type { KeyringService } from '@extension-base/services';
import type State from '@extension-base/background/handlers/State';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('@extension-base/stores/NetworkMap', () => ({
  default: class {
    getAndWait = vi.fn().mockResolvedValue(undefined);
    updateAndWait = vi.fn().mockResolvedValue(undefined);
    getSubject() { return { next() {} }; }
  },
}));
vi.mock('@extension-base/stores/SelectedNetworkStore', () => ({
  default: class {
    getAndWait = vi.fn().mockResolvedValue({});
    set = vi.fn();
  },
}));
vi.mock('@extension-base/services/network-service/handlers/EvmApiHandler', () => ({ EvmApiHandler: class {} }));
vi.mock('@extension-base/services/network-service/handlers/SubstrateApiHandler', () => ({ SubstrateApiHandler: class {} }));
vi.mock('@extension-base/services/network-service/handlers/TonApiHandler', () => ({ TonApiHandler: class {} }));

const POLKADOT = '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3';
const entry = (name: string, chainId: string) => ({
  name, chainId, ecosystem: 'substrate', disabled: false,
  assets: [{ id: `${name}-asset`, symbol: name.slice(0, 3).toUpperCase(), precision: 10 }],
  nodes: [{ name: `${name} node`, url: `wss://${name.toLowerCase()}.example` }],
});
const service = () => new NetworkService({ getAllMainAccounts: () => [] } as unknown as KeyringService, {} as State);

afterEach(() => vi.restoreAllMocks());

describe('saved runtimes of retired chains', () => {
  it('are pruned against every chain the maintained registry and the bundled networks list', async () => {
    const prune = vi.spyOn(substrateMetadataCache, 'prune').mockResolvedValue(0);
    vi.mocked(axios.get).mockResolvedValue({ data: [entry('Polkadot', POLKADOT), entry('Testnet', 'ab'.repeat(32))] });

    const networks = service();
    await networks.initNetworkMap();

    expect(prune).toHaveBeenCalledOnce();
    const kept = [...prune.mock.calls[0][0]];
    expect(kept).toEqual(expect.arrayContaining([POLKADOT, 'ab'.repeat(32)]));
    // Bundled networks merged into the map are kept as well.
    expect(kept).toEqual(expect.arrayContaining(Object.values(networks.networkMap).map(({ chainId }) => chainId)));
  });

  it('are left alone while only the cached or bundled networks are known', async () => {
    const prune = vi.spyOn(substrateMetadataCache, 'prune').mockResolvedValue(0);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(axios.get).mockRejectedValue(new Error('offline'));

    await service().initNetworkMap();

    expect(prune).not.toHaveBeenCalled();
  });
});
