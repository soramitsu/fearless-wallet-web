import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FIRST_SERVICE_INFO_DELAY_MS,
  SERVICE_INFO_DELAY_MS,
  SubscriptionService,
} from '@extension-base/services/subscription-service';
import { TimeoutService } from '@extension-base/services/timeout-service';
import type State from '@extension-base/background/handlers/State';
import type { ServiceInfo } from '@extension-base/background/types/types';
import { WalletEcosystem } from '@/interfaces';

vi.mock('@/helpers', () => ({ isSameString: (a: string, b: string) => a === b }));
vi.mock('@/consts/global', () => ({ IS_EXTENSION_SMOKE: false }));

function fixture() {
  const state = {
    requestService: { mutateAuthorizations: vi.fn().mockResolvedValue(undefined) },
    currentAccount: { address: 'wallet-a', ethereumAddress: '' },
    keyringService: { getAllMainAccounts: vi.fn().mockReturnValue([]) },
    networkService: { activeNetworkByEcosystem: {
      substrateList: ['polkadot'], evmList: [], tonList: [], solanaList: [], bitcoinList: [], irohaList: [],
    } },
    serviceInfoSubject: new Subject<ServiceInfo>(),
    timeoutService: new TimeoutService({} as State),
    cronService: { updateCron: vi.fn() },
    nftService: { publishNfts: vi.fn() },
    balanceService: {
      generateDefaultBalance: vi.fn(), fetchBalance: vi.fn(),
      substrateBalanceService: { subscribeSubstrateBalances: vi.fn().mockReturnValue([]) },
    },
  };
  return { state, service: new SubscriptionService(state as unknown as State) };
}

