import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NetworkService,
  SUBSTRATE_CONNECT_BATCH,
  SUBSTRATE_CONNECT_PACE_MS,
} from '@extension-base/services/network-service';
import BalanceService from '@extension-base/services/balance-service';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';

const io = vi.hoisted(() => ({ opened: [] as string[] }));

vi.mock('@polkadot/rpc-provider', () => ({
  WsProvider: class {
    disconnect = vi.fn().mockResolvedValue(undefined);
    constructor(readonly url: string) { io.opened.push(url); }
  },
}));
vi.mock('@polkadot/api', () => ({
  ApiPromise: class {
    isReadyOrError = new Promise(() => undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    on() { return this; }
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
  destroyAll() {}
} }));
vi.mock('@extension-base/services/network-service/handlers/TonApiHandler', () => ({ TonApiHandler: class {
  api: Record<string, unknown> = {};
  destroyAll() {}
} }));

const network = (name: string, rank?: number): NetworkJson => ({
  name, key: name, chainId: name.toLowerCase(), ecosystem: 'substrate', active: true, favorite: [], rank,
  assets: [{ id: `${name}-utility`, symbol: 'UNIT', precision: 10, isUtility: true, type: 'normal' }],
  nodes: [{ name: 'node', url: `wss://${name.toLowerCase()}.invalid` }],
} as unknown as NetworkJson);

function create(names: Array<[string, number?]>) {
  const service = new NetworkService({
    getAllMainAccounts: () => [{ address: 'alice', meta: { walletEcosystem: WalletEcosystem.Substrate } }],
  } as never, {} as never);
  for (const [name, rank] of names) service.networkMap[name] = network(name, rank);
  return service;
}

const opened = () => io.opened.map((url) => url.replace(/^wss:\/\/|\.invalid$/g, ''));
const names = (count: number) => Array.from({ length: count }, (_, index) => [`Chain${String(index).padStart(2, '0')}`] as [string]);

describe('Substrate connections are opened a few at a time', () => {
  beforeEach(() => {
    io.opened = [];
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('opens the first batch at once and one more batch every pace', async () => {
    const service = create(names(SUBSTRATE_CONNECT_BATCH * 2 + 2));

    service.initNetworkApis();
    expect(io.opened).toHaveLength(SUBSTRATE_CONNECT_BATCH);
    await vi.advanceTimersByTimeAsync(SUBSTRATE_CONNECT_PACE_MS - 1);
    expect(io.opened).toHaveLength(SUBSTRATE_CONNECT_BATCH);
    await vi.advanceTimersByTimeAsync(1);
    expect(io.opened).toHaveLength(SUBSTRATE_CONNECT_BATCH * 2);
    await vi.advanceTimersByTimeAsync(SUBSTRATE_CONNECT_PACE_MS);
    expect(io.opened).toHaveLength(SUBSTRATE_CONNECT_BATCH * 2 + 2);
    await vi.advanceTimersByTimeAsync(SUBSTRATE_CONNECT_PACE_MS * 4);
    expect(io.opened).toHaveLength(SUBSTRATE_CONNECT_BATCH * 2 + 2);
  });

  it('opens the networks holding the selected wallet\'s funds first, then the ranked ones, then the others in order', async () => {
    const service = create([['Zeta'], ['Kusama', 9], ['Alpha'], ['Funded'], ['Polkadot', 8], ['Beta'], ['Gamma'], ['Delta']]);
    service.connectFirst = () => new Set(['funded']);

    service.initNetworkApis();
    await vi.advanceTimersByTimeAsync(SUBSTRATE_CONNECT_PACE_MS);

    expect(opened()).toEqual(['funded', 'polkadot', 'kusama', 'zeta', 'alpha', 'beta', 'gamma', 'delta']);
  });

  it('opens each network once, and leaves one switched off, removed or connected meanwhile', async () => {
    const service = create(names(SUBSTRATE_CONNECT_BATCH + 4));

    service.initNetworkApis();
    service.initNetworkApis();
    service.networkMap.Chain06.active = false;
    expect(service.connectNetwork(service.networkMap.Chain07)).toBe(true);
    delete service.networkMap.Chain08;
    await vi.advanceTimersByTimeAsync(SUBSTRATE_CONNECT_PACE_MS * 3);

    expect(opened().filter((name) => name === 'chain07')).toHaveLength(1);
    expect(opened()).not.toContain('chain06');
    expect(opened()).not.toContain('chain08');
    expect(new Set(opened()).size).toBe(io.opened.length);
    expect(io.opened).toHaveLength(SUBSTRATE_CONNECT_BATCH + 2);
  });

  it('forgets the queue as the wallet goes quiet, and queues again on waking', async () => {
    const service = create(names(SUBSTRATE_CONNECT_BATCH + 2));

    service.initNetworkApis();
    await service.suspend();
    await vi.advanceTimersByTimeAsync(SUBSTRATE_CONNECT_PACE_MS * 3);
    expect(io.opened).toHaveLength(SUBSTRATE_CONNECT_BATCH);

    service.resume();
    service.initNetworkApis();
    await vi.advanceTimersByTimeAsync(SUBSTRATE_CONNECT_PACE_MS * 3);
    expect(io.opened).toHaveLength(SUBSTRATE_CONNECT_BATCH * 2 + 2);
  });
});

describe('networks where a wallet holds funds', () => {
  const balance = (name: string, amounts: Record<string, string | undefined>) => ({ name, ...amounts });
  const fundedNetworks = (balanceMap: unknown, address?: string) =>
    BalanceService.prototype.fundedNetworks.call({ balanceMap } as unknown as BalanceService, address);

  it('are those with any amount above zero, saved or read, by lower-case name', () => {
    const balanceMap = {
      alice: [
        { balances: [balance('Polkadot', { total: '12000000000' }), balance('Kusama', { total: '0', transferable: '0' })] },
        { balances: [balance('Moonbeam', { reserved: '1' }), balance('Acala', { free: '0.000' }), balance('Astar', {})] },
      ],
      bob: [{ balances: [balance('Hydration', { total: '5' })] }],
    };

    expect([...fundedNetworks(balanceMap, 'alice')].sort()).toEqual(['moonbeam', 'polkadot']);
    expect(fundedNetworks(balanceMap, 'carol').size).toBe(0);
    expect(fundedNetworks(balanceMap).size).toBe(0);
  });
});
