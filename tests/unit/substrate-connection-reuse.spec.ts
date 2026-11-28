import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkService } from '@extension-base/services/network-service';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';

const io = vi.hoisted(() => ({
  providers: [] as Array<{ disconnect: ReturnType<typeof vi.fn> }>,
  apis: [] as Array<{ disconnect: ReturnType<typeof vi.fn>; fail(): void }>,
}));

vi.mock('@polkadot/rpc-provider', () => ({
  WsProvider: class {
    disconnect = vi.fn().mockResolvedValue(undefined);
    constructor() { io.providers.push(this); }
  },
}));
vi.mock('@polkadot/api', () => ({
  ApiPromise: class {
    fail!: () => void;
    isReadyOrError = new Promise((_, reject) => { this.fail = () => reject(new Error('unreachable')); });
    disconnect = vi.fn().mockResolvedValue(undefined);
    constructor() { io.apis.push(this); }
    on() { return this; }
  },
}));
vi.mock('@extension-base/stores/NetworkMap', () => ({ default: class {
  get() {}
  getAndWait() { return Promise.resolve(undefined); }
  getSubject() { return { next() {} }; }
  updateAndWait() { return Promise.resolve(); }
} }));
vi.mock('@extension-base/stores/SelectedNetworkStore', () => ({ default: class {
  get(_key: string, update: (value: unknown) => void) { update({}); }
  getAndWait() { return Promise.resolve({}); }
  set() {}
} }));
vi.mock('@extension-base/services/network-service/handlers/EvmApiHandler', () => ({ EvmApiHandler: class {
  api: Record<string, unknown> = {};
  initEvmApi() {}
} }));
vi.mock('@extension-base/services/network-service/handlers/TonApiHandler', () => ({ TonApiHandler: class {
  api: Record<string, unknown> = {};
  initApi() {}
} }));

const network = (name: string): NetworkJson => ({
  name, key: name, chainId: name.toLowerCase(), ecosystem: 'substrate', active: true, favorite: [],
  assets: [{ id: `${name}-utility`, symbol: name.slice(0, 3).toUpperCase(), precision: 10, isUtility: true, type: 'normal' }],
  nodes: [{ name: 'node', url: `wss://${name.toLowerCase()}.invalid` }],
} as unknown as NetworkJson);

function create() {
  const service = new NetworkService({
    getAllMainAccounts: () => [{ address: 'alice', meta: { walletEcosystem: WalletEcosystem.Substrate } }],
  } as never, {} as never);
  service.networkMap.Polkadot = network('Polkadot');
  service.networkMap.Kusama = network('Kusama');
  return service;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const disconnects = () => io.apis.filter(({ disconnect }) => disconnect.mock.calls.length).length;

describe('Substrate connections across network refreshes', () => {
  beforeEach(() => { io.providers = []; io.apis = []; });

  it('keeps one connection per active network when the network list is refreshed again', async () => {
    const service = create();

    service.initNetworkApis();
    service.initNetworkApis();
    service.initNetworkApis();
    await settle();

    expect(io.providers).toHaveLength(2);
    expect(io.apis).toHaveLength(2);
    expect(Object.keys(service.substrateApiHandler.api).sort()).toEqual(['kusama', 'polkadot']);
  });

  it('reconnects a network whose connection was closed while it was inactive', async () => {
    const service = create();
    service.initNetworkApis();
    await service.substrateApiHandler.destroyApi('Kusama');

    service.initNetworkApis();
    await settle();

    expect(io.apis).toHaveLength(3);
    expect(service.substrateApiHandler.api.kusama.api).toBe(io.apis[2]);
  });

  it('replaces a failed connection once however often the list is refreshed', async () => {
    const service = create();
    service.initNetworkApis();
    service.initNetworkApis();
    service.initNetworkApis();

    io.apis[0].fail();
    await settle();

    expect(io.apis).toHaveLength(3);
    expect(service.substrateApiHandler.api.polkadot.api).toBe(io.apis[2]);
  });

  it('closes the connection a new one replaces', async () => {
    const service = create();
    await service.substrateApiHandler.initApi(service.networkMap.Polkadot);
    const [replacedApi] = io.apis;
    const [replacedProvider] = io.providers;

    await service.substrateApiHandler.initApi(service.networkMap.Polkadot);

    expect(replacedApi.disconnect).toHaveBeenCalledOnce();
    expect(replacedProvider.disconnect).toHaveBeenCalledOnce();
    expect(disconnects()).toBe(1);
    expect(service.substrateApiHandler.api.polkadot.api).toBe(io.apis[1]);
  });
});
