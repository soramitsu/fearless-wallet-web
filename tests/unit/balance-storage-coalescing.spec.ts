import { describe, expect, it, vi } from 'vitest';
import { APIItemState } from '@extension-base/api/types/networks';
import BalanceService from '@extension-base/services/balance-service';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { createAssetKey } from '@/portfolio/assetIdentity';

const store = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  gets: 0,
  sets: 0,
  blockNextSet: undefined as Promise<void> | undefined,
}));

vi.mock('@extension-base/stores/Storage', () => ({
  storage: {
    get: vi.fn(async (keys: string[]) => {
      store.gets += 1;

      return Object.fromEntries(keys.map((key) => [key, structuredClone(store.data[key])]));
    }),
    set: vi.fn(async (value: Record<string, unknown>) => {
      store.sets += 1;
      const blocked = store.blockNextSet;
      store.blockNextSet = undefined;
      const snapshot = structuredClone(value);
      if (blocked) await blocked;
      Object.assign(store.data, snapshot);
    }),
  },
}));

type Cache = Record<string, Record<string, BalanceItem & { chain: string }>>;

const WALLETS = ['w1', 'w2', 'w3', 'w4', 'w5'];
// 17 EVM networks with 6 assets each: one wallet-screen refresh of 102 assets.
const NETWORKS = Array.from({ length: 17 }, (_, n) => ({
  name: `Evm${n}`,
  ecosystem: 'ethereum',
  chainId: String(n + 1),
  assets: Array.from({ length: 6 }, (_, a) => ({ id: `0x${n}${a}`.padEnd(42, '0'), symbol: `T${a}`, precision: 18 })),
})) as unknown as NetworkJson[];
const key = (network: NetworkJson, id: string) =>
  createAssetKey({ ecosystem: 'ethereum', chainId: String(network.chainId), assetId: id });

function backgroundWithWarmCache() {
  // Every wallet already holds 327 cached balances.
  store.data = {
    assetBalances: Object.fromEntries(WALLETS.map((address) => [address, Object.fromEntries(
      Array.from({ length: 327 }, (_, i) => [`substrate:chain${i}:asset${i}`, {
        chain: `Chain${i}`, id: `asset${i}`, symbol: 'TKN', name: `chain${i}`, state: APIItemState.READY,
        total: '12.345678', transferable: '12.345678', precision: 18, timestamp: 1_000,
      }])
    )])),
    networkScanStates: {},
  };
  store.gets = 0;
  store.sets = 0;
  const service = new BalanceService({
    keyringService: {
      getAllMainAccounts: () => WALLETS.map((address) => ({ address, meta: {} })),
      getSubstrateAddress: (address: string) => address,
    },
    networkService: { networkValues: NETWORKS },
    timeoutService: { lazyNext: vi.fn() },
  } as unknown as State);
  WALLETS.forEach((address) => {
    service.balanceMap[address] = NETWORKS.flatMap(({ name, assets }) => assets.map(({ id, symbol, precision }) => ({
      groupId: id, symbol, tokenName: symbol, mainNetwork: name, providers: [], relayChain: 'ethereum',
      balances: [{ id, name: name.toLowerCase(), symbol, precision, state: APIItemState.PENDING }],
    }))) as never;
  });
  const loaded = (total: string) => ({ state: APIItemState.READY, relayChain: 'ethereum', total, transferable: total, free: total });
  // A change queued last is written with, or after, every change queued before it.
  const written = () => service.deleteBalanceStore('Evm0', { id: 'never-cached' }, 'w1');

  return { loaded, service, written };
}

describe('balance cache writes', () => {
  it('writes one refresh of 102 EVM assets with one read and one write, keeping every other cached balance', async () => {
    const { loaded, service, written } = backgroundWithWarmCache();

    NETWORKS.forEach(({ name, assets }) => assets.forEach(({ id, symbol }) =>
      service.setBalanceItem(name, { id, symbol, ...loaded('1') }, 'w1')));
    await written();

    expect({ gets: store.gets, sets: store.sets }).toEqual({ gets: 1, sets: 1 });
    const cache = store.data.assetBalances as Cache;
    expect(NETWORKS.flatMap((network) => network.assets.map(({ id }) => cache.w1[key(network, id)]?.total)))
      .toEqual(Array(102).fill('1'));
    // Every wallet keeps its earlier cache, w1 included.
    expect(WALLETS.map((address) => Object.keys(cache[address]).length)).toEqual([327 + 102, 327, 327, 327, 327]);
    expect((store.data.networkScanStates as Record<string, Record<string, unknown>>).w1.Evm16)
      .toMatchObject({ stale: false });
  });

  it('applies changes made while a write is in flight on top of it, in the order they were made', async () => {
    const { loaded, service, written } = backgroundWithWarmCache();
    const [network] = NETWORKS;
    const { id, symbol } = network.assets[0];
    let release!: () => void;
    store.blockNextSet = new Promise<void>((resolve) => { release = resolve; });

    service.setBalanceItem(network.name, { id, symbol, ...loaded('1') }, 'w1');
    await vi.waitFor(() => expect(store.sets).toBe(1));
    // Both arrive while the first write has not landed yet.
    service.setBalanceItem(network.name, { id, symbol, ...loaded('2') }, 'w1');
    service.setBalanceItem(network.name, { id, symbol, ...loaded('3') }, 'w2');
    release();
    await written();

    const cache = store.data.assetBalances as Cache;
    expect([cache.w1[key(network, id)].total, cache.w2[key(network, id)].total]).toEqual(['2', '3']);
    expect({ gets: store.gets, sets: store.sets }).toEqual({ gets: 2, sets: 2 });
  });
});
