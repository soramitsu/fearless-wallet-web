import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { SubstrateApiHandler } from '@extension-base/services/network-service/handlers/SubstrateApiHandler';
import { CronService } from '@extension-base/services/cron-service';
import { MAX_CONTINUE_RETRY } from '@/consts/networks';

const io = vi.hoisted(() => ({
  urls: [] as string[],
  apis: [] as Array<{ emit(event: string): void }>,
}));
vi.mock('@polkadot/rpc-provider', () => ({
  WsProvider: class {
    constructor(url: string) { io.urls.push(url); }
    disconnect() { return Promise.resolve(); }
  },
}));
vi.mock('@polkadot/api', () => ({
  ApiPromise: class {
    isConnected = false;
    isReadyOrError = new Promise(() => undefined);
    private readonly listeners: Record<string, () => void> = {};
    constructor() { io.apis.push(this); }
    on(event: string, callback: () => void) { this.listeners[event] = callback; return this; }
    emit(event: string) { this.listeners[event]?.(); }
    disconnect() { return Promise.resolve(); }
  },
}));
vi.mock('@extension-base/services/network-service/handlers/SoraApiHandler', () => ({ SoraApiHandler: class {} }));

const settle = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

function setup() {
  const polkadot = {
    name: 'Polkadot', chainId: 'polkadot', ecosystem: 'substrate', active: true,
    nodes: [{ name: 'first', url: 'wss://first.invalid' }, { name: 'second', url: 'wss://second.invalid' }],
  };
  const networkMap: Record<string, typeof polkadot> = { Polkadot: polkadot };
  const networkService = {
    networkMap,
    getNetworkJson: (name: string) => Object.values(networkMap).find((network) => network.name.toLowerCase() === name.toLowerCase()),
    updateNetworkStatus: vi.fn(),
  };
  const state = {
    disableNetworkMap: vi.fn(),
    subscriptionService: { cancelNetworkSubscription: vi.fn() },
  };
  const handler = new SubstrateApiHandler(networkService as never, state as never);
  return { handler, polkadot, state, networkService };
}

// The provider emits "disconnected" for each failed attempt, every 3 s.
async function fail(times = MAX_CONTINUE_RETRY) {
  for (let i = 0; i < times; i += 1) {
    io.apis.at(-1)!.emit('disconnected');
    await settle();
  }
}

let online = true;
beforeEach(() => {
  io.urls = [];
  io.apis = [];
  online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Substrate connection outages', () => {
  it('keeps the network and its connection while the browser is offline', async () => {
    const { handler, polkadot, state, networkService } = setup();
    await handler.initApi(polkadot as never);
    const connection = handler.api.polkadot.api;

    online = false;
    await fail(MAX_CONTINUE_RETRY * 3);

    expect(state.disableNetworkMap).not.toHaveBeenCalled();
    expect(polkadot.active).toBe(true);
    expect(handler.api.polkadot.api).toBe(connection);

    online = true;
    const cron = new CronService({
      networkService: { ...networkService, evmApiHandler: { recoverClosedApis() {} }, substrateApiHandler: handler, getApiMap: { substrate: handler.api } },
    } as never);
    await cron.recoverApiMap();
    expect(io.apis).toHaveLength(2);
    io.apis[1].emit('connected');
    expect(handler.api.polkadot.apiStatus).toBe(NETWORK_STATUS.CONNECTED);
  });

  it('never disables a network whose nodes all fail, and retries from the first node with a bounded backoff', async () => {
    vi.useFakeTimers();
    const { handler, polkadot, state } = setup();
    await handler.initApi(polkadot as never);

    await fail();
    expect(io.urls).toEqual(['wss://first.invalid', 'wss://second.invalid']);
    await fail();

    expect(state.disableNetworkMap).not.toHaveBeenCalled();
    expect(polkadot.active).toBe(true);
    expect(handler.api.polkadot.apiStatus).toBe(NETWORK_STATUS.DISCONNECTED);
    expect(io.apis).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(3000);
    expect(io.urls.at(-1)).toBe('wss://first.invalid');

    // The next full round waits twice as long.
    await fail();
    await fail();
    const created = io.apis.length;
    await vi.advanceTimersByTimeAsync(5999);
    expect(io.apis).toHaveLength(created);
    await vi.advanceTimersByTimeAsync(1);
    expect(io.apis).toHaveLength(created + 1);

    // The wait never exceeds two minutes.
    for (let round = 0; round < 8; round += 1) {
      await fail();
      await fail();
      await vi.advanceTimersByTimeAsync(120_000);
    }
    await fail();
    await fail();
    const waiting = io.apis.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(io.apis).toHaveLength(waiting + 1);
  });

  it('does not reconnect a network that was switched off while it waited', async () => {
    vi.useFakeTimers();
    const { handler, polkadot } = setup();
    await handler.initApi(polkadot as never);
    await fail();
    await fail();

    polkadot.active = false;
    await vi.advanceTimersByTimeAsync(120_000);

    expect(io.apis).toHaveLength(2);
  });

  it('starts a later outage from the first node again', async () => {
    const { handler, polkadot } = setup();
    await handler.initApi(polkadot as never);
    await fail();
    expect(handler.api.polkadot.nodeIndex).toBe(1);

    io.apis.at(-1)!.emit('connected');

    expect(handler.api.polkadot.nodeIndex).toBe(0);
  });
});
