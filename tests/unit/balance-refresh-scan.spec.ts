import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APIItemState } from '@extension-base/api/types/networks';
import BalanceService, { BALANCE_STORAGE_WRITE_DELAY_MS } from '@extension-base/services/balance-service';
import type { BalanceItem, NetworkScanState } from '@extension-base/api/evm/types';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { buildPortfolioSections, createAssetKey } from '@/portfolio/assetIdentity';

const storageMock = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('@extension-base/stores/Storage', () => ({ storage: storageMock }));

const rootA = 'substrate-owner-a';
const rootB = 'substrate-owner-b';
const evmA = `0x${'aa'.repeat(20)}`;
const evmB = `0x${'bb'.repeat(20)}`;
const tokenId = `0x${'cc'.repeat(20)}`;
const nativeId = 'ETH';
const cachedAt = 1_000;
let now = 2_000;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makeNetwork(name: string, chainId: string): NetworkJson {
  return {
    name,
    chainId,
    ecosystem: 'ethereum',
    icon: 'ethereum',
    active: true,
    assets: [
      { id: nativeId, symbol: 'ETH', precision: 18, isUtility: true },
      { id: tokenId, symbol: 'USD', precision: 18 },
    ],
  } as NetworkJson;
}

const networks = [makeNetwork('Ethereum', '1'), makeNetwork('Polygon', '137')];
const assetKey = (network: NetworkJson, assetId: string) => createAssetKey({
  ecosystem: network.ecosystem,
  chainId: String(network.chainId),
  assetId,
});
const units = (amount: number) => BigInt(amount) * 10n ** 18n;
// Storage mocks resolve on microtasks. The first turn lets answered reads queue their writes; balance writes then
// wait BALANCE_STORAGE_WRITE_DELAY_MS, so a timer set after that fires once the queued read/merge/write has run.
const flushStorage = async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await new Promise<void>((resolve) => setTimeout(resolve, BALANCE_STORAGE_WRITE_DELAY_MS));
};

type StoredBalance = BalanceItem & { chain: string };
type Persisted = {
  assetBalances: Record<string, Record<string, StoredBalance>>;
  networkScanStates: Record<string, Record<string, NetworkScanState>>;
};
type Batch = {
  native: ReturnType<typeof deferred<bigint>>;
  token: ReturnType<typeof deferred<bigint>>;
  nativeStarted: boolean;
  tokenStarted: boolean;
};

