import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoinGeckoService } from '@extension-base/services/prices-service/CoinGeckoService';
import type State from '@extension-base/background/handlers/State';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
const setup = () => {
  const state = {
    networkService: { assetsMap: [{ priceId: 'bitcoin' }] },
    pricesService: { fiatSymbol: 'usd', prices: { json: { fiat: 'usd' } } },
  };
  return { state, service: new CoinGeckoService(state as unknown as State) };
};
const response = (fiat: string, value: number) => ({ status: 200, data: { bitcoin: { [fiat]: value, [`${fiat}_24h_change`]: 1 } } });

describe('CoinGecko currency and request ownership', () => {
  beforeEach(() => vi.mocked(axios.get).mockReset());
  afterEach(() => vi.useRealTimers());

  it('parses the currency actually requested even when preference changes during the request', async () => {
    let release!: (value: ReturnType<typeof response>) => void;
    vi.mocked(axios.get).mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const { state, service } = setup();
    const pending = service.fetchAssetsPrice();
    state.pricesService.fiatSymbol = 'eur';
    release(response('usd', 60000));
    expect((await pending).tokenPriceMap.bitcoin).toBe(60000);
  });

  it('fetches a new currency despite a recently successful request for the previous currency', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce(response('usd', 60000)).mockResolvedValueOnce(response('eur', 55000));
    const { state, service } = setup();
    await service.fetchAssetsPrice();
    state.pricesService.fiatSymbol = 'eur';
    state.pricesService.prices.json.fiat = 'eur';
    expect((await service.fetchAssetsPrice()).tokenPriceMap.bitcoin).toBe(55000);
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  it('returns cached values to a new caller instead of an empty success', async () => {
    vi.mocked(axios.get).mockResolvedValue(response('usd', 60000));
    const { service } = setup();
    await service.fetchAssetsPrice();
    expect((await service.fetchAssetsPrice()).tokenPriceMap.bitcoin).toBe(60000);
    expect(axios.get).toHaveBeenCalledOnce();
  });

  it('shares in-flight work only for the same currency and asset set', async () => {
    let release!: (value: ReturnType<typeof response>) => void;
    vi.mocked(axios.get).mockReturnValueOnce(new Promise((resolve) => { release = resolve; }))
      .mockResolvedValueOnce(response('eur', 55000));
    const { state, service } = setup();
    const first = service.fetchAssetsPrice();
    const second = service.fetchAssetsPrice();
    state.pricesService.fiatSymbol = 'eur';
    expect((await service.fetchAssetsPrice()).tokenPriceMap.bitcoin).toBe(55000);
    expect(axios.get).toHaveBeenCalledTimes(2);
    release(response('usd', 60000));
    expect(await first).toEqual(await second);
    expect((await first).tokenPriceMap.bitcoin).toBe(60000);
  });

  it('discards late replies after timeout and allows a real retry', async () => {
    vi.useFakeTimers();
    let release!: (value: ReturnType<typeof response>) => void;
    vi.mocked(axios.get).mockReturnValueOnce(new Promise((resolve) => { release = resolve; }))
      .mockResolvedValueOnce(response('usd', 61000));
    const { service } = setup();
    const pending = service.fetchAssetsPrice();
    const outcome = pending.then(() => 'resolved', () => 'rejected');
    await vi.advanceTimersByTimeAsync(11000);
    release(response('usd', 60000));
    expect(await outcome).toBe('rejected');
    expect((await service.fetchAssetsPrice()).tokenPriceMap.bitcoin).toBe(61000);
  });
});
