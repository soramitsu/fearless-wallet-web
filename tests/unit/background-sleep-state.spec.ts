import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject, Subject } from 'rxjs';
import State from '@extension-base/background/handlers/State';
import { QUIET_AFTER_MS, WorkerSleepService } from '@extension-base/services/worker-sleep-service';
import { WalletEcosystem } from '@/interfaces';

vi.mock('@subwallet/ui-keyring', () => ({ keyring: {} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: { alice: {} } } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@extension-base/services', async () => await import('@extension-base/services/asset-discovery-service'));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: { runtime: { getURL: (path: string) => path } } }));
vi.mock('@extension-base/stores/Storage', () => ({ storage: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } }));
vi.mock('@polkadot/extension-chains', () => ({ addMetadata: vi.fn() }));

const deferred = <T = void>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
};
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const never = new Promise<void>(() => undefined);

// The background state as the extension worker builds it, with the services around it replaced.
function fixture() {
  const ethereum = { name: 'Ethereum', ecosystem: 'ethereum', chainId: '1', active: true, favorite: [] };
  const suspended = new BehaviorSubject(false);
  const networkService = {
    networkMap: { Ethereum: ethereum },
    networkValues: [ethereum],
    getApiMap: { substrate: {}, evm: {}, ton: {} },
    suspendedSubject: suspended,
    get suspended() { return suspended.value; },
    suspend: vi.fn(async () => suspended.next(true)),
    resume: vi.fn(() => suspended.next(false)),
    initNetworkMap: vi.fn().mockResolvedValue(undefined),
    initNetworkApis: vi.fn(),
    connectNetwork: vi.fn(() => true),
    getNetworkJson: (name: string) => (name.toLowerCase() === 'ethereum' ? ethereum : undefined),
    updateNetworkStore: vi.fn(),
  };
  const state = Object.setPrototypeOf({
    ready: false,
    currentAccount: { address: 'alice', ethereumAddress: '0x' + '11'.repeat(20) },
    serviceInfoSubject: new Subject(),
    keyringService: { getAllMainAccounts: () => [{ address: 'alice', meta: { walletEcosystem: WalletEcosystem.Substrate } }] },
    networkService,
    actionCapabilityService: { init: vi.fn().mockResolvedValue(undefined) },
    sendKillSwitchService: { init: vi.fn().mockResolvedValue(undefined) },
    soraDisclaimerService: { init: vi.fn().mockResolvedValue(undefined) },
    eventService: { waitCryptoReady: Promise.resolve(true) },
    balanceService: { generateDefaultBalance: vi.fn(), hydrateBalanceStorage: vi.fn().mockResolvedValue(undefined), publishBalance: vi.fn() },
    scamService: { refreshScamAddressList: vi.fn(), scamMap: new Map() },
    subscriptionService: { start: vi.fn(), stop: vi.fn() },
    cronService: { start: vi.fn(), stop: vi.fn() },
    poolsService: { unsubscribePools: vi.fn() },
    assetDiscoverySweepService: { runIfDue: vi.fn().mockResolvedValue({ due: false }) },
    requestService: { numRequests: 0 },
    walletConnectService: { sessions: [] as unknown[] },
    walletConnectDappService: { sessions: [] as unknown[] },
    irohaConnectService: { snapshot: { phase: 'idle' } },
  }, State.prototype) as Record<string, any>;
  // Wired as the State constructor wires it.
  state.workerSleepService = new WorkerSleepService(
    { hasOpenWork: () => state.hasOpenWork(), quiet: () => state.quiet(), restore: () => state.restore() },
    true
  );
  const published = vi.fn();
  state.serviceInfoSubject.subscribe(published);
  return { state, networkService, ethereum, published };
}

// The constructor suspends the network service, then starts init().
async function startQuiet() {
  const f = fixture();
  await f.networkService.suspend();
  await f.state.init();
  return f;
}

