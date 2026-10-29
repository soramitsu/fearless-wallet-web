import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CronService } from '@extension-base/services/cron-service';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { CRON_REFRESH_PRICE_INTERVAL, CRON_UPDATE_JSON_INTERVAL } from '@extension-base/const/intervals';
import type State from '@extension-base/background/handlers/State';
import type { ServiceInfo } from '@extension-base/background/types/types';

function fixture() {
  const state = {
    isReady: vi.fn(() => true),
    currentAccount: { address: 'wallet-a' },
    getSubstrateApiMap: { polkadot: {} },
    getEvmApiMap: {},
    init: vi.fn(),
    pricesService: { refreshPrice: vi.fn() },
    networkService: {
      getApiMap: { substrate: {}, evm: {} },
      updateNetworkStatus: vi.fn(),
      evmApiHandler: { recoverClosedApis: vi.fn() },
      substrateApiHandler: { refreshDotSamaApi: vi.fn() },
    },
  };
  return { state, service: new CronService(state as unknown as State) };
}

function info(connected = true, account = true): ServiceInfo {
  return {
    currentAccountInfo: account ? { address: 'wallet-a' } : undefined,
    apiMap: { substrate: connected ? { polkadot: {} } : {}, evm: {} },
  } as unknown as ServiceInfo;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('background cron lifecycle', () => {
  it('recovers after a failed disconnect without leaking a rejected promise', async () => {
    const { service, state } = fixture();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    state.networkService.getApiMap.substrate = {
      polkadot: { api: { isConnected: false, disconnect: vi.fn().mockRejectedValue(new Error('already disconnected')) } },
    };
    await expect(service.recoverApiMap()).resolves.toBeUndefined();
    expect(state.networkService.substrateApiHandler.refreshDotSamaApi).toHaveBeenCalledExactlyOnceWith('polkadot');
  });

  it('does not resurrect a removed connection after disconnect completes', async () => {
    const { service, state } = fixture();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    let finish!: () => void;
    state.networkService.getApiMap.substrate = {
      polkadot: { api: { isConnected: false, disconnect: () => new Promise<void>((resolve) => { finish = resolve; }) } },
    };
    const pending = service.recoverApiMap();
    state.networkService.getApiMap.substrate = {};
    finish();
    await pending;
    expect(state.networkService.substrateApiHandler.refreshDotSamaApi).not.toHaveBeenCalled();
  });

  it('ignores stale EVM status after the provider was replaced', async () => {
    const { service, state } = fixture();
    let ready!: () => void;
    state.networkService.getApiMap.evm = {
      ethereum: { api: { provider: { _waitUntilReady: () => new Promise<void>((resolve) => { ready = resolve; }) } } },
    };
    service.updateApiMapStatus();
    state.networkService.getApiMap.evm = { ethereum: {} };
    ready();
    await Promise.resolve();
    expect(state.networkService.updateNetworkStatus).not.toHaveBeenCalled();
  });
  it('replaces a named job without leaving its old interval running', () => {
    const { service } = fixture();
    const oldJob = vi.fn();
    const replacement = vi.fn();
    service.addCron('price', oldJob, 10, false);
    service.addCron('price', replacement, 20, false);
    vi.advanceTimersByTime(40);
    expect(oldJob).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
    service.removeCron('price');
    service.removeCron('missing');
    vi.advanceTimersByTime(40);
    expect(replacement).toHaveBeenCalledTimes(2);
    expect(service.isCronExist('price')).toBe(false);
  });

  it('starts once, refreshes prices immediately, and defers registry refresh', () => {
    const { service, state } = fixture();
    service.start();
    service.start();
    expect(state.pricesService.refreshPrice).toHaveBeenCalledOnce();
    expect(state.init).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(4);
    vi.advanceTimersByTime(CRON_REFRESH_PRICE_INTERVAL);
    expect(state.pricesService.refreshPrice).toHaveBeenCalledTimes(2);
    expect(state.init).not.toHaveBeenCalled();
  });

  it('can restart after stopping without leaking or losing periodic work', () => {
    const { service, state } = fixture();
    service.start();
    service.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(CRON_REFRESH_PRICE_INTERVAL);
    expect(state.pricesService.refreshPrice).toHaveBeenCalledOnce();
    service.start();
    expect(vi.getTimerCount()).toBe(4);
    expect(state.pricesService.refreshPrice).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(CRON_REFRESH_PRICE_INTERVAL);
    expect(state.pricesService.refreshPrice).toHaveBeenCalledTimes(3);
  });

  it.each([[false, true], [true, false]])('pauses wallet polling when connected=%s, account=%s', (connected, account) => {
    const { service, state } = fixture();
    service.start();
    service.updateCron(info(connected, account));
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(CRON_REFRESH_PRICE_INTERVAL);
    expect(state.pricesService.refreshPrice).toHaveBeenCalledOnce();
    service.updateCron(info());
    service.updateCron(info());
    expect(vi.getTimerCount()).toBe(4);
    expect(state.pricesService.refreshPrice).toHaveBeenCalledTimes(2);
  });

  it('keeps only registry refresh running when no account is selected', () => {
    const { service, state } = fixture();
    state.currentAccount.address = '';
    service.start();
    service.start();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(CRON_UPDATE_JSON_INTERVAL);
    expect(state.init).toHaveBeenCalledOnce();
    expect(state.pricesService.refreshPrice).not.toHaveBeenCalled();
  });

  it('does not initialize polling before state is ready', () => {
    const { service, state } = fixture();
    state.isReady.mockReturnValue(false);
    service.init();
    expect(state.pricesService.refreshPrice).not.toHaveBeenCalled();
    state.isReady.mockReturnValue(true);
    service.init();
    expect(state.pricesService.refreshPrice).toHaveBeenCalledOnce();
  });

  it('recovers only disconnected Substrate APIs and never retries offline', async () => {
    const { service, state } = fixture();
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const connectedDisconnect = vi.fn();
    state.networkService.getApiMap.substrate = {
      polkadot: { api: { isConnected: false, disconnect } },
      kusama: { api: { isConnected: true, disconnect: connectedDisconnect } },
      unavailable: {},
    };
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    service.recoverApiMap();
    expect(disconnect).not.toHaveBeenCalled();
    expect(state.networkService.evmApiHandler.recoverClosedApis).not.toHaveBeenCalled();
    online.mockReturnValue(true);
    service.recoverApiMap();
    await Promise.resolve();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(connectedDisconnect).not.toHaveBeenCalled();
    expect(state.networkService.substrateApiHandler.refreshDotSamaApi).toHaveBeenCalledExactlyOnceWith('polkadot');
    expect(state.networkService.evmApiHandler.recoverClosedApis).toHaveBeenCalledOnce();
  });

  it('publishes Substrate status and distinguishes ready from unavailable EVM providers', async () => {
    const { service, state } = fixture();
    state.networkService.getApiMap.substrate = { polkadot: { apiStatus: NETWORK_STATUS.CONNECTED } };
    state.networkService.getApiMap.evm = {
      ethereum: { api: { provider: { _waitUntilReady: vi.fn().mockResolvedValue(undefined) } } },
      polygon: { api: { provider: { _waitUntilReady: vi.fn().mockRejectedValue(new Error('offline')) } } },
      pending: {},
    };
    service.updateApiMapStatus();
    await Promise.resolve();
    await Promise.resolve();
    expect(state.networkService.updateNetworkStatus.mock.calls).toEqual([
      ['polkadot', NETWORK_STATUS.CONNECTED],
      ['ethereum', NETWORK_STATUS.CONNECTED],
      ['polygon', NETWORK_STATUS.CONNECTING],
    ]);
  });
});
