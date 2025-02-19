import { type TokenRates } from '@ton-api/client';
import { DEFAULT_PRICES } from '.';
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
  async fetchTonAsstetsPrice(): Promise<BasePriceJson> {
    const api = this.state.getTonApiMap[TON_MAINNET];

    if (!api) return DEFAULT_PRICES;

    const res = await api.api?.rates.getRates({
      tokens: ['ton'],
      currencies: [this.state.pricesService.fiatSymbol],
    });

    return Object.entries(res.rates).reduce((result, [key, value]) => {
      const keyLower = key.toLowerCase();

      const { price, diff24 } = this.tonParseRates(value);

      result.tokenPriceChange[keyLower] = diff24;
      result.tokenPriceMap[keyLower] = price;

      return result;
    }, DEFAULT_PRICES);
  }
}
