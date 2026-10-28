import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import axios from 'axios';
import { NetworkService, productionRegistryNetwork } from '@extension-base/services/network-service';
import {
  isAcceptedRegistryNodeUrl,
  withAcceptedRegistryNodes,
  withDwellirApiKey,
} from '@extension-base/services/network-service/nodeUrlPolicy';
import type { KeyringService } from '@extension-base/services';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';

const build = vi.hoisted(() => ({ production: true }));

vi.mock('@/consts/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/consts/global')>();

  return {
    ...actual,
    get IS_PRODUCTION() {
      return build.production;
    },
  };
});
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('@extension-base/stores/NetworkMap', () => ({
  default: class {
    getAndWait = vi.fn().mockResolvedValue(undefined);
    updateAndWait = vi.fn().mockResolvedValue(undefined);
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

const entry = (name: string, urls: string[], ecosystem = 'substrate'): NetworkJson =>
  ({
    name,
    chainId: `${name.toLowerCase()}-chain`,
    ecosystem,
    disabled: false,
    assets: [{ id: `${name}-asset`, symbol: name.slice(0, 3).toUpperCase(), precision: 10 }],
    nodes: urls.map((url, index) => ({ name: `${name} node ${index}`, url })),
  }) as unknown as NetworkJson;

describe('registry node URLs a production build accepts', () => {
  it.each([
    ['substrate', 'wss://rpc.polkadot.io', true],
    ['substrate', 'ws://rpc.polkadot.io', false],
    ['substrate', 'https://rpc.polkadot.io', false],
    ['ethereumBased', 'wss://wss.api.moonbeam.network', true],
    ['ethereumBased', 'ws://127.0.0.1:9944', false],
    ['ethereum', 'https://eth.example', true],
    ['ethereum', 'wss://eth.example', true],
    ['ethereum', 'http://eth.example', false],
    ['ton', 'https://toncenter.example', true],
    ['substrate', 'wss://user:secret@rpc.polkadot.io', false],
    ['substrate', 'rpc.polkadot.io', false],
    ['substrate', 42, false],
  ])('%s node %s is accepted: %s', (ecosystem, url, accepted) => {
    expect(isAcceptedRegistryNodeUrl(ecosystem, url)).toBe(accepted);
  });

  it('keeps only the accepted nodes of a row and drops a row left without any', () => {
    const mixed = entry('Mixed', ['ws://plain.example', 'wss://tls.example']);

    expect(withAcceptedRegistryNodes(mixed)?.nodes).toEqual([{ name: 'Mixed node 1', url: 'wss://tls.example' }]);
    expect(withAcceptedRegistryNodes(entry('Plain', ['ws://plain.example']))).toBeUndefined();
    const tls = entry('Tls', ['wss://tls.example']);
    expect(withAcceptedRegistryNodes(tls)).toBe(tls);
    const nodeless = { ...entry('Bitcoin', [], 'bitcoin') };
    expect(withAcceptedRegistryNodes(nodeless)).toBe(nodeless);
  });

  it('filters only in production builds', () => {
    const plain = entry('Local', ['ws://127.0.0.1:9944']);

    expect(productionRegistryNetwork(plain, true)).toBeUndefined();
    expect(productionRegistryNetwork(plain, false)).toBe(plain);
  });

  it('accepts every node of the production registry as it is today', () => {
    const registry = JSON.parse(
      readFileSync(resolve(__dirname, '../../remote-config/production/chains/v13/chains.json'), 'utf8')
    ) as NetworkJson[];

    expect(registry.filter((network) => withAcceptedRegistryNodes(network) !== network).map(({ name }) => name)).toEqual([]);
  });
});

describe('remote registry in a production build', () => {
  const load = async () => {
    const service = new NetworkService({ getAllMainAccounts: () => [] } as unknown as KeyringService, {} as State);
    await service.initNetworkMap();

    return service;
  };

  beforeEach(() => {
    vi.mocked(axios.get).mockResolvedValue({
      data: [
        entry('Polkadot', ['ws://hijacked.example', 'wss://rpc.polkadot.io']),
        entry('Kusama', ['ws://hijacked.example']),
        entry('Ethereum', ['http://eth.example', 'https://eth.example'], 'ethereum'),
      ],
    });
  });

  afterEach(() => {
    build.production = true;
  });

  it('drops plain-text nodes and skips a network left without any', async () => {
    build.production = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = await load();

    expect(service.networksGithub.map(({ name }) => name)).toEqual(['Polkadot', 'Ethereum']);
    expect(service.networkMap.Polkadot.nodes.map(({ url }) => url)).toEqual(['wss://rpc.polkadot.io']);
    expect(service.networkMap.Polkadot.currentProvider).toBe('wss://rpc.polkadot.io');
    expect(service.networkMap.Ethereum.nodes.map(({ url }) => url)).toEqual(['https://eth.example']);
    expect(service.networkMap).not.toHaveProperty('Kusama');
    expect(warn.mock.calls.flat().join(' ')).toContain('Kusama');
    warn.mockRestore();
  });

  it('keeps the nodes of the development registry in other builds', async () => {
    build.production = false;
    const service = await load();

    expect(service.networkMap.Kusama.nodes.map(({ url }) => url)).toEqual(['ws://hijacked.example']);
  });
});

describe('Dwellir API key', () => {
  it('is appended only for Dwellir hosts', () => {
    expect(withDwellirApiKey('wss://api-polkadot.dwellir.com', 'key')).toBe('wss://api-polkadot.dwellir.com/key');
    expect(withDwellirApiKey('wss://DWELLIR.com', 'key')).toBe('wss://DWELLIR.com/key');
    expect(withDwellirApiKey('wss://rpc.example/dwellir', 'key')).toBe('wss://rpc.example/dwellir');
    expect(withDwellirApiKey('wss://notdwellir.com', 'key')).toBe('wss://notdwellir.com');
    expect(withDwellirApiKey('dwellir.com', 'key')).toBe('dwellir.com');
  });
});
