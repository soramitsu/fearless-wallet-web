// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0
import { state } from '../background/handlers';
import { PriceJson } from '../background/types/types';
import { REFRESH_PRICE_INTERVAL } from '../const/intervals';
import { axios } from './axios';

export const getTokenPrice = async (chains: Array<string>, currency = 'usd'): Promise<PriceJson> => {
  try {
    const now = new Date().getTime();
    const { currency: currentCurrency } = state.prices.json;

    if (Math.abs(state.prices.timestamp - now) <= REFRESH_PRICE_INTERVAL && currentCurrency === currency) {
      console.info('Return prices from cache', state.prices);

      return state.prices.json;
    }

    const chainsStr = chains.join(',');
    const res = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?vs_currencies=${currency}&include_24hr_change=true&ids=${chainsStr}`
    );

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
    } as PriceJson;
  } catch (err) {
    console.error('Failed to get token price', err);
    throw err;
  }
};
