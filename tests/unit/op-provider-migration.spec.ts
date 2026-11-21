import axios from 'axios';
import { NetworkService } from '@extension-base/services/network-service';
import { getEvmRpcUrl } from '@extension-base/services/network-service/handlers/EvmApiHandler';
import { migrateRetiredOpProvider, OP_MAINNET_RPC_URL } from '@extension-base/services/network-service/retiredProviders';
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
vi.mock('@extension-base/services/network-service/handlers/SubstrateApiHandler', () => ({ SubstrateApiHandler: class {} }));
vi.mock('@extension-base/services/network-service/handlers/TonApiHandler', () => ({ TonApiHandler: class {} }));

const oldHttp = 'https://optimism-mainnet.blastapi.io/';
const oldWs = 'wss://optimism-mainnet.blastapi.io/';
const publicWs = 'wss://optimism.publicnode.com/';
const create = () => new NetworkService({ getAllMainAccounts: () => [] } as never, {} as never);
function oldNetwork(overrides: Partial<NetworkJson> = {}): NetworkJson {
  return {
    ...productionRegistry.find(({ name }) => name === 'OP Mainnet'),
    nodes: [
      { name: 'Blast https node', url: oldHttp },
      { name: 'Blast wss node', url: oldWs },
      { name: 'Public http node', url: OP_MAINNET_RPC_URL },
      { name: 'Public wss node', url: publicWs },
    ],
    currentProvider: oldHttp,
    customNodes: [], customProviders: {}, favorite: ['saved-wallet'], isManual: true,
    ...overrides,
  } as NetworkJson;
}
const savedOp = () => io.stored['OP Mainnet'];

