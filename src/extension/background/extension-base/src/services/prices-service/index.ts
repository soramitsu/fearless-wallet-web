import PriceStore from '@extension-base/stores/Price';
import { axios } from '@extension-base/utils';
import { REFRESH_PRICE_INTERVAL } from '@extension-base/const/intervals';
import type State from '@extension-base/background/handlers/State';
import type { PriceJson } from '@extension-base/background/types/types';

export type Prices = {
  json: PriceJson;
  timestamp: number;
};

export default class PricesService {
  public prices: Prices = {
    json: {
      tokenPriceMap: {},
      currency: 'usd',
      priceMap: {},
      tokenPriceChange: {},
    },
    timestamp: 0,
  };
  private priceStoreReady = false;
  public fiatSymbol = 'usd';
  private readonly priceStore;
  state: State;
  constructor(state: State) {
    this.state = state;
    this.priceStore = new PriceStore();
  }

  public refreshPrice() {
    const assets: string[] = this.state.assetsMap.filter(({ priceId }) => priceId).map(({ priceId }) => priceId);

    this.getTokenPrice(Array.from(new Set(assets)), this.fiatSymbol, this.prices)
      .then((rs) => {
        this.setPrice(rs);
      })
      .catch((err) => console.info(err));
  }
  public setFiatSymbol(symbol: string) {
    this.fiatSymbol = symbol;

    chrome.storage.local.set({ fiatSymbol: this.fiatSymbol });
  }

  public setPrice(priceData: PriceJson, callback?: (priceData: PriceJson) => void): void {
    this.priceStore.set('PriceData', priceData, () => {
      if (callback) {
        callback(priceData);

        this.priceStoreReady = true;
      }
    });
  }

  public getPrice(update: (value: PriceJson) => void): void {
    this.priceStore.get('PriceData', (rs) => {
      if (this.priceStoreReady) update(rs);
      else {
        const assets: string[] = this.state.assetsMap.filter(({ priceId }) => priceId).map(({ priceId }) => priceId);

        this.getTokenPrice(Array.from(new Set(assets)), this.fiatSymbol, this.prices)
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

  async getTokenPrice(assets: Array<string>, currency = 'usd', prices: Prices): Promise<PriceJson> {
    try {
      const now = new Date().getTime();
      const { currency: currentCurrency } = prices.json;

      if (Math.abs(prices.timestamp - now) <= REFRESH_PRICE_INTERVAL && currentCurrency === currency)
        return prices.json;

      const assetsStr = assets.join(',');
      const coingeckoUrl = `https://api.coingecko.com/api/v3/simple/price?vs_currencies=${currency}&include_24hr_change=true&ids=${assetsStr}`;

      const res = await axios.get(coingeckoUrl);

      if (res.status !== 200) {
        console.warn('Failed to get token price');

        return {
          currency,
          priceMap: {},
          tokenPriceMap: {},
          tokenPriceChange: {},
        };
      }

      const responseData = res.data as Record<string, Record<string, number>>;
      const priceMap: Record<string, number> = {};
      const tokenPriceMap: Record<string, number> = {};
      const tokenPriceChange: Record<string, number> = {};

      Object.keys(responseData).forEach((token) => {
        const key = `${currency}_24h_change`;
        tokenPriceChange[token] = responseData[token][key];
        tokenPriceMap[token] = responseData[token][currency];
      });

      prices = {
        json: {
          currency,
          tokenPriceChange,
          priceMap,
          tokenPriceMap,
        },
        timestamp: new Date().getTime(),
      };

      return {
        currency,
        priceMap,
        tokenPriceMap,
        tokenPriceChange,
      };
    } catch (err) {
      console.error('Failed to get token price', err);
      throw err;
    }
  }
}