async function fixture() {
  const persisted: Persisted = { assetBalances: {}, networkScanStates: {} };
  for (const address of [rootA, rootB]) {
    persisted.assetBalances[address] = {};
    persisted.networkScanStates[address] = {};
    for (const network of networks) {
      persisted.networkScanStates[address][network.name] = {
        lastAttempt: cachedAt, lastSuccess: cachedAt, stale: false, coverage: 'catalogOnly',
      };
      for (const asset of network.assets) {
        const total = asset.isUtility ? '3' : '7';
        persisted.assetBalances[address][assetKey(network, asset.id)] = {
          ...asset,
          chain: network.name,
          name: network.name,
          icon: network.icon,
          relayChain: 'ethereum',
          type: 'normal',
          state: APIItemState.READY,
          total,
          free: total,
          transferable: total,
          timestamp: cachedAt,
          assetMetadataTrust: 'verified',
        } as StoredBalance;
      }
    }
  }
  storageMock.get.mockImplementation(async () => structuredClone(persisted));
  storageMock.set.mockImplementation(async (value: Partial<Persisted>) => {
    Object.assign(persisted, structuredClone(value));
  });
  const batches = new Map<string, Batch>();
  const apis = Object.fromEntries(networks.map((network) => [network.name, {
    timeout: {} as Record<string, number>,
    api: {
      network: network.name,
      getBalance: vi.fn((address: string) => {
        const batch = batches.get(`${network.name}:${address}`)!;
        batch.nativeStarted = true;
        return batch.native.promise;
      }),
    },
  }]));
  let loseTokenApi = false;
  const state = {
    isReady: () => true,
    getEvmApi: (name: string) => loseTokenApi && [...batches.values()].some(({ nativeStarted }) => nativeStarted)
      ? { timeout: apis[name].timeout, api: undefined }
      : apis[name],
    currentAccount: { address: rootA, ethereumAddress: evmA },
    keyringService: {
      getAllMainAccounts: () => [{ address: rootA }, { address: rootB }],
      getSubstrateAddress: (address: string) => address === evmA ? rootA : address === evmB ? rootB : address,
    },
    networkService: {
      networkValues: networks,
      networkMap: Object.fromEntries(networks.map((network) => [network.name, network])),
      evmApiHandler: { refreshEvmApi: vi.fn() },
    },
    evmContractService: {
      getContract: async (_id: string, api: { network: string }) => ({
        balanceOf: (address: string) => {
          const batch = batches.get(`${api.network}:${address}`)!;
          batch.tokenStarted = true;
          return batch.token.promise;
        },
      }),
    },
    timeoutService: { lazyNext: vi.fn() },
  } as unknown as State;

  async function hydrate() {
    const service = new BalanceService(state);
    state.balanceService = service;
    await service.hydrateBalanceStorage([rootA, rootB]);
    return service;
  }
  const service = await hydrate();
  async function startRefresh({
    name = 'Ethereum', ethereumAddress = evmA, assetId, waitForStart = true,
  }: { name?: string; ethereumAddress?: string; assetId?: string; waitForStart?: boolean } = {}) {
    const batch: Batch = {
      native: deferred<bigint>(), token: deferred<bigint>(), nativeStarted: false, tokenStarted: false,
    };
    batches.set(`${name}:${ethereumAddress}`, batch);
    const finished = state.balanceService.evmBalanceService.fetchBalance({
      networks: [name], ethereumAddress, assetId, force: true,
    });
    if (waitForStart) await vi.waitFor(() => {
      if (!assetId || assetId === nativeId) expect(batch.nativeStarted).toBe(true);
      if (!assetId || assetId === tokenId) expect(batch.tokenStarted).toBe(true);
    });
    return { ...batch, isStarted: () => batch.nativeStarted || batch.tokenStarted, finished };
  }
  const scan = (address = rootA, name = 'Ethereum') => persisted.networkScanStates[address][name];
  const balance = (assetId: string, address = rootA, name = 'Ethereum') =>
    state.balanceService.balanceMap[address].flatMap(({ balances }) => balances)
      .find((item) => item.id === assetId && item.name === name)!;
  const section = () => buildPortfolioSections({
    groups: state.balanceService.balanceMap[rootA],
    networks,
    prices: {},
    preferences: {},
    addressForNetwork: () => evmA,
    scanStates: state.balanceService.networkScanStates[rootA],
  }).find(({ name }) => name === 'Ethereum')!;
  return {
    service, persisted, startRefresh, hydrate, scan, balance, section,
    loseTokenApiAfterNativeStarts: () => { loseTokenApi = true; },
  };
}

