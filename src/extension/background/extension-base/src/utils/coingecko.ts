// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0
import { PriceJson } from '../background/types';
import { axios } from './axios';

export const getTokenPrice = async (chains: Array<string>, currency = 'usd'): Promise<PriceJson> => {
  try {
    // const inverseMap: Record<string, string> = {};

    chains.push(
      ...[
        'ethereum',
        'tether',
        'usd-coin',
        'binancecoin',
        'binance-usd',
        'dai',
        'link',
        '1inch',
        'ape',
        'uniswap',
        'shiba-inu',
        'near',
      ]
    );

    const chainsStr = chains.join(',');
    const res = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?vs_currencies=${currency}&include_24hr_change=true&ids=${chainsStr}`
    );

    if (res.status !== 200) {
      console.warn('Failed to get token price');
    }

    const responseData = res.data as Record<string, any>;
    const priceMap: Record<string, number> = {};
    const tokenPriceMap: Record<string, number> = {};
    const tokenPriceChange: Record<string, number> = {};

    Object.keys(responseData).forEach((key) => {
      tokenPriceChange[key] = responseData[key].usd_24h_change;
      tokenPriceMap[key] = responseData[key][currency];
    });

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
