import { REFRESH_PRICE_INTERVAL } from '@extension-base/const/intervals';
import { axios } from '@extension-base/utils/axios';
import type { Prices } from '@extension-base/background/handlers/State';
import type { PriceJson } from '@extension-base/background/types/types';

export async function getTokenPrice(assets: Array<string>, currency = 'usd', prices: Prices): Promise<PriceJson> {
  try {
    const now = new Date().getTime();
    const { currency: currentCurrency } = prices.json;

    if (Math.abs(prices.timestamp - now) <= REFRESH_PRICE_INTERVAL && currentCurrency === currency) return prices.json;

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
