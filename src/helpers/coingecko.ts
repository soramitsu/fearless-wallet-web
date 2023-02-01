// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0

import axios from 'axios';
import { AssetJson, AssetsPrice } from '@/interfaces';

export const getTokenPrice = async (
  chains: Array<string>,
  currency = 'usd',
  assetsJson: AssetJson[]
): Promise<AssetsPrice> => {
  try {
    const chainsStr = chains.join(',');
    const evmAssets = ['ethereum', 'bitcoin', 'tether', 'usd-coin', 'binancecoin', 'binance-usd', 'dai'];
    const prepCurrency = [...currency].push(...evmAssets);

    const { data, status } = await axios.get<AssetsPrice>(
      `https://api.coingecko.com/api/v3/simple/price?vs_currencies=${prepCurrency}&include_24hr_change=true&ids=${chainsStr}&precision="4"`
    );

    if (status !== 200) console.warn('Failed to get token price');

    const assetsPrice: AssetsPrice = {};

    for (const priceId in data) {
      assetsJson
        .filter(({ priceId: _priceId }) => _priceId === priceId)
        .forEach(({ displayName, symbol }) => {
          assetsPrice[displayName ?? symbol] = data[priceId];
        });
    }

    Object.keys(data).forEach((key) => {
      if (!assetsPrice[key]) assetsPrice[key] = data[key];
    });

    return assetsPrice;
  } catch (err) {
    console.error('Failed to get token price', err);
    throw err;
  }
};
