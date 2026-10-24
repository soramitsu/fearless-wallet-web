import axios from 'axios';
import { ACTION_CAPABILITY_MAX_AGE_MS } from '@extension-base/services/action-capability-service';
import { actions } from '@/stores/extension/actions';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('@/router', () => ({ default: { push: vi.fn() } }));
vi.mock('@/router/routes', () => ({ Components: {} }));
vi.mock('@/extension/messaging', () => ({}));

const NOW = 1_800_000_000_000;
const KEY = 'feature_action-capabilities';

function setup(stored?: unknown) {
  const storage = new Map<string, string>();
  if (stored !== undefined) storage.set(KEY, JSON.stringify({ value: stored }));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  const setFeatures = vi.fn();
  const fetchFeatures = () => (actions.fetchFeatures as (this: unknown) => Promise<void>).call({ setFeatures });

  return { fetchFeatures, setFeatures, storage };
}

describe('popup feature cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.mocked(axios.get).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses a recent cached snapshot while the remote configuration cannot be fetched', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('offline'));
    const { fetchFeatures, setFeatures } = setup({
      fiat: { moonpay: true, ramp: false },
      actions: { crossChainXcm: true },
      fetchedAt: NOW - 60_000,
    });

    await fetchFeatures();

    expect(setFeatures).toHaveBeenCalledExactlyOnceWith({ fiat: { moonpay: true, ramp: false }, actions: { crossChainXcm: true } });
  });

  it.each([
    ['older than the maximum age', NOW - ACTION_CAPABILITY_MAX_AGE_MS - 1],
    ['without a fetch time, as written by older versions', undefined],
  ])('fails closed for a cached snapshot %s', async (_label, fetchedAt) => {
    vi.mocked(axios.get).mockRejectedValue(new Error('blocked'));
    const { fetchFeatures, setFeatures } = setup({ actions: { crossChainXcm: true }, fetchedAt });

    await fetchFeatures();

    expect(setFeatures).toHaveBeenCalledOnce();
    expect(setFeatures.mock.calls[0][0].actions.crossChainXcm).toBe(false);
  });

  it('stores a fetched configuration with the time it was fetched', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { fiat: { moonpay: false, ramp: true }, actions: { polkaswap: true } } });
    const { fetchFeatures, setFeatures, storage } = setup();

    await fetchFeatures();

    expect(JSON.parse(storage.get(KEY) ?? '{}').value).toMatchObject({ actions: { polkaswap: true }, fetchedAt: NOW });
    expect(setFeatures).toHaveBeenLastCalledWith(
      expect.objectContaining({ actions: expect.objectContaining({ polkaswap: true, crossChainXcm: false }) })
    );
    expect(setFeatures.mock.calls.at(-1)?.[0]).not.toHaveProperty('fetchedAt');
  });
});