const connected = (state: Record<string, any>) => ({
  apis: state.networkService.initNetworkApis.mock.calls.length,
  subscriptions: state.subscriptionService.start.mock.calls.length,
  jobs: state.cronService.start.mock.calls.length,
});

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('the background state while the worker is quiet', () => {
  it('reads settings and cached balances at start-up but opens no connection, subscription or job', async () => {
    const { state, published } = await startQuiet();

    expect(state.isReady()).toBe(true);
    expect(state.networkService.initNetworkMap).toHaveBeenCalledOnce();
    expect(state.balanceService.hydrateBalanceStorage).toHaveBeenCalledWith(['alice']);
    expect(connected(state)).toEqual({ apis: 0, subscriptions: 0, jobs: 0 });
    // Pages and sites that ask see the loaded networks.
    expect(published).toHaveBeenCalledOnce();
  });

  it('publishes the stored balances as soon as they are read, before any connection reads them again', async () => {
    const { state, networkService } = fixture();
    const stored = deferred();
    state.balanceService.hydrateBalanceStorage.mockReturnValueOnce(stored.promise);
    await networkService.suspend();
    const starting = state.init();
    await settle();
    expect(state.balanceService.publishBalance).not.toHaveBeenCalled();

    stored.resolve();
    await starting;
    expect(state.balanceService.publishBalance).toHaveBeenCalledOnce();
    expect(connected(state)).toEqual({ apis: 0, subscriptions: 0, jobs: 0 });

    // Restoring publishes them again before the connections open and read them.
    state.workerSleepService.pageOpened(never);
    await settle();
    expect(state.balanceService.publishBalance).toHaveBeenCalledTimes(2);
    expect(state.balanceService.publishBalance.mock.invocationCallOrder[1])
      .toBeLessThan(networkService.initNetworkApis.mock.invocationCallOrder[0]);
  });

  it('opens them for the first wallet page, by running init() again', async () => {
    const { state } = await startQuiet();

    state.workerSleepService.pageOpened(never);
    await settle();

    expect(state.networkService.resume).toHaveBeenCalledOnce();
    expect(state.networkService.initNetworkMap).toHaveBeenCalledTimes(2);
    expect(connected(state)).toEqual({ apis: 1, subscriptions: 1, jobs: 1 });
  });

  it('lets a page that arrives during start-up wait for it instead of loading twice', async () => {
    const { state, networkService } = fixture();
    const crypto = deferred<boolean>();
    state.eventService.waitCryptoReady = crypto.promise;
    await networkService.suspend();
    const starting = state.init();

    state.workerSleepService.pageOpened(never);
    await settle();
    expect(networkService.resume).toHaveBeenCalledOnce();
    expect(connected(state)).toEqual({ apis: 0, subscriptions: 0, jobs: 0 });

    crypto.resolve(true);
    await starting;
    await settle();

    expect(networkService.initNetworkMap).toHaveBeenCalledOnce();
    expect(connected(state)).toEqual({ apis: 1, subscriptions: 1, jobs: 1 });
  });

  it('loads again when a page arrives after a quiet start-up passed the connecting step', async () => {
    const { state, networkService } = fixture();
    const balances = deferred();
    state.balanceService.hydrateBalanceStorage.mockReturnValueOnce(balances.promise);
    await networkService.suspend();
    const starting = state.init();
    await settle();
    balances.resolve();
    await starting;

    state.workerSleepService.pageOpened(never);
    await settle();

    expect(networkService.initNetworkMap).toHaveBeenCalledTimes(2);
    expect(connected(state)).toEqual({ apis: 1, subscriptions: 1, jobs: 1 });
  });

  it('closes the jobs, subscriptions, pools and connections a minute after the last page, and reopens them', async () => {
    const { state, networkService } = await startQuiet();
    const closePage = deferred();
    state.workerSleepService.pageOpened(closePage.promise);
    await settle();

    closePage.resolve();
    await vi.advanceTimersByTimeAsync(QUIET_AFTER_MS);

    expect(state.cronService.stop).toHaveBeenCalledOnce();
    expect(state.subscriptionService.stop).toHaveBeenCalledOnce();
    expect(state.poolsService.unsubscribePools).toHaveBeenCalledOnce();
    expect(networkService.suspend).toHaveBeenCalledTimes(2);
    expect(networkService.suspended).toBe(true);
    expect(state.workerSleepService.isQuiet).toBe(true);

    // A site's request opens them again before it is handled.
    const release = state.workerSleepService.hold();
    await state.workerSleepService.wake();
    release();

    expect(networkService.suspended).toBe(false);
    expect(connected(state)).toEqual({ apis: 2, subscriptions: 2, jobs: 2 });
  });

  it('counts queued requests and open sessions as work that keeps the connections open', () => {
    const { state } = fixture();
    expect(state.hasOpenWork()).toBe(false);

    state.requestService.numRequests = 1;
    expect(state.hasOpenWork()).toBe(true);
    state.requestService.numRequests = 0;

    state.walletConnectService.sessions = [{ topic: 'wallet' }];
    expect(state.hasOpenWork()).toBe(true);
    state.walletConnectService.sessions = [];

    state.walletConnectDappService.sessions = [{ topic: 'mobile' }];
    expect(state.hasOpenWork()).toBe(true);
    state.walletConnectDappService.sessions = [];

    for (const phase of ['connecting', 'session-approval', 'connected', 'request-approval']) {
      state.irohaConnectService.snapshot = { phase };
      expect(state.hasOpenWork()).toBe(true);
    }
    for (const phase of ['idle', 'error']) {
      state.irohaConnectService.snapshot = { phase };
      expect(state.hasOpenWork()).toBe(false);
    }
  });

  it('reconnects an active network a site uses when its connection was closed while quiet', async () => {
    const { state, networkService, ethereum, published } = fixture();

    await state.activateDappNetwork('Ethereum');
    expect(networkService.connectNetwork).not.toHaveBeenCalled();

    state.ready = true;
    await state.activateDappNetwork('Ethereum');
    expect(networkService.connectNetwork).toHaveBeenCalledExactlyOnceWith(ethereum);
    expect(published).toHaveBeenCalledOnce();

    // Already connected: nothing to publish.
    networkService.connectNetwork.mockReturnValueOnce(false);
    await state.activateDappNetwork('Ethereum');
    expect(published).toHaveBeenCalledOnce();
    expect(ethereum.active).toBe(true);
    expect(networkService.updateNetworkStore).not.toHaveBeenCalled();
  });

  it('keeps the connections while a discovery sweep runs, then closes what it opened', async () => {
    const { state, networkService } = await startQuiet();
    const sweep = deferred<{ due: boolean }>();
    state.assetDiscoverySweepService.runIfDue.mockReturnValueOnce(sweep.promise);

    const running = state.runAssetDiscovery({ force: true });
    await vi.advanceTimersByTimeAsync(5 * QUIET_AFTER_MS);
    expect(networkService.suspend).toHaveBeenCalledOnce();

    sweep.resolve({ due: true });
    await running;
    await vi.advanceTimersByTimeAsync(QUIET_AFTER_MS);

    expect(state.assetDiscoverySweepService.runIfDue).toHaveBeenLastCalledWith({ force: true });
    expect(networkService.suspend).toHaveBeenCalledTimes(2);
    // A sweep alone does not open the wallet's own connections.
    expect(connected(state)).toEqual({ apis: 0, subscriptions: 0, jobs: 0 });
  });
});
