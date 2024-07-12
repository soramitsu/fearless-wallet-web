import PriceStore from '@extension-base/stores/Price';
import { REFRESH_PRICE_INTERVAL } from '@extension-base/const/intervals';
import { storage } from '@extension-base/stores/Storage';
import axios from 'axios';
import type { NetworkService } from '@extension-base/services';
import type { PriceJson } from '@extension-base/background/types/types';

export type Prices = {
  json: PriceJson;
  timestamp: number;
};

export class PricesService {
  private readonly priceStore: PriceStore;
  public prices: Prices = {
    json: {
      tokenPriceMap: {},
      currency: 'usd',
      tokenPriceChange: {},
    }, //TODO covert to behavior subject
    timestamp: 0,
  };
  private priceStoreReady = false;
  public fiatSymbol = 'usd';

  constructor(private networkService: NetworkService) {
    this.priceStore = new PriceStore();

    storage.get(['fiatSymbol']).then(({ fiatSymbol }) => {
      if (fiatSymbol) this.fiatSymbol = fiatSymbol;
    });
  }

  get priceIds() {
    const assets = this.networkService.assetsMap.flatMap(({ priceId }) => (priceId ? [priceId] : []));

    return Array.from(new Set(assets));
  }

  public refreshPrice() {
    this.fetchTokensPrice(this.priceIds, this.fiatSymbol)
      .then((rs) => this.setPrice(rs))
      .catch((err) => console.info(err));
  }

  public setFiatSymbol(symbol: string) {
    this.fiatSymbol = symbol;

    storage.set({ fiatSymbol: this.fiatSymbol });
  }

  public setPrice(priceData: PriceJson, callback?: (priceData: PriceJson) => void): void {
    this.priceStore.set('PriceData', priceData, () => {
      if (callback) callback(priceData);

      this.priceStoreReady = true;
    });
  }

  public getPrice(update: (value: PriceJson) => void): void {
    this.priceStore.get('PriceData', (rs) => {
      if (this.priceStoreReady) update(rs);
      else {
        this.fetchTokensPrice(this.priceIds, this.fiatSymbol)
          .then((rs) => {
            this.setPrice(rs);
            update(rs);
          })
          .catch((err) => {
            throw err;
          });
      }
    });
  }

  public subscribePrice() {
    return this.priceStore.subject;
  }

  public getTokenPrice(assetName: string) {
    const name = assetName.replaceAll(' ', '-');

    return this.prices.json.tokenPriceMap[name] ?? 0;
  }

  async fetchTokensPrice(assets: Array<string>, currency = 'usd'): Promise<PriceJson> {
    try {
      const now = new Date().getTime();
      const { currency: currentCurrency } = this.prices.json;

      if (Math.abs(this.prices.timestamp - now) <= REFRESH_PRICE_INTERVAL && currentCurrency === currency)
        return this.prices.json;

      const assetsStr = assets.join(',');
      const coingeckoUrl = `https://api.coingecko.com/api/v3/simple/price?vs_currencies=${currency}&include_24hr_change=true&ids=${assetsStr}`;

      const res = await axios.get(coingeckoUrl);

      if (res.status !== 200) {
        console.warn('Failed to get token price');

        return {
          currency,
          tokenPriceMap: {},
          tokenPriceChange: {},
        };
      }

      const responseData = res.data as Record<string, Record<string, number>>;
      const tokenPriceMap: Record<string, number> = {};
      const tokenPriceChange: Record<string, number> = {};

      Object.keys(responseData).forEach((token) => {
        const key = `${currency}_24h_change`;
        tokenPriceChange[token] = responseData[token][key];
        tokenPriceMap[token] = responseData[token][currency];
      });

      this.prices = {
        json: {
          currency,
          tokenPriceChange,
          tokenPriceMap,
        },
        timestamp: new Date().getTime(),
      };

      return {
        currency,
        tokenPriceMap,
        tokenPriceChange,
      };
    } catch (err) {
      console.error('Failed to get token price', err);
      throw err;
    }
  }
}