describe('retired OP built-in provider migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    io.stored = { 'OP Mainnet': oldNetwork() };
    io.queue = Promise.resolve();
    io.write.mockResolvedValue(undefined);
    vi.mocked(axios.get).mockResolvedValue({ data: [oldNetwork()] });
  });

  it.each([oldHttp, oldWs])('persists and reopens the corrected selection from an old registry: %s', async (currentProvider) => {
    const original = oldNetwork({ currentProvider });
    io.stored = { 'OP Mainnet': original };
    const service = create();
    await service.initNetworkMap();
    await io.queue;
    const migrated = service.networkMap['OP Mainnet'];
    expect(migrated.currentProvider).toBe(OP_MAINNET_RPC_URL);
    expect(getEvmRpcUrl(migrated)).toBe(OP_MAINNET_RPC_URL);
    expect(migrated.nodes.map(({ url }) => url)).toEqual([OP_MAINNET_RPC_URL, publicWs]);
    expect(Object.values(migrated.providers)).toEqual([OP_MAINNET_RPC_URL, publicWs]);
    expect(savedOp().currentProvider).toBe(OP_MAINNET_RPC_URL);
    expect(savedOp()).toMatchObject({ customNodes: [], customProviders: {}, favorite: original.favorite, isManual: true });
    const reopened = create();
    await reopened.initNetworkMap();
    await io.queue;
    expect(reopened.networkMap['OP Mainnet'].currentProvider).toBe(OP_MAINNET_RPC_URL);
    expect(savedOp().currentProvider).toBe(OP_MAINNET_RPC_URL);
  });

  it('repairs a saved retired selection even when the new registry has removed both retired rows', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: [productionRegistry.find(({ name }) => name === 'OP Mainnet')] });
    const service = create();
    await service.initNetworkMap();
    await io.queue;
    expect(getEvmRpcUrl(service.networkMap['OP Mainnet'])).toBe(OP_MAINNET_RPC_URL);
    expect(savedOp().currentProvider).toBe(OP_MAINNET_RPC_URL);
  });

  it('uses a working default on first launch even if the downloaded registry is still old', async () => {
    io.stored = {};
    const service = create();
    await service.initNetworkMap();
    await io.queue;
    expect(getEvmRpcUrl(service.networkMap['OP Mainnet'])).toBe(OP_MAINNET_RPC_URL);
    expect(savedOp().currentProvider).toBe(OP_MAINNET_RPC_URL);
  });

  it('repairs the usable runtime cache while offline without replacing the stored catalog with a partial one', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('offline'));
    const service = create();
    await service.initNetworkMap();
    expect(getEvmRpcUrl(service.networkMap['OP Mainnet'])).toBe(OP_MAINNET_RPC_URL);
    expect(io.write).not.toHaveBeenCalled();
    expect(savedOp().currentProvider).toBe(oldHttp);
  });

  it('does not claim a failed migration write succeeded, and can persist it on the next registry refresh', async () => {
    io.write.mockRejectedValueOnce(new Error('disk full'));
    const service = create();
    await service.initNetworkMap();
    await io.queue;
    expect(savedOp().currentProvider).toBe(oldHttp);
    expect(getEvmRpcUrl(service.networkMap['OP Mainnet'])).toBe(OP_MAINNET_RPC_URL);
    await service.initNetworkMap();
    await io.queue;
    expect(savedOp().currentProvider).toBe(OP_MAINNET_RPC_URL);
  });

  it('allows an explicit edit after a failed migration write without a false stale-preference conflict', async () => {
    io.write.mockRejectedValueOnce(new Error('disk full'));
    const service = create();
    await service.initNetworkMap();
    await io.queue;
    await service.upsertNetworkMap({ ...service.networkMap['OP Mainnet'], currentProvider: publicWs });
    expect(savedOp().currentProvider).toBe(publicWs);
    service.evmApiHandler.destroyApi('OP Mainnet');
  });

  it('preserves a concurrent custom-provider edit when an older registry request finishes', async () => {
    const service = create();
    await service.initNetworkMap();
    await io.queue;
    let finish!: (value: unknown) => void;
    vi.mocked(axios.get).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const pending = service.initNetworkMap();
    await vi.waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
    const customNodes = [{ name: 'Personal OP', url: 'https://personal.invalid/op' }];
    const customProviders = { 'Personal OP': customNodes[0].url };
    await service.upsertNetworkMap({ ...service.networkMap['OP Mainnet'], currentProvider: customNodes[0].url,
      customNodes, customProviders, isManual: true });
    finish({ data: [oldNetwork()] });
    await pending;
    await io.queue;
    for (const network of [service.networkMap['OP Mainnet'], savedOp()]) {
      expect(network).toMatchObject({ currentProvider: customNodes[0].url, customNodes, customProviders,
        isManual: true, favorite: ['saved-wallet'] });
    }
  });

  it.each([
    OP_MAINNET_RPC_URL,
    publicWs,
    'https://optimism-mainnet.blastapi.io/my-custom-path',
    'https://optimism-mainnet.blastapi.io/?key=custom',
    'https://user:password@optimism-mainnet.blastapi.io/',
  ])('preserves a non-retired or explicitly customized selected URL: %s', (currentProvider) => {
    const original = oldNetwork({ currentProvider });
    expect(migrateRetiredOpProvider(original).currentProvider).toBe(currentProvider);
    expect(original.nodes[0].url).toBe(oldHttp);
  });

  it('preserves explicitly saved custom nodes and provider-map entries even if their URL matches the retired built-in', () => {
    for (const overrides of [
      { customNodes: [{ name: 'My explicit node', url: oldHttp }] },
      { customProviders: { 'My explicit node': oldHttp } },
    ]) {
      const network = oldNetwork(overrides);
      expect(migrateRetiredOpProvider(network)).toBe(network);
    }
  });

  it('adds the verified replacement for an older catalog that only contains Blast', () => {
    const network = oldNetwork({ nodes: [{ name: 'Old default', url: oldHttp }] });
    expect(getEvmRpcUrl(migrateRetiredOpProvider(network))).toBe(OP_MAINNET_RPC_URL);
  });

  it('leaves other chains, ecosystems, and custom network names untouched', () => {
    for (const overrides of [{ chainId: '1' }, { ecosystem: 'substrate' as const }, { name: 'My network' }]) {
      const network = oldNetwork(overrides);
      expect(migrateRetiredOpProvider(network)).toBe(network);
    }
  });

  it.each([{ registry: productionRegistry }, { registry: developmentRegistry }])('ships a usable OP default without retired built-in choices', ({ registry }) => {
    const network = registry.find(({ name }) => name === 'OP Mainnet')!;
    expect(network.chainId).toBe('10');
    expect(network.nodes.map(({ url }) => url)).toEqual([OP_MAINNET_RPC_URL, publicWs]);
  });
});
