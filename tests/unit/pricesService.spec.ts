jest.mock('@extension-base/utils/crossenv', () => {
  const storage = {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn((_: Record<string, unknown>, callback?: () => void) => {
        if (typeof callback === 'function') callback();
        return Promise.resolve();
      }),
    },
  };

  return {
    chrome: { storage },
    browser: undefined,
  };
});

import type State from '@/extension/background/extension-base/src/background/handlers/State';
import { PricesService, DEFAULT_PRICES } from '@/extension/background/extension-base/src/services/prices-service';

const buildState = (): Partial<State> => ({
  pricesService: { fiatSymbol: 'usd' } as unknown as State['pricesService'],
  networkService: {
    networkValues: [
      {
        name: 'Sora Mainnet',
        externalApi: { pricing: { url: 'https://sora-pricing' } },
        assets: [],
      },
    ],
  } as unknown as State['networkService'],
  getTonApiMap: {} as State['getTonApiMap'],
});

describe('PricesService', () => {
  it('continues when SORA pricing fetch fails', async () => {
    const state = buildState();
    const service = new PricesService(state as State);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const tonRates = {
      tokenPriceMap: { ton: 1 },
      tokenPriceChange: { ton: -2 },
    };
    const coingeckoRates = {
      tokenPriceMap: { xor: 3 },
      tokenPriceChange: { xor: 0.1 },
    };

    service.tonPricingService.fetchTonAsstetsPrice = jest.fn().mockResolvedValue(tonRates);
    service.coinGeckoService.fetchAssetsPrice = jest.fn().mockResolvedValue(coingeckoRates);
    service.soraPricingService.fetchSoraExplorerPricing = jest.fn().mockRejectedValue(new Error('boom'));

    const prices = await service.fetchTokensPrice();

    expect(prices.tokenPriceMap).toEqual({ ton: 1, xor: 3 });
    expect(prices.tokenPriceChange).toEqual({ ton: -2, xor: 0.1 });

    warnSpy.mockRestore();
  });

  it('returns default structure when other feeds fail', async () => {
    const state = buildState();
    const service = new PricesService(state as State);

    service.tonPricingService.fetchTonAsstetsPrice = jest.fn().mockResolvedValue(DEFAULT_PRICES);
    service.coinGeckoService.fetchAssetsPrice = jest.fn().mockResolvedValue(DEFAULT_PRICES);
    service.soraPricingService.fetchSoraExplorerPricing = jest.fn().mockResolvedValue(DEFAULT_PRICES);

    const prices = await service.fetchTokensPrice();

    expect(prices).toEqual({ ...DEFAULT_PRICES, fiat: 'usd' });
  });
});
