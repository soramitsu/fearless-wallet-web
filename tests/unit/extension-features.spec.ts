import axios from 'axios';
import { createPinia, setActivePinia } from 'pinia';
import { RELEASE_DEFAULT_ACTIONS, resolveActionCapabilities } from '@extension-base/services/action-capability-service';
import { useExtensionStore } from '@/stores/extension';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('@/extension/messaging', () => ({}));
vi.mock('@/router', () => ({ default: { push: vi.fn() } }));
vi.mock('@/router/routes', () => ({ Components: {} }));

const createLocalStorageStub = () => {
  const storage = new Map<string, string>();

  return {
    clear: vi.fn(() => storage.clear()),
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(storage.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => storage.delete(key)),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    get length() {
      return storage.size;
    },
  };
};

const allEnabled = Object.fromEntries(Object.keys(RELEASE_DEFAULT_ACTIONS).map((key) => [key, true]));
const fetchesFail = () => vi.mocked(axios.get).mockRejectedValue(new Error('offline'));
const fetchReturns = (data: unknown) => vi.mocked(axios.get).mockResolvedValue({ data });

describe('extension store features', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageStub());
    setActivePinia(createPinia());
    vi.mocked(axios.get).mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    [{ fiat: { moonpay: true } }],
    [{ actions: { polkaswap: false } }],
    [{ feature_toggle: { crossChainXcm: true } }],
    [{ actionCapabilities: { demeter: true, polkaswap: false } }],
    [{ actions: { polkaswap: 'false' } }],
    [{ actions: null }],
    [{ actions: allEnabled }],
  ])('resolves %j exactly like the background', async (remote) => {
    fetchReturns(remote);
    const store = useExtensionStore();

    await store.fetchFeatures();

    expect(store.features?.actions).toEqual(resolveActionCapabilities(remote).actions);
  });

  it('keeps fiat providers exactly as the remote config sets them', async () => {
    fetchReturns({ fiat: { moonpay: true, ramp: true } });
    const store = useExtensionStore();

    await store.fetchFeatures();

    expect(store.features?.fiat).toEqual({ moonpay: true, ramp: true });
  });

  it('starts from the release defaults on a first offline run', async () => {
    fetchesFail();
    const store = useExtensionStore();

    await store.fetchFeatures();

    expect(store.features).toEqual({
      fiat: { moonpay: false, ramp: false },
      actions: { ...RELEASE_DEFAULT_ACTIONS },
      assetDiscoveryMode: 'shadow',
    });
  });

  it('round-trips the remote config through the v2 cache and keeps a veto offline', async () => {
    fetchReturns({ fiat: { moonpay: true }, actions: { polkaswap: false } });
    await useExtensionStore().fetchFeatures();

    expect(JSON.parse(localStorage.getItem('feature_action-capabilities-v2')!)).toEqual({
      value: { fiat: { moonpay: true }, actions: { polkaswap: false }, assetDiscoveryMode: 'shadow' },
    });

    setActivePinia(createPinia());
    fetchesFail();
    const offline = useExtensionStore();
    await offline.fetchFeatures();

    expect(offline.features?.actions.polkaswap).toBe(false);
    expect(offline.features?.fiat.moonpay).toBe(true);
  });

  it('keeps a remembered veto when a later config omits the key', async () => {
    fetchReturns({ actions: { polkaswap: false } });
    await useExtensionStore().fetchFeatures();

    setActivePinia(createPinia());
    fetchReturns({ fiat: { moonpay: true } });
    const store = useExtensionStore();
    await store.fetchFeatures();

    expect(store.features?.actions.polkaswap).toBe(false);

    setActivePinia(createPinia());
    fetchReturns({ actions: { polkaswap: true } });
    const lifted = useExtensionStore();
    await lifted.fetchFeatures();

    expect(lifted.features?.actions.polkaswap).toBe(true);
  });

  it('ignores the legacy snapshot of defaulted falses and leaves it untouched', async () => {
    const legacy = JSON.stringify({
      value: {
        fiat: { moonpay: false, ramp: false },
        actions: { ...Object.fromEntries(Object.keys(RELEASE_DEFAULT_ACTIONS).map((key) => [key, false])) },
        assetDiscoveryMode: 'shadow',
      },
    });
    localStorage.setItem('feature_action-capabilities', legacy);
    fetchesFail();
    const store = useExtensionStore();

    await store.fetchFeatures();

    expect(store.features?.actions).toEqual(RELEASE_DEFAULT_ACTIONS);
    expect(localStorage.getItem('feature_action-capabilities')).toBe(legacy);
  });

  it('treats a corrupt v2 cache as empty and leaves it untouched', async () => {
    localStorage.setItem('feature_action-capabilities-v2', '{not json');
    fetchesFail();
    const store = useExtensionStore();

    await store.fetchFeatures();

    expect(store.features?.actions).toEqual(RELEASE_DEFAULT_ACTIONS);
    expect(localStorage.getItem('feature_action-capabilities-v2')).toBe('{not json');
  });
});
