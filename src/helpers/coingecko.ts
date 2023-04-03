// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0

import axios from 'axios';
import { AssetJson, AssetsPrice } from '@/interfaces';

export const getTokenPrice = async (
  chains: Array<string>,
  fiatName = 'usd',
  assetsJson: AssetJson[]
): Promise<AssetsPrice> => {
  try {
    const chainsStr = chains.join(',');
    const { data, status } = await axios.get<AssetsPrice>(
      `https://api.coingecko.com/api/v3/simple/price?vs_currencies=${fiatName}&include_24hr_change=true&ids=${chainsStr}`
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

    return assetsPrice;
  } catch (err) {
    console.error('Failed to get token price', err);
    throw err;
  }
};
