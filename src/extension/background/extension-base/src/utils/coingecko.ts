// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0
import { state } from '@extension-base/background/handlers';
import { REFRESH_PRICE_INTERVAL } from '@extension-base/const/intervals';
import { axios } from '@extension-base/utils/axios';
import type { PriceJson } from '@/extension/background/extension-base/src/background/types';

export async function getTokenPrice(assets: Array<string>, currency = 'usd'): Promise<PriceJson> {
  try {
    const now = new Date().getTime();
    const { currency: currentCurrency } = state.prices.json;

    if (Math.abs(state.prices.timestamp - now) <= REFRESH_PRICE_INTERVAL && currentCurrency === currency) {
      return state.prices.json;
    }

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

    state.prices = {
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
