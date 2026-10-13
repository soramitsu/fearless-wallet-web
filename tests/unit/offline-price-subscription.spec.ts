import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PricesService } from '@extension-base/services/prices-service';
import { Subject } from 'rxjs';
import type { PriceJson } from '@extension-base/background/types/types';

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), coin: vi.fn(), ton: vi.fn(), sora: vi.fn() }));
vi.mock('@extension-base/stores/Storage', () => ({ storage: { get: async () => ({}), set: async () => {} } }));
vi.mock('@extension-base/stores/Price', () => ({ default: class {
  get(_key: string, update: (value: unknown) => void) { void mocks.read().then(update); }
  getAndWait() { return mocks.read(); }
  set(key: string, data: unknown, update?: () => void) { mocks.write(key, data); update?.(); }
  getSubject() { return new Subject(); }
} }));
vi.mock('@extension-base/services/prices-service/CoinGeckoService', () => ({ CoinGeckoService: class {
  fetchAssetsPrice = mocks.coin;
} }));
vi.mock('@extension-base/services/prices-service/TonPricingService', () => ({ TonPricingService: class {
  fetchTonAsstetsPrice = mocks.ton;
} }));
vi.mock('@extension-base/services/prices-service/SoraPricingService', () => ({ SoraPricingService: class {
  fetchSoraExplorerPricing = mocks.sora;
} }));

const empty = () => ({ tokenPriceMap: {}, tokenPriceChange: {} });
const stored: PriceJson = { fiat: 'usd', tokenPriceMap: { bitcoin: 60000 }, tokenPriceChange: { bitcoin: 1 } };

describe('offline price subscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue(undefined);
    mocks.coin.mockRejectedValue(new Error('offline'));
    mocks.ton.mockResolvedValue(empty());
    mocks.sora.mockResolvedValue(empty());
  });

  it('answers from the saved cache while providers are unavailable, then refreshes on retry', async () => {
    mocks.read.mockResolvedValue(stored);
    const service = new PricesService({} as never);
    const reply = vi.fn();
    service.getPrice(reply);
    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith(stored));
    mocks.coin.mockResolvedValue({ tokenPriceMap: { bitcoin: 61000 }, tokenPriceChange: { bitcoin: 2 } });
    service.refreshPrice();
    await vi.waitFor(() => expect(mocks.write).toHaveBeenCalledWith('PriceData', {
      fiat: 'usd', tokenPriceMap: { bitcoin: 61000 }, tokenPriceChange: { bitcoin: 2 },
    }));
  });

  it('answers a new installation without waiting for an unresponsive price server', async () => {
    let release!: (value: ReturnType<typeof empty>) => void;
    mocks.coin.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const service = new PricesService({} as never);
    const reply = vi.fn();
    service.getPrice(reply);
    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ fiat: 'usd', ...empty() }));
    release(empty());
  });

  it('keeps healthy provider prices when another provider fails', async () => {
    mocks.sora.mockResolvedValue({ tokenPriceMap: { xor: 0.02 }, tokenPriceChange: { xor: 3 } });
    const service = new PricesService({} as never);
    await expect(service.fetchTokensPrice()).resolves.toEqual({
      fiat: 'usd', tokenPriceMap: { xor: 0.02 }, tokenPriceChange: { xor: 3 },
    });
  });

  it('never labels a saved USD value as EUR when the current request fails', async () => {
    mocks.read.mockResolvedValue(stored);
    const service = new PricesService({} as never);
    service.fiatSymbol = 'eur';
    const reply = vi.fn();
    service.getPrice(reply);
    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ fiat: 'eur', ...empty() }));
  });

  it('does not publish a late request for a previous currency', async () => {
    let release!: (value: ReturnType<typeof empty>) => void;
    mocks.coin.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const service = new PricesService({} as never);
    service.refreshPrice();
    service.fiatSymbol = 'eur';
    release({ tokenPriceMap: { bitcoin: 60000 }, tokenPriceChange: {} });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
