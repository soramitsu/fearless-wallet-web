import axios from 'axios';
import { NetworkService } from '@extension-base/services/network-service';
import { migrateRetiredBuiltinProviders, migrateRetiredDwellirProvider } from '@extension-base/services/network-service/retiredProviders';
import productionRegistry from '../../remote-config/production/chains/v13/chains.json';
import developmentRegistry from '../../remote-config/development/chains/v13/chains_dev.json';
import type { NetworkJson } from '@extension-base/types';

const io = vi.hoisted(() => ({ stored: {} as Record<string, NetworkJson>, write: vi.fn(), queue: Promise.resolve() }));
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('@extension-base/stores/NetworkMap', () => ({ default: class {
  getSubject() { return { next() {} }; }
  getAndWait() { return Promise.resolve(structuredClone(io.stored)); }
  updateAndWait(key: string, transform: (current: unknown) => Record<string, NetworkJson>, publish?: (value: unknown) => void) {
    const operation = io.queue.then(async () => {
      const value = transform(structuredClone(io.stored));
      await io.write(key, value);
      io.stored = structuredClone(value);
      publish?.(value);
      return value;
    });
    io.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }
} }));
vi.mock('@extension-base/stores/SelectedNetworkStore', () => ({ default: class {
  get(_key: string, update: (value: unknown) => void) { update({}); }
} }));
vi.mock('@extension-base/services/network-service/handlers/SubstrateApiHandler', () => ({ SubstrateApiHandler: class {
  api = {};
  initApi() { return Promise.resolve(); }
} }));
vi.mock('@extension-base/services/network-service/handlers/TonApiHandler', () => ({ TonApiHandler: class {} }));

// Saved built-in choices from the catalogs before 0a4e8078. Both owned catalogs
// are exercised, including their distinct names for the same Heima genesis.
const legacyProfiles = [
  {
    'name': 'Polkadot',
    'from': 'wss://api-polkadot.dwellir.com',
    'to': 'wss://api-polkadot.n.dwellir.com'
  },
  {
    'name': 'Kusama',
    'from': 'wss://api-kusama.dwellir.com',
    'to': 'wss://api-kusama.n.dwellir.com'
  },
  {
    'name': 'Westend',
    'from': 'wss://westend-rpc.dwellir.com',
    'to': 'wss://westend-rpc.n.dwellir.com'
  },
  {
    'name': 'Kusama AssetHub',
    'from': 'wss://api-assethub-kusama.dwellir.com',
    'to': 'wss://api-asset-hub-kusama.n.dwellir.com'
  },
  {
    'name': 'Polkadot AssetHub',
    'from': 'wss://api-assethub-polkadot.dwellir.com',
    'to': 'wss://api-asset-hub-polkadot.n.dwellir.com'
  },
  {
    'name': 'Acala',
    'from': 'wss://acala-rpc.dwellir.com',
    'to': 'wss://acala-rpc.n.dwellir.com'
  },
  {
    'name': 'Karura',
    'from': 'wss://api-karura.dwellir.com',
    'to': 'wss://api-karura.n.dwellir.com'
  },
  {
    'name': 'Shiden',
    'from': 'wss://api-shiden.dwellir.com',
    'to': 'wss://api-shiden.n.dwellir.com'
  },
  {
    'name': 'Bifrost',
    'from': 'wss://api-bifrost-kusama.dwellir.com',
    'to': 'wss://api-bifrost-kusama.n.dwellir.com'
  },
  {
    'name': 'Astar',
    'from': 'wss://api-astar.dwellir.com',
    'to': 'wss://api-astar.n.dwellir.com'
  },
  {
    'name': 'Basilisk',
    'from': 'wss://api-basilisk.dwellir.com',
    'to': 'wss://api-basilisk.n.dwellir.com'
  },
  {
    'name': 'Kintsugi',
    'from': 'wss://api-kintsugi.dwellir.com',
    'to': 'wss://api-kintsugi.n.dwellir.com'
  },
  {
    'name': 'Centrifuge',
    'from': 'wss://api-centrifuge.dwellir.com',
    'to': 'wss://api-centrifuge.n.dwellir.com'
  },
  {
    'name': 'Interlay',
    'from': 'wss://api-interlay.dwellir.com',
    'to': 'wss://api-interlay.n.dwellir.com'
  },
  {
    'name': 'NeuroWeb Parachain',
    'from': 'wss://api-neuroweb.dwellir.com',
    'to': 'wss://api-neuroweb.n.dwellir.com'
  },
  {
    'name': 'UNIQUE',
    'from': 'wss://api-unique.dwellir.com',
    'to': 'wss://api-unique.n.dwellir.com'
  },
  {
    'name': 'Bifrost Polkadot',
    'from': 'wss://api-bifrost-polkadot.dwellir.com',
    'to': 'wss://api-bifrost-polkadot.n.dwellir.com'
  },
  {
    'name': 'Heima',
    'from': 'wss://api-litentry.dwellir.com',
    'to': 'wss://api-heima.n.dwellir.com'
  },
  {
    'name': 'Darwinia2',
    'from': 'wss://darwinia-rpc.dwellir.com',
    'to': 'wss://api-darwinia.n.dwellir.com'
  },
  {
    'name': 'Aleph Zero',
    'from': 'wss://api-aleph-zero-mainnet.dwellir.com',
    'to': 'wss://api-aleph-zero-mainnet.n.dwellir.com'
  },
  {
    'name': 'Kusama BridgeHub',
    'from': 'wss://api-kusama-bridge-hub.dwellir.com',
    'to': 'wss://api-bridge-hub-kusama.n.dwellir.com'
  },
  {
    'name': 'Frequency',
    'from': 'wss://api-frequency.dwellir.com',
    'to': 'wss://api-frequency.n.dwellir.com'
  },
  {
    'name': 'Pendulum',
    'from': 'wss://api-pendulum.dwellir.com',
    'to': 'wss://api-pendulum.n.dwellir.com'
  },
  {
    'name': 'XX network',
    'from': 'wss://xxnetwork-rpc.dwellir.com',
    'to': 'wss://xxnetwork-rpc.n.dwellir.com'
  },
  {
    'name': 'Polkadot BridgeHub',
    'from': 'wss://api-polkadot-bridge-hub.dwellir.com',
    'to': 'wss://api-bridge-hub-polkadot.n.dwellir.com'
  },
  {
    'name': 'Litentry',
    'from': 'wss://api-litentry.dwellir.com',
    'to': 'wss://api-heima.n.dwellir.com'
  }
] as const;
const create = () => new NetworkService({ getAllMainAccounts: () => [] } as never, {} as never);
const oldUrl = 'wss://api-polkadot.dwellir.com';
const newUrl = 'wss://api-polkadot.n.dwellir.com';
const custom = { name: 'My personal node', url: 'wss://personal.invalid' };
function networkFor(name = 'Polkadot'): NetworkJson {
  const row = productionRegistry.find(network => network.name === name) ?? developmentRegistry.find(network => network.name === name);
  if (!row) throw new Error('Missing test registry row');
  return { ...structuredClone(row), genesisHash: `0x${row.chainId}`, currentProvider: oldUrl,
    customNodes: [custom], customProviders: { [custom.name]: custom.url }, isManual: true, favorite: ['saved-wallet'] } as NetworkJson;
}
const prefs = (network: NetworkJson) => ({ currentProvider: network.currentProvider, customNodes: network.customNodes,
  customProviders: network.customProviders, isManual: network.isManual, favorite: network.favorite });

