import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkService } from '@extension-base/services/network-service';
import { SoraApiHandler } from '@extension-base/services/network-service/handlers/SoraApiHandler';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { MAX_CONTINUE_RETRY } from '@/consts/networks';
import { SORA_NETWORK_NAME } from '@/consts/sora';

type Listener = () => void;

const io = vi.hoisted(() => ({
  providers: [] as Array<{ disconnect: ReturnType<typeof vi.fn> }>,
  apis: [] as Array<{ disconnect: ReturnType<typeof vi.fn>; listeners: Record<string, () => void> }>,
  sora: [] as Array<{ disconnect: ReturnType<typeof vi.fn>; off: ReturnType<typeof vi.fn> }>,
}));

vi.mock('@polkadot/rpc-provider', () => ({
  WsProvider: class {
    disconnect = vi.fn().mockResolvedValue(undefined);
    constructor() { io.providers.push(this); }
  },
}));
vi.mock('@polkadot/api', () => ({
  ApiPromise: class {
    listeners: Record<string, Listener> = {};
    isReadyOrError = new Promise(() => undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    constructor() { io.apis.push(this); }
    on(event: string, listener: Listener) { this.listeners[event] = listener; return this; }
  },
}));
vi.mock('@/sora/client', () => ({
  api: {},
  SoraClient: class {},
  createConnection: () => {
    const api = { disconnect: vi.fn().mockResolvedValue(undefined), off: vi.fn(), isReadyOrError: new Promise(() => undefined) };
    io.sora.push(api);
    return { api, provider: {} };
  },
}));
vi.mock('@extension-base/stores/NetworkMap', () => ({ default: class {
  getAndWait() { return Promise.resolve(undefined); }
  getSubject() { return { next() {} }; }
  updateAndWait() { return Promise.resolve(); }
} }));
vi.mock('@extension-base/stores/SelectedNetworkStore', () => ({ default: class {
  getAndWait() { return Promise.resolve({}); }
  set() {}
} }));
vi.mock('@extension-base/services/network-service/handlers/EvmApiHandler', () => ({ EvmApiHandler: class {
  api: Record<string, unknown> = {};
  initEvmApi = vi.fn((network: { name: string }) => { this.api[network.name.toLowerCase()] = { api: {} }; });
  destroyAll = vi.fn(() => { this.api = {}; });
} }));
vi.mock('@extension-base/services/network-service/handlers/TonApiHandler', () => ({ TonApiHandler: class {
  api: Record<string, unknown> = {};
  initApi = vi.fn();
  destroyAll = vi.fn();
} }));

const network = (name: string, ecosystem = 'substrate'): NetworkJson => ({
  name, key: name, chainId: name.toLowerCase(), ecosystem, active: true, favorite: [],
  assets: [{ id: `${name}-utility`, symbol: name.slice(0, 3).toUpperCase(), precision: 10, isUtility: true, type: 'normal' }],
  nodes: [{ name: 'node', url: `wss://${name.toLowerCase().replace(/ /g, '-')}.invalid` }],
} as unknown as NetworkJson);

function create() {
  const service = new NetworkService({
    getAllMainAccounts: () => [{ address: 'alice', meta: { walletEcosystem: WalletEcosystem.Substrate } }],
  } as never, {} as never);
  service.networkMap.Polkadot = network('Polkadot');
  service.networkMap.Kusama = network('Kusama');
  return service;
}

// Every node of the network fails, so the handler waits and connects again from the first node.
function failEveryNode(api: { listeners: Record<string, Listener> }) {
  for (let attempt = 0; attempt < MAX_CONTINUE_RETRY; attempt++) api.listeners.disconnected();
}

const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

beforeEach(() => { io.providers = []; io.apis = []; io.sora = []; });
afterEach(() => { vi.useRealTimers(); });

describe('a quiet wallet closes its node connections', () => {
  it('closes every Substrate connection, and refreshes open none until it resumes', async () => {
    const service = create();
    service.initNetworkApis();
    expect(io.apis).toHaveLength(2);

    await service.suspend();

    expect(service.suspended).toBe(true);
    expect(io.apis.every(({ disconnect }) => disconnect.mock.calls.length === 1)).toBe(true);
    expect(io.providers.every(({ disconnect }) => disconnect.mock.calls.length === 1)).toBe(true);
    expect(service.getApiMap.substrate).toEqual({});
    expect(service.evmApiHandler.destroyAll).toHaveBeenCalledOnce();
    expect(service.tonApiHandler.destroyAll).toHaveBeenCalledOnce();

    service.initNetworkApis();
    expect(io.apis).toHaveLength(2);

    service.resume();
    service.initNetworkApis();
    expect(io.apis).toHaveLength(4);
    expect(service.substrateApiHandler.api.polkadot.api).toBe(io.apis[2]);
  });

  it('tells subscribers when it is suspended and resumed', async () => {
    const service = create();
    const seen: boolean[] = [];
    service.suspendedSubject.subscribe((suspended) => seen.push(suspended));

    await service.suspend();
    service.resume();
    service.resume();

    expect(seen).toEqual([false, true, false]);
  });

  it('reconnects a network whose nodes all failed, while awake', async () => {
    vi.useFakeTimers();
    const service = create();
    await service.substrateApiHandler.initApi(service.networkMap.Polkadot);

    failEveryNode(io.apis[0]);
    await settle();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(io.apis).toHaveLength(2);
  });

  it('does not let a reconnect scheduled before it went quiet open a connection', async () => {
    vi.useFakeTimers();
    const service = create();
    await service.substrateApiHandler.initApi(service.networkMap.Polkadot);
    failEveryNode(io.apis[0]);
    await settle();

    await service.suspend();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    // Late events of the closed connection count for nothing either.
    io.apis[0].listeners.connected();
    io.apis[0].listeners.disconnected();
    await settle();

    expect(io.apis).toHaveLength(1);
    expect(service.getApiMap.substrate).toEqual({});
  });

  it('closes the SORA connection, which the handler holds itself', async () => {
    const service = create();
    service.networkMap[SORA_NETWORK_NAME] = network(SORA_NETWORK_NAME);
    await service.substrateApiHandler.initApi(service.networkMap[SORA_NETWORK_NAME]);
    expect(io.sora).toHaveLength(1);

    await service.suspend();

    expect(io.sora[0].disconnect).toHaveBeenCalledOnce();
    expect(io.sora[0].off).toHaveBeenCalled();
    expect(SoraApiHandler.getApiInstance()).toBeUndefined();
  });

  it('opens one closed connection of an active network on request, and none while suspended', async () => {
    const service = create();
    const ethereum = network('Ethereum', 'ethereum');
    service.networkMap.Ethereum = ethereum;

    await service.suspend();
    expect(service.connectNetwork(ethereum)).toBe(false);
    expect(service.connectNetwork(service.networkMap.Kusama)).toBe(false);
    expect(service.evmApiHandler.initEvmApi).not.toHaveBeenCalled();
    expect(io.apis).toHaveLength(0);

    service.resume();
    expect(service.connectNetwork(ethereum)).toBe(true);
    expect(service.connectNetwork(ethereum)).toBe(false);
    expect(service.connectNetwork(service.networkMap.Kusama)).toBe(true);
    expect(service.connectNetwork(service.networkMap.Kusama)).toBe(false);

    expect(service.evmApiHandler.initEvmApi).toHaveBeenCalledOnce();
    expect(io.apis).toHaveLength(1);
    expect(service.substrateApiHandler.api.polkadot).toBeUndefined();
  });
});
