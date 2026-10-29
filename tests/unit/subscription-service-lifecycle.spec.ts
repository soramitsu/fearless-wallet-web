import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionService } from '@extension-base/services/subscription-service';
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
    const send = service.createSubscription('early-close', { postMessage: () => { throw new Error('closed'); } } as never);
    send(null);
    const cleanup = vi.fn();
    service.setUnsubscriptionHandle('early-close', cleanup);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('releases client resources after a delivery failure', () => {
    const { service } = fixture();
    const send = service.createSubscription('failed', { postMessage: () => { throw new Error('closed'); } } as never);
    const cleanup = vi.fn();
    service.setUnsubscriptionHandle('failed', cleanup);
    send(null);
    send(null);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('does not revive an old sender when its subscription ID is reused', () => {
    const { service } = fixture();
    const oldPort = { postMessage: vi.fn() }, newPort = { postMessage: vi.fn() };
    const oldSend = service.createSubscription('reused', oldPort as never);
    const cleanup = vi.fn();
    service.setUnsubscriptionHandle('reused', cleanup);
    const newSend = service.createSubscription('reused', newPort as never);
    oldSend(null);
    newSend(null);
    expect(oldPort.postMessage).not.toHaveBeenCalled();
    expect(newPort.postMessage).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
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
    vi.advanceTimersByTime(999);
    expect(state.cronService.updateCron).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(state.cronService.updateCron).toHaveBeenCalledExactlyOnceWith(latest);
    expect(state.nftService.publishNfts).toHaveBeenCalledOnce();
  });

  it('stops sending to a cancelled client and invokes its cleanup once', () => {
    const { service } = fixture();
    const port = { postMessage: vi.fn() };
    const cleanup = vi.fn();
    const send = service.createSubscription('client', port as never);
    service.setUnsubscriptionHandle('client', cleanup);
    send(null);
    expect(service.cancelSubscription('client')).toBe(true);
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
