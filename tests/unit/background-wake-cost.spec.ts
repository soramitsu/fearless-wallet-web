import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import State from '@extension-base/background/handlers/State';
import { ScamService } from '@extension-base/services/scam-service';
import { registerBackgroundListeners, type BackgroundRuntime } from '@/extension/entry/backgroundBootstrap';
import { URLS } from '@/consts/urls';

const http = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('axios', () => ({ default: { get: http.get } }));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@extension-base/services', async () => await import('@extension-base/services/asset-discovery-service'));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: { runtime: { getURL: (path: string) => path } } }));
vi.mock('@extension-base/stores/Storage', () => ({ storage: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } }));
vi.mock('@polkadot/extension-chains', () => ({ addMetadata: vi.fn() }));
vi.mock('@/extension/toolbarSurface', () => ({ registerToolbarSurface: vi.fn() }));

function event() {
  return { addListener: vi.fn() };
}

// Only the APIs the background may wake on: no tabs or windows.
function extensionApi(existing: Record<string, number>) {
  return {
    runtime: { onConnect: event(), onInstalled: event(), onUpdateAvailable: event(), reload: vi.fn() },
    alarms: {
      get: vi.fn(async (name: string) => (name in existing ? { name, periodInMinutes: existing[name] } : undefined)),
      create: vi.fn().mockResolvedValue(undefined),
      onAlarm: event(),
    },
  };
}

const settle = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };
const never = new Promise<BackgroundRuntime>(() => undefined);

describe('what wakes the extension background', () => {
  it('registers no tab or window listener', () => {
    const api = extensionApi({});

    expect(() => registerBackgroundListeners(api as unknown as typeof chrome, never)).not.toThrow();
    expect(api.runtime.onConnect.addListener).toHaveBeenCalledOnce();
    expect(api.alarms.onAlarm.addListener).toHaveBeenCalledOnce();
  });

  it('keeps the sweep alarm that already exists so a restart does not postpone it', async () => {
    const api = extensionApi({ 'fearless-asset-discovery-sweep': 60 });

    registerBackgroundListeners(api as unknown as typeof chrome, never);
    await settle();

    expect(api.alarms.get).toHaveBeenCalledExactlyOnceWith('fearless-asset-discovery-sweep');
    expect(api.alarms.create).not.toHaveBeenCalled();
  });

  it('creates a missing sweep alarm, replaces one with another period, and leaves the registry retry alone', async () => {
    for (const existing of [{}, { 'fearless-asset-discovery-sweep': 5 }]) {
      const api = extensionApi(existing);

      registerBackgroundListeners(api as unknown as typeof chrome, never);
      await settle();

      // The registry retry alarm is created only while the registry is unavailable (registry-retry-alarm.spec.ts).
      expect(api.alarms.create.mock.calls).toEqual([['fearless-asset-discovery-sweep', { periodInMinutes: 60 }]]);
    }
  });
});

describe('scam address list per worker start', () => {
  beforeEach(() => {
    http.get.mockReset();
    http.get.mockResolvedValue({ status: 200, data: 'name,address,type,comment\nfixture,5Scam,Scam,\n' });
  });

  function startingState() {
    const state = Object.setPrototypeOf({
      ready: false,
      serviceInfoSubject: new Subject(),
      eventService: { waitCryptoReady: Promise.resolve() },
      networkService: { initNetworkMap: vi.fn().mockResolvedValue(undefined), initNetworkApis: vi.fn(), networkMap: {}, getApiMap: {} },
      actionCapabilityService: { init: vi.fn().mockResolvedValue(undefined) },
      sendKillSwitchService: { init: vi.fn().mockResolvedValue(undefined) },
      soraDisclaimerService: { init: vi.fn().mockResolvedValue(undefined) },
      keyringService: { getAllMainAccounts: () => [], currentAccountSubject: { value: null } },
      balanceService: { generateDefaultBalance: vi.fn(), hydrateBalanceStorage: vi.fn().mockResolvedValue(undefined) },
      subscriptionService: { start: vi.fn() },
      cronService: { start: vi.fn() },
      assetDiscoverySweepService: { runIfDue: vi.fn().mockResolvedValue(undefined) },
    }, State.prototype) as State;
    state.scamService = new ScamService(state);
    return state;
  }

  const scamRequests = () => http.get.mock.calls.filter(([url]) => url === URLS.SCAM).length;

  it('downloads the list once while the worker starts', async () => {
    const state = startingState();

    await state.init();
    await settle();

    expect(scamRequests()).toBe(1);
    expect(state.scamService.scamMap?.get('5Scam')).toMatchObject({ reason: 'Scam' });
  });

  it('loads it again on the daily refresh, and at start-up after a failed download', async () => {
    http.get.mockRejectedValueOnce(new Error('offline'));
    const state = startingState();
    await settle();

    await state.init();
    await settle();
    expect(scamRequests()).toBe(2);

    await state.init();
    await settle();
    expect(scamRequests()).toBe(3);
  });
});
