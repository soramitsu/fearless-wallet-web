import { type TokenRates } from '@ton-api/client';
import type { BasePriceJson } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import { TON_MAINNET } from '@/consts/networks';

export class TonPricingService {
  constructor(private state: State) {}

  tonParseRates(rates: TokenRates) {
    const { diff24h, prices } = rates;
    const fiatSymbollUpper = this.state.pricesService.fiatSymbol.toUpperCase();

    const price = prices?.[fiatSymbollUpper] ?? 0;

    const prepareDiff24 = diff24h?.[fiatSymbollUpper];
    const diff24 = prepareDiff24?.substring(0, prepareDiff24.length - 1).replace('−', '-') ?? '0';

    return {
      price,
      diff24: +diff24,
    };
  }

  // Цены токенов парсятся только для TON_MAINNET
  // TI has no rates; then, and when the provider fails, TON keeps its CoinGecko price and other prices still load.
  async fetchTonAsstetsPrice(): Promise<BasePriceJson> {
    const result: BasePriceJson = { tokenPriceMap: {}, tokenPriceChange: {} };
    const api = this.state.getTonApiMap[TON_MAINNET];

    if (!api) return result;

    try {
      const rates = await api.api.getRates(['ton'], this.state.pricesService.fiatSymbol);

      return Object.entries(rates ?? {}).reduce((prices, [key, value]) => {
        const keyLower = key.toLowerCase();

        const { price, diff24 } = this.tonParseRates(value);

        prices.tokenPriceChange[keyLower] = diff24;
        prices.tokenPriceMap[keyLower] = price;

        return prices;
      }, result);
    } catch (error) {
      console.warn('[TON] TON rates unavailable', error);

      return result;
    }
  }
}
