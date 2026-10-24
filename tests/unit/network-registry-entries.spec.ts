import axios from 'axios';
import { isUsableRegistryNetwork, NetworkService } from '@extension-base/services/network-service';
import type { KeyringService } from '@extension-base/services';
import type State from '@extension-base/background/handlers/State';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('@extension-base/stores/NetworkMap', () => ({
  default: class {
    get(_key: string, callback: (value: unknown) => void) {
      callback(undefined);
    }

    set = vi.fn();
  },
}));
vi.mock('@extension-base/stores/SelectedNetworkStore', () => ({
  default: class {
    get(_key: string, callback: (value: unknown) => void) {
      callback({});
    }

    set = vi.fn();
  },
}));
vi.mock('@extension-base/services/network-service/handlers/EvmApiHandler', () => ({ EvmApiHandler: class {} }));
vi.mock('@extension-base/services/network-service/handlers/SubstrateApiHandler', () => ({ SubstrateApiHandler: class {} }));
vi.mock('@extension-base/services/network-service/handlers/TonApiHandler', () => ({ TonApiHandler: class {} }));

const entry = (name: string, overrides: Record<string, unknown> = {}) => ({
  name,
  chainId: `${name.toLowerCase()}-chain`,
  ecosystem: 'Substrate',
  disabled: false,
  assets: [{ id: `${name}-asset`, symbol: name.slice(0, 3).toUpperCase(), precision: 10 }],
  nodes: [{ name: `${name} node`, url: `wss://${name.toLowerCase()}.example` }],
  ...overrides,
});

describe('network registry entries', () => {
  it.each([
    ['an empty node list', entry('Empty', { nodes: [] })],
    ['missing nodes', entry('Missing', { nodes: undefined })],
    ['a node without a URL', entry('NoUrl', { nodes: [{ name: 'node' }] })],
    ['a missing name', entry('', {})],
    ['a missing chain id', entry('NoChain', { chainId: undefined })],
    ['missing assets', entry('NoAssets', { assets: undefined })],
    ['a non-object', 'junk'],
  ])('rejects an entry with %s', (_label, value) => {
    expect(isUsableRegistryNetwork(value)).toBe(false);
  });

  it('accepts a complete entry', () => {
    expect(isUsableRegistryNetwork(entry('Polkadot'))).toBe(true);
  });

  it('skips and logs a malformed entry instead of failing to load every network', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: [entry('Polkadot'), entry('Broken', { nodes: [] }), null, entry('Kusama')],
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = new NetworkService(
      { getAllMainAccounts: () => [] } as unknown as KeyringService,
      {} as State
    );

    await expect(service.initNetworkMap()).resolves.toBeUndefined();

    // Bundled registries are merged in as well; only the malformed remote entry is missing.
    expect(service.networkMap).toHaveProperty('Polkadot');
    expect(service.networkMap).toHaveProperty('Kusama');
    expect(service.networkMap).not.toHaveProperty('Broken');
    expect(service.networksGithub.map(({ name }) => name)).toEqual(['Polkadot', 'Kusama']);
    expect(warn.mock.calls.flat().join(' ')).toContain('Broken');
    warn.mockRestore();
  });

  it('still refuses a registry that is not a list', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { networks: [] } });
    const service = new NetworkService({ getAllMainAccounts: () => [] } as unknown as KeyringService, {} as State);

    await expect(service.initNetworkMap()).rejects.toThrow('The network registry is not a list');
  });
});