beforeEach(() => {
  storageMock.get.mockReset();
  storageMock.set.mockReset();
  now = 2_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('network scan state across concurrent EVM assets', () => {
  it.each([
    ['native', 'first'], ['native', 'last'], ['token', 'first'], ['token', 'last'],
  ] as const)('keeps a %s failure completing %s and its cached balance visible', async (failedAsset, order) => {
    const context = await fixture();
    const batch = await context.startRefresh();
    const failedId = failedAsset === 'native' ? nativeId : tokenId;
    const successfulAsset = failedAsset === 'native' ? 'token' : 'native';
    const fail = () => batch[failedAsset].reject(new Error('RPC unavailable'));
    const succeed = () => batch[successfulAsset].resolve(units(5));
    if (order === 'first') {
      fail();
      await flushStorage();
      succeed();
    } else {
      succeed();
      await flushStorage();
      fail();
    }
    await batch.finished;
    await flushStorage();

    expect(context.scan()).toMatchObject({ stale: true, error: 'balance_scan_failed', lastSuccess: cachedAt });
    expect(context.balance(failedId)).toMatchObject({
      state: APIItemState.ERROR, total: failedAsset === 'native' ? '3' : '7', timestamp: cachedAt,
    });
    expect(context.persisted.assetBalances[rootA][assetKey(networks[0], failedId)]).toMatchObject({
      state: APIItemState.READY, total: failedAsset === 'native' ? '3' : '7', timestamp: cachedAt,
    });
    expect(context.section()).toMatchObject({ stale: true, error: 'balance_scan_failed', latestTimestamp: cachedAt });
    expect(context.section().assets.find(({ assetId }) => assetId === failedId)?.balanceText)
      .toBe(failedAsset === 'native' ? '3' : '7');
  });

  it('keeps the previous failure and success time throughout a retry until every asset succeeds', async () => {
    const context = await fixture();
    const failed = await context.startRefresh();
    failed.native.resolve(units(4));
    await flushStorage();
    failed.token.reject(new Error('RPC unavailable'));
    await failed.finished;
    await flushStorage();
    const previousScan = structuredClone(context.scan());

    now = 3_000;
    const retry = await context.startRefresh();
    retry.token.resolve(units(8));
    await flushStorage();
    expect(context.balance(tokenId).total).toBe('8.0');
    expect(context.scan()).toMatchObject({
      stale: true, error: 'balance_scan_failed', lastSuccess: previousScan.lastSuccess,
    });
    expect(context.section()).toMatchObject({ stale: true, error: 'balance_scan_failed' });

    retry.native.resolve(units(6));
    await retry.finished;
    await flushStorage();
    expect(context.scan()).toMatchObject({ stale: false, lastSuccess: now });
    expect(context.scan().error).toBeUndefined();
    expect(context.section()).toMatchObject({ stale: false, latestTimestamp: now });
    expect(context.section().error).toBeUndefined();
  });

  it.each([false, true])('does not let an unrelated targeted success clear a failed asset (hydrated=%s)', async (restart) => {
    const context = await fixture();
    const failed = await context.startRefresh();
    failed.native.resolve(units(4));
    await flushStorage();
    failed.token.reject(new Error('RPC unavailable'));
    await failed.finished;
    await flushStorage();
    const previousScan = structuredClone(context.scan());
    if (restart) await context.hydrate();

    now = 3_000;
    const targeted = await context.startRefresh({ assetId: nativeId });
    targeted.native.resolve(units(9));
    await targeted.finished;
    await flushStorage();
    expect(context.balance(nativeId).total).toBe('9.0');
    expect(context.scan()).toMatchObject({
      stale: true, error: 'balance_scan_failed', lastSuccess: previousScan.lastSuccess,
    });
    expect(context.section()).toMatchObject({ stale: true, error: 'balance_scan_failed' });
    expect(context.section().assets.find(({ assetId }) => assetId === tokenId)?.balanceText).toBe('7');
  });

  it('queues overlapping refreshes of the same account and network until the earlier scan finishes', async () => {
    const context = await fixture();
    const first = await context.startRefresh();
    const second = await context.startRefresh({ waitForStart: false });
    await flushStorage();
    expect(second.isStarted()).toBe(false);

    first.token.reject(new Error('RPC unavailable'));
    first.native.resolve(units(4));
    await first.finished;
    await vi.waitFor(() => expect(second.isStarted()).toBe(true));
    second.token.resolve(units(8));
    await flushStorage();
    expect(context.scan()).toMatchObject({ stale: true, error: 'balance_scan_failed', lastSuccess: cachedAt });

    now = 3_000;
    second.native.resolve(units(6));
    await second.finished;
    await flushStorage();
    expect(context.scan()).toMatchObject({ stale: false, lastSuccess: now });
    expect(context.scan().error).toBeUndefined();
    expect(context.balance(nativeId).total).toBe('6.0');
    expect(context.balance(tokenId).total).toBe('8.0');
  });

  it('requires a full successful refresh to clear a hydrated legacy failure without asset identities', async () => {
    const context = await fixture();
    context.persisted.networkScanStates[rootA].Ethereum = {
      lastAttempt: 1_500,
      lastSuccess: cachedAt,
      stale: true,
      error: 'balance_scan_failed',
      coverage: 'catalogOnly',
    };
    await context.hydrate();
    const targeted = await context.startRefresh({ assetId: nativeId });
    targeted.native.resolve(units(5));
    await targeted.finished;
    await flushStorage();
    expect(context.scan()).toMatchObject({ stale: true, error: 'balance_scan_failed', lastSuccess: cachedAt });

    now = 3_000;
    const full = await context.startRefresh();
    full.native.resolve(units(6));
    full.token.resolve(units(8));
    await full.finished;
    await flushStorage();
    expect(context.scan()).toMatchObject({ stale: false, lastSuccess: now });
    expect(context.scan().error).toBeUndefined();
  });

  it('waits for pending assets and keeps failure when the token provider disappears mid-refresh', async () => {
    const context = await fixture();
    context.loseTokenApiAfterNativeStarts();
    const batch = await context.startRefresh({ waitForStart: false });
    let settled = false;
    const outcome = batch.finished.then(() => 'resolved', () => 'rejected').finally(() => { settled = true; });
    await vi.waitFor(() => expect(batch.isStarted()).toBe(true));
    await flushStorage();
    expect(settled).toBe(false);
    expect(context.scan().lastSuccess).toBe(cachedAt);

    batch.native.resolve(units(5));
    await expect(outcome).resolves.toBe('rejected');
    await flushStorage();
    expect(context.scan()).toMatchObject({ stale: true, error: 'balance_scan_failed', lastSuccess: cachedAt });
    expect(context.section()).toMatchObject({ stale: true, error: 'balance_scan_failed' });
    expect(context.balance(tokenId).total).toBe('7');
  });

  it('preserves scan and balance writes for simultaneous refreshes on different networks and accounts', async () => {
    const context = await fixture();
    const first = await context.startRefresh();
    const otherNetwork = await context.startRefresh({ name: 'Polygon' });
    const otherAccount = await context.startRefresh({ ethereumAddress: evmB });
    const blockedWrite = deferred<void>();
    const baseSet = storageMock.set.getMockImplementation()!;
    let blocked = false;
    storageMock.set.mockImplementation(async (value: Partial<Persisted>) => {
      if (!blocked) {
        blocked = true;
        await blockedWrite.promise;
      }
      await baseSet(value);
    });
    first.token.reject(new Error('RPC unavailable'));
    await vi.waitFor(() => expect(blocked).toBe(true));
    otherNetwork.native.resolve(units(11));
    otherNetwork.token.resolve(units(12));
    otherAccount.native.resolve(units(21));
    otherAccount.token.resolve(units(22));
    first.native.resolve(units(5));
    await flushStorage();
    blockedWrite.resolve();
    await Promise.all([first.finished, otherNetwork.finished, otherAccount.finished]);
    await flushStorage();

    expect(context.persisted.assetBalances[rootA][assetKey(networks[0], nativeId)].total).toBe('5.0');
    expect(context.persisted.assetBalances[rootA][assetKey(networks[0], tokenId)].total).toBe('7');
    expect(context.persisted.assetBalances[rootA][assetKey(networks[1], nativeId)].total).toBe('11.0');
    expect(context.persisted.assetBalances[rootA][assetKey(networks[1], tokenId)].total).toBe('12.0');
    expect(context.persisted.assetBalances[rootB][assetKey(networks[0], nativeId)].total).toBe('21.0');
    expect(context.persisted.assetBalances[rootB][assetKey(networks[0], tokenId)].total).toBe('22.0');
    expect(context.scan()).toMatchObject({ stale: true, error: 'balance_scan_failed', lastSuccess: cachedAt });
    expect(context.scan(rootA, 'Polygon')).toMatchObject({ stale: false, lastSuccess: now });
    expect(context.scan(rootB)).toMatchObject({ stale: false, lastSuccess: now });
  });
});