beforeEach(() => {
  vi.clearAllMocks();
  io.stored = {};
  io.queue = Promise.resolve();
  io.write.mockResolvedValue(undefined);
  vi.mocked(axios.get).mockResolvedValue({ data: [networkFor()] });
});

describe('saved manual Dwellir built-in selections', () => {
  it.each(legacyProfiles.filter(({ name }) => !networkFor(name).disabled))('migrates, persists and reopens the saved $name selection after its catalog move', async ({ name, from, to }) => {
    const updated = networkFor(name);
    expect(updated.nodes.some(node => node.url === to)).toBe(true);
    const original = { ...updated, nodes: [{ name: 'Dwellir node', url: from }], currentProvider: from };
    io.stored = { [name]: original };
    vi.mocked(axios.get).mockResolvedValue({ data: [updated] });
    const service = create();
    await service.initNetworkMap();
    await io.queue;
    const expected = { ...prefs(original), currentProvider: to };
    expect(prefs(service.networkMap[name])).toEqual(expected);
    expect(prefs(io.stored[name])).toEqual(expected);
    expect(io.stored[name].nodes).toEqual(updated.nodes);
    const reopened = create();
    await reopened.initNetworkMap();
    await io.queue;
    expect(prefs(reopened.networkMap[name])).toEqual(expected);
    expect(prefs(io.stored[name])).toEqual(expected);
  });

  it('keeps a disabled catalog network disabled instead of activating it during migration', async () => {
    const original = { ...networkFor('Darwinia2'), currentProvider: 'wss://darwinia-rpc.dwellir.com' };
    expect(original.disabled).toBe(true);
    io.stored = { Darwinia2: original };
    vi.mocked(axios.get).mockResolvedValue({ data: [original] });
    const service = create();
    await service.initNetworkMap();
    await io.queue;
    expect(service.networkMap.Darwinia2).toBeUndefined();
    expect(io.stored.Darwinia2).toEqual(original);
  });

  it('repairs an offline cached catalog that already contains the replacement without a partial catalog write', async () => {
    io.stored = { Polkadot: networkFor() };
    vi.mocked(axios.get).mockRejectedValue(new Error('offline'));
    const service = create();
    await service.initNetworkMap();
    expect(service.networkMap.Polkadot.currentProvider).toBe(newUrl);
    expect(io.stored.Polkadot.currentProvider).toBe(oldUrl);
    expect(io.write).not.toHaveBeenCalled();
    vi.mocked(axios.get).mockResolvedValue({ data: [networkFor()] });
    await service.initNetworkMap();
    await io.queue;
    expect(io.stored.Polkadot.currentProvider).toBe(newUrl);
  });

  it('waits for a refreshed registry before migrating an offline old catalog lacking the verified node', async () => {
    io.stored = { Polkadot: { ...networkFor(), nodes: [{ name: 'Dwellir node', url: oldUrl }] } };
    vi.mocked(axios.get).mockRejectedValue(new Error('offline'));
    const service = create();
    await service.initNetworkMap();
    expect(service.networkMap.Polkadot.currentProvider).toBe(oldUrl);
    expect(io.stored.Polkadot.currentProvider).toBe(oldUrl);
    expect(io.write).not.toHaveBeenCalled();
    vi.mocked(axios.get).mockResolvedValue({ data: [networkFor()] });
    await service.initNetworkMap();
    await io.queue;
    expect(service.networkMap.Polkadot.currentProvider).toBe(newUrl);
    expect(io.stored.Polkadot.currentProvider).toBe(newUrl);
  });

  it('can save an explicit choice after a failed migration write without a stale-preference conflict', async () => {
    io.stored = { Polkadot: networkFor() };
    io.write.mockRejectedValueOnce(new Error('disk full'));
    const service = create();
    await service.initNetworkMap();
    await io.queue;
    expect(io.stored.Polkadot.currentProvider).toBe(oldUrl);
    expect(service.networkMap.Polkadot.currentProvider).toBe(newUrl);
    await service.upsertNetworkMap({ ...service.networkMap.Polkadot, currentProvider: custom.url });
    expect(io.stored.Polkadot.currentProvider).toBe(custom.url);
    expect(service.networkMap.Polkadot.currentProvider).toBe(custom.url);
  });

  it('rebases a pending registry refresh over a concurrent explicit custom-node edit', async () => {
    io.stored = { Polkadot: networkFor() };
    const service = create();
    await service.initNetworkMap();
    await io.queue;
    let finish!: (value: unknown) => void;
    vi.mocked(axios.get).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const pending = service.initNetworkMap();
    await vi.waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
    await service.upsertNetworkMap({ ...service.networkMap.Polkadot, currentProvider: custom.url });
    finish({ data: [networkFor()] });
    await pending;
    await io.queue;
    expect(service.networkMap.Polkadot.currentProvider).toBe(custom.url);
    expect(io.stored.Polkadot.currentProvider).toBe(custom.url);
  });

  it.each(['customNodes', 'customProviders'] as const)('preserves an exact old URL explicitly registered in $0', async (field) => {
    const original = networkFor();
    if (field === 'customNodes') original.customNodes.push({ name: 'My explicit old URL', url: oldUrl });
    else original.customProviders['My explicit old URL'] = oldUrl;
    io.stored = { Polkadot: original };
    const service = create();
    await service.initNetworkMap();
    await io.queue;
    expect(prefs(service.networkMap.Polkadot)).toEqual(prefs(original));
    expect(prefs(io.stored.Polkadot)).toEqual(prefs(original));
  });

  it('changes only currentProvider and keeps the migration idempotent', () => {
    const original = networkFor();
    const migrated = migrateRetiredDwellirProvider(original);
    expect(migrated).toEqual({ ...original, currentProvider: newUrl });
    expect(original.currentProvider).toBe(oldUrl);
    expect(migrateRetiredBuiltinProviders(migrated)).toBe(migrated);
  });

  it.each([
    { name: 'My custom network' }, { chainId: '0'.repeat(64) }, { genesisHash: `0x${'0'.repeat(64)}` },
    { ecosystem: 'ethereumBased' }, { isManual: false },
    { currentProvider: `${oldUrl}/my-key` }, { currentProvider: `${oldUrl}?key=custom` },
    { currentProvider: 'wss://user:password@api-polkadot.dwellir.com' },
    { nodes: [{ name: 'Different provider', url: 'wss://rpc.polkadot.io' }] },
  ])('leaves mismatched identities, explicit URLs and absent replacements untouched: %j', (override) => {
    const original = { ...networkFor(), ...override } as NetworkJson;
    expect(migrateRetiredDwellirProvider(original)).toBe(original);
  });

  it('does not silently move a removed Dwellir choice to a different provider', () => {
    const original = { ...networkFor('Moonbeam'), currentProvider: 'wss://api-moonbeam.dwellir.com' };
    expect(migrateRetiredBuiltinProviders(original)).toBe(original);
  });
});