function info(networks: string[]): ServiceInfo {
  return {
    currentAccountInfo: { address: 'wallet-a', ethereumAddress: '', walletEcosystem: WalletEcosystem.Substrate },
    apiMap: { substrate: Object.fromEntries(networks.map((name) => [name, {}])), evm: {}, ton: {} },
  } as unknown as ServiceInfo;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('balance subscription lifecycle', () => {
  it('disposes a late cleanup handle if synchronous delivery already closed the client', () => {
    const { service } = fixture();
    const port = { postMessage: () => { throw new Error('closed'); } };
    const send = service.createSubscription('early-close', port as never);
    send(null);
    const cleanup = vi.fn();
    service.setUnsubscriptionHandle('early-close', cleanup, port as never);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('releases client resources after a delivery failure', () => {
    const { service } = fixture();
    const port = { postMessage: () => { throw new Error('closed'); } };
    const send = service.createSubscription('failed', port as never);
    const cleanup = vi.fn();
    service.setUnsubscriptionHandle('failed', cleanup, port as never);
    send(null);
    send(null);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('does not revive an old sender when its subscription ID is reused', () => {
    const { service } = fixture();
    const port = { postMessage: vi.fn() };
    const oldSend = service.createSubscription('reused', port as never);
    const cleanup = vi.fn();
    service.setUnsubscriptionHandle('reused', cleanup, port as never);
    const newSend = service.createSubscription('reused', port as never);
    oldSend(null);
    newSend(null);
    expect(port.postMessage).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it.each(['wallet-signing', '__proto__', 'constructor'])('isolates caller-selected ID %s by port', (id) => {
    const { service } = fixture();
    const wallet = { postMessage: vi.fn() }, site = { postMessage: vi.fn() };
    const walletCleanup = vi.fn(), siteCleanup = vi.fn();
    const walletSend = service.createSubscription(id, wallet as never);
    service.setUnsubscriptionHandle(id, walletCleanup, wallet as never);
    const siteSend = service.createSubscription(id, site as never);
    service.setUnsubscriptionHandle(id, siteCleanup, site as never);

    walletSend(null);
    siteSend(null);
    expect(wallet.postMessage).toHaveBeenCalledWith({ id, subscription: null });
    expect(site.postMessage).toHaveBeenCalledWith({ id, subscription: null });
    expect(walletCleanup).not.toHaveBeenCalled();
    service.cancelSubscription(id, site as never);
    service.cancelSubscription(id); // A web-channel request is a different owner too.
    walletSend(null);
    siteSend(null);
    expect(wallet.postMessage).toHaveBeenCalledTimes(2);
    expect(site.postMessage).toHaveBeenCalledOnce();
    expect(walletCleanup).not.toHaveBeenCalled();
    expect(siteCleanup).toHaveBeenCalledOnce();
  });

  it('does not let a stale disconnected port cancel a new client with the same ID', () => {
    const { service } = fixture();
    const oldPort = { postMessage: vi.fn() }, newPort = { postMessage: vi.fn() };
    service.createSubscription('reused', oldPort as never);
    service.cancelSubscription('reused', oldPort as never);
    const send = service.createSubscription('reused', newPort as never);
    const cleanup = vi.fn();
    service.setUnsubscriptionHandle('reused', cleanup, newPort as never);
    service.cancelSubscription('reused', oldPort as never);
    send(null);
    expect(newPort.postMessage).toHaveBeenCalledOnce();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('closes a broadcast sender even when postMessage throws', () => {
    const { service } = fixture();
    const close = vi.fn();
    vi.stubGlobal('BroadcastChannel', class {
      postMessage() { throw new Error('closed'); }
      close = close;
    });
    try {
      service.createSubscription('broadcast')(null);
      expect(close).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });

  it('does not install a subscription that resolves after cancellation', async () => {
    const { service, state } = fixture();
    let resolve!: (value: { networkName: string; unsub: () => void }) => void;
    state.balanceService.substrateBalanceService.subscribeSubstrateBalances.mockReturnValue([
      new Promise((done) => { resolve = done; }),
    ] as never);
    const pending = service.subscribeSubstrateBalances({ address: 'wallet-a', ethereumAddress: '', substrateNetworks: ['polkadot'] });
    service.cancelNetworkSubscription('polkadot');
    const unsub = vi.fn();
    resolve({ networkName: 'polkadot', unsub });
    await pending;
    expect(unsub).toHaveBeenCalledOnce();
    expect(service.subscriptionNetworksMap).toEqual({});
  });

  it('keeps the newest subscription when setup promises resolve out of order', async () => {
    const { service, state } = fixture();
    let resolveOld!: (value: { networkName: string; unsub: () => void }) => void;
    const oldUnsub = vi.fn(), newUnsub = vi.fn();
    state.balanceService.substrateBalanceService.subscribeSubstrateBalances
      .mockReturnValueOnce([new Promise((done) => { resolveOld = done; })] as never)
      .mockReturnValueOnce([Promise.resolve({ networkName: 'polkadot', unsub: newUnsub })] as never);
    const props = { address: 'wallet-a', ethereumAddress: '', substrateNetworks: ['polkadot'] };
    const oldRequest = service.subscribeSubstrateBalances(props);
    await service.subscribeSubstrateBalances(props);
    resolveOld({ networkName: 'polkadot', unsub: oldUnsub });
    await oldRequest;
    expect(oldUnsub).toHaveBeenCalledOnce();
    expect(newUnsub).not.toHaveBeenCalled();
    expect(service.subscriptionNetworksMap.polkadot).toBe(newUnsub);
  });

  it('does not replace current subscriptions with an obsolete account request', async () => {
    const { service, state } = fixture();
    const active = vi.fn();
    service.updateNetworkSubscription({ name: 'polkadot', func: active });
    await service.subscribeSubstrateBalances({ address: 'wallet-old', ethereumAddress: '', substrateNetworks: ['polkadot'] });
    expect(active).not.toHaveBeenCalled();
    expect(state.balanceService.substrateBalanceService.subscribeSubstrateBalances).not.toHaveBeenCalled();
    expect(service.subscriptionNetworksMap.polkadot).toBe(active);
  });

  it('disposes pending subscriptions if the Ethereum address changes', async () => {
    const { service, state } = fixture();
    let resolve!: (value: { networkName: string; unsub: () => void }) => void;
    state.balanceService.substrateBalanceService.subscribeSubstrateBalances.mockReturnValue([
      new Promise((done) => { resolve = done; }),
    ] as never);
    const pending = service.subscribeSubstrateBalances({ address: 'wallet-a', ethereumAddress: '', substrateNetworks: ['polkadot'] });
    state.currentAccount.ethereumAddress = '0x-new';
    const unsub = vi.fn();
    resolve({ networkName: 'polkadot', unsub });
    await pending;
    expect(unsub).toHaveBeenCalledOnce();
    expect(service.subscriptionNetworksMap).toEqual({});
  });

  it('refreshes Substrate subscriptions when an Ethereum-format account address changes', async () => {
    const { service, state } = fixture();
    await service.start();
    state.serviceInfoSubject.next(info(['polkadot']));
    vi.advanceTimersByTime(1000);
    const unsub = vi.fn();
    service.updateNetworkSubscription({ name: 'polkadot', func: unsub });
    state.currentAccount.ethereumAddress = '0x-new';
    const changed = info(['polkadot']);
    changed.currentAccountInfo!.ethereumAddress = '0x-new';
    state.serviceInfoSubject.next(changed);
    vi.advanceTimersByTime(1000);
    expect(unsub).toHaveBeenCalledOnce();
    expect(state.balanceService.substrateBalanceService.subscribeSubstrateBalances).toHaveBeenLastCalledWith(
      expect.objectContaining({ ethereumAddress: '0x-new', substrateNetworks: ['polkadot'] }), state, expect.any(Function)
    );
  });

  it('cleans up when the active account disappears', async () => {
    const { service, state } = fixture();
    await service.start();
    state.serviceInfoSubject.next(info(['polkadot']));
    vi.advanceTimersByTime(1000);
    const unsub = vi.fn();
    service.updateNetworkSubscription({ name: 'polkadot', func: unsub });
    state.serviceInfoSubject.next({ ...info([]), currentAccountInfo: undefined });
    vi.advanceTimersByTime(1000);
    expect(unsub).toHaveBeenCalledOnce();
    expect(service.subscriptionNetworksMap).toEqual({});
  });
  it('releases a replaced network subscription and cancels it only once', () => {
    const { service } = fixture();
    const old = vi.fn();
    const replacement = vi.fn();
    service.updateNetworkSubscription({ name: 'polkadot', func: old });
    service.updateNetworkSubscription({ name: 'polkadot', func: replacement });
    expect(old).toHaveBeenCalledOnce();
    expect(replacement).not.toHaveBeenCalled();
    service.cancelNetworkSubscription('polkadot');
    service.cancelNetworkSubscription('polkadot');
    expect(replacement).toHaveBeenCalledOnce();
    expect(service.subscriptionNetworksMap).toEqual({});
  });

  it('cancels removed networks while retaining the active subscription', async () => {
    const { service, state } = fixture();
    await service.start();
    state.serviceInfoSubject.next(info(['polkadot', 'kusama']));
    vi.advanceTimersByTime(1000);
    const polkadot = vi.fn();
    const kusama = vi.fn();
    service.updateNetworkSubscription({ name: 'polkadot', func: polkadot });
    service.updateNetworkSubscription({ name: 'kusama', func: kusama });
    state.serviceInfoSubject.next(info(['polkadot']));
    vi.advanceTimersByTime(1000);
    expect(kusama).toHaveBeenCalledOnce();
    expect(polkadot).not.toHaveBeenCalled();
    expect(Object.keys(service.subscriptionNetworksMap)).toEqual(['polkadot']);
    state.serviceInfoSubject.next(info([]));
    vi.advanceTimersByTime(1000);
    expect(polkadot).toHaveBeenCalledOnce();
    expect(service.subscriptionNetworksMap).toEqual({});
  });

  it('coalesces bursts of state changes and attaches just one state observer', async () => {
    const { service, state } = fixture();
    await service.start();
    await service.start();
    expect(state.serviceInfoSubject.observers).toHaveLength(1);
    state.serviceInfoSubject.next(info(['kusama']));
    const latest = info(['polkadot']);
    state.serviceInfoSubject.next(latest);
    // Nothing was read before the first change after a start: it is read almost at once.
    vi.advanceTimersByTime(FIRST_SERVICE_INFO_DELAY_MS - 1);
    expect(state.cronService.updateCron).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(state.cronService.updateCron).toHaveBeenCalledExactlyOnceWith(latest);
    expect(state.nftService.publishNfts).toHaveBeenCalledOnce();

    // Later changes are gathered for longer: a burst of network switches is read once.
    const next = info(['polkadot', 'kusama']);
    state.serviceInfoSubject.next(info(['polkadot', 'acala']));
    state.serviceInfoSubject.next(next);
    vi.advanceTimersByTime(SERVICE_INFO_DELAY_MS - 1);
    expect(state.cronService.updateCron).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    expect(state.cronService.updateCron).toHaveBeenLastCalledWith(next);
    expect(state.cronService.updateCron).toHaveBeenCalledTimes(2);
  });

  it('stops sending to a cancelled client and invokes its cleanup once', () => {
    const { service } = fixture();
    const port = { postMessage: vi.fn() };
    const cleanup = vi.fn();
    const send = service.createSubscription('client', port as never);
    service.setUnsubscriptionHandle('client', cleanup, port as never);
    send(null);
    expect(service.cancelSubscription('client', port as never)).toBe(true);
    send(null);
    expect(port.postMessage).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('stops retrying a port after delivery fails', () => {
    const { service } = fixture();
    const port = { postMessage: vi.fn().mockImplementation(() => { throw new Error('port closed'); }) };
    const send = service.createSubscription('closed', port as never);
    expect(() => send(null)).not.toThrow();
    send(null);
    expect(port.postMessage).toHaveBeenCalledOnce();
  });

  it('seeds first-run balances before fetching and uses subscriptions for later Substrate updates', async () => {
    const { service, state } = fixture();
    const props = { address: 'wallet-a', ethereumAddress: '', walletEcosystem: WalletEcosystem.Substrate,
      substrateNetworks: ['polkadot'], evmNetworks: ['ethereum'] };
    await service.fetchNetworkBalances({ ...props, isFirstRun: true });
    expect(state.balanceService.generateDefaultBalance).toHaveBeenCalledExactlyOnceWith('wallet-a', WalletEcosystem.Substrate);
    expect(state.balanceService.generateDefaultBalance.mock.invocationCallOrder[0]).toBeLessThan(
      state.balanceService.fetchBalance.mock.invocationCallOrder[0]
    );
    expect(state.balanceService.fetchBalance).toHaveBeenLastCalledWith({ ...props, isFirstRun: true });
    expect(state.balanceService.substrateBalanceService.subscribeSubstrateBalances).not.toHaveBeenCalled();
    await service.fetchNetworkBalances(props);
    expect(state.balanceService.fetchBalance).toHaveBeenLastCalledWith({ ...props, substrateNetworks: [] });
    expect(state.balanceService.substrateBalanceService.subscribeSubstrateBalances).toHaveBeenCalledWith(props, state, expect.any(Function));
  });
});

// The worker closes its connections when nothing needs the wallet (WorkerSleepService) and starts this again after.
describe('balance subscriptions while the wallet is quiet', () => {
  const fetches = (state: ReturnType<typeof fixture>['state']) => state.balanceService.fetchBalance.mock.calls.length;

  it('ends every subscription and reads every balance again on the next start', async () => {
    const { service, state } = fixture();
    await service.start();
    state.serviceInfoSubject.next(info(['polkadot']));
    vi.advanceTimersByTime(1000);
    expect(fetches(state)).toBe(1);
    const unsub = vi.fn();
    service.updateNetworkSubscription({ name: 'polkadot', func: unsub });

    service.stop();
    expect(unsub).toHaveBeenCalledOnce();
    expect(service.subscriptionNetworksMap).toEqual({});
    state.serviceInfoSubject.next(info(['polkadot']));
    vi.advanceTimersByTime(1000);
    expect(fetches(state)).toBe(1);
    expect(state.cronService.updateCron).toHaveBeenCalledOnce();

    await service.start();
    // The same wallet and networks as before going quiet: everything is read again, not only what changed.
    state.serviceInfoSubject.next(info(['polkadot']));
    vi.advanceTimersByTime(1000);
    expect(fetches(state)).toBe(2);
    expect(state.balanceService.substrateBalanceService.subscribeSubstrateBalances).toHaveBeenLastCalledWith(
      expect.objectContaining({ substrateNetworks: ['polkadot'] }), state, expect.any(Function)
    );
  });

  it('drops an update that was waiting when the wallet went quiet', async () => {
    const { service, state } = fixture();
    await service.start();
    state.serviceInfoSubject.next(info(['polkadot']));

    service.stop();
    vi.advanceTimersByTime(5000);

    expect(fetches(state)).toBe(0);
    expect(state.cronService.updateCron).not.toHaveBeenCalled();
  });

  it("stops waiting for other wallets' connections once quiet and reads nothing for them", async () => {
    const { service, state } = fixture();
    const others = [{ address: 'wallet-b', meta: { walletEcosystem: WalletEcosystem.Substrate } }];
    const refreshNetworkBalances = vi.fn().mockResolvedValue(undefined);
    const substrateFetch = vi.fn().mockResolvedValue(undefined);
    Object.assign(state.keyringService, { getAllMainAccounts: vi.fn().mockReturnValue(others) });
    Object.assign(state.networkService.activeNetworkByEcosystem, { substrate: [{ name: 'Polkadot' }] });
    Object.assign(state, { getSubstrateApiMap: {} });
    Object.assign(state.balanceService, {
      refreshNetworkBalances,
      balanceMap: { 'wallet-b': [{ balances: [{ name: 'Polkadot' }] }] },
    });
    Object.assign(state.balanceService.substrateBalanceService, { fetchBalance: substrateFetch });

    await service.start();
    await vi.advanceTimersByTimeAsync(3000);
    service.stop();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(refreshNetworkBalances).not.toHaveBeenCalled();
    expect(substrateFetch).not.toHaveBeenCalled();
  });
});
