import axios from 'axios';
import { REFRESH_PRICE_INTERVAL } from '../../const/intervals';
import { DEFAULT_PRICES } from '.';
import type { BasePriceJson, TokenPrice } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import { isSameString } from '@/helpers';

export class CoinGeckoService {
  timestamp = 0;

  constructor(private state: State) {}

  get fiatSymbol() {
    return this.state.pricesService.fiatSymbol;
  }

  get priceIds() {
    const assets = this.state.networkService.assetsMap.flatMap(({ priceId }) => (priceId ? [priceId] : []));

    return Array.from(new Set(assets));
  }

  async fetchAssetsPrice(): Promise<BasePriceJson> {
    const { fiat } = this.state.pricesService.prices.json;

    if (Date.now() - this.timestamp <= REFRESH_PRICE_INTERVAL && isSameString(fiat, this.fiatSymbol))
      return DEFAULT_PRICES;

    const assetsStr = this.priceIds.join(',');
    const coingeckoUrl = `https://api.coingecko.com/api/v3/simple/price?vs_currencies=${this.fiatSymbol}&include_24hr_change=true&ids=${assetsStr}`;

    const res = await axios.get<Record<string, TokenPrice>>(coingeckoUrl);

    if (res.status !== 200) {
      console.warn('Failed to get token price');

      return DEFAULT_PRICES;
    }

    this.timestamp = Date.now();

    const basePriceJson = Object.keys(res.data).reduce<BasePriceJson>((result, token) => {
      const key = `${this.fiatSymbol}_24h_change`;

      result.tokenPriceChange[token] = res.data[token][key];
      result.tokenPriceMap[token] = res.data[token][this.fiatSymbol];

      return result;
    }, DEFAULT_PRICES);

    return basePriceJson;
  }
}
