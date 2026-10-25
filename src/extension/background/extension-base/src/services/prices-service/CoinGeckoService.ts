import axios from 'axios';
import { REFRESH_PRICE_INTERVAL } from '../../const/intervals';
import type { BasePriceJson, TokenPrice } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import { withDeadline } from '@/bootstrap/boundedAttempts';

export class CoinGeckoService {
  private cache = new Map<string, { timestamp: number; prices: BasePriceJson }>();
  private pending = new Map<string, Promise<BasePriceJson>>();

  constructor(private state: State) {}

  get fiatSymbol() {
    return this.state.pricesService.fiatSymbol;
  }

  get priceIds() {
    const assets = this.state.networkService.assetsMap.flatMap(({ priceId }) => (priceId ? [priceId] : []));

    return Array.from(new Set(assets));
  }

  async fetchAssetsPrice(): Promise<BasePriceJson> {
    const fiat = this.fiatSymbol;
    const assetsStr = this.priceIds.sort().join(',');
    const key = `${fiat}:${assetsStr}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp <= REFRESH_PRICE_INTERVAL) return cached.prices;
    const pending = this.pending.get(key);
    if (pending) return pending;

    const work = this.fetchPrices(fiat, assetsStr).then((prices) => {
      this.cache.set(key, { timestamp: Date.now(), prices });
      return prices;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, work);
    return work;
  }

  private async fetchPrices(fiat: string, assets: string): Promise<BasePriceJson> {
    const url = `https://api.coingecko.com/api/v3/simple/price?vs_currencies=${encodeURIComponent(fiat)}&include_24hr_change=true&ids=${encodeURIComponent(assets)}`;
    const res = await withDeadline(
      axios.get<Record<string, TokenPrice>>(url, { timeout: 10000 }), 10000, 'CoinGecko request timed out'
    );
    if (res.status !== 200 || !res.data || typeof res.data !== 'object' || Array.isArray(res.data)) {
      throw new Error('Invalid CoinGecko price response');
    }

    return Object.keys(res.data).reduce<BasePriceJson>((result, token) => {
      const price = res.data[token]?.[fiat];
      const change = res.data[token]?.[`${fiat}_24h_change`];
      if (typeof price === 'number' && Number.isFinite(price) && price >= 0) result.tokenPriceMap[token] = price;
      if (typeof change === 'number' && Number.isFinite(change)) result.tokenPriceChange[token] = change;
      return result;
    }, { tokenPriceMap: {}, tokenPriceChange: {} });
  }
}
