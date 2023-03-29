// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { ApiPromise } from '@polkadot/api';
import { BN, bnToHex } from '@polkadot/util';
import { state } from '../../background/handlers';
import { ChainRegistry } from '../../types';
import { TokenInfo } from '../evm/types/ether';
import { AssetJson } from '@/interfaces';

export const cacheRegistryMap: Record<string, ChainRegistry> = {};

// temporary fix for token symbols, need a better fix later
function formatTokenSymbol(rawSymbol: string) {
  if (rawSymbol === 'xcKBTC') {
    return 'xckBTC';
  } else if (rawSymbol === 'xcIBTC') {
    return 'xciBTC';
  } else if (rawSymbol === 'KBTC') {
    return 'kBTC';
  } else if (rawSymbol === 'IBTC') {
    return 'iBTC';
  }

  return rawSymbol;
}

const DEFAULT_TOKEN_REGISTRY: Record<string, { chainDecimals: number[]; chainTokens: string[] }> = {
  ethereum: { chainDecimals: [18], chainTokens: ['ETH'] },
  ethereum_goerli: { chainDecimals: [18], chainTokens: ['GoerliETH'] },
  binance: { chainDecimals: [18], chainTokens: ['BNB'] },
  binance_test: { chainDecimals: [18], chainTokens: ['tBNB'] },
  boba_rinkeby: { chainDecimals: [18], chainTokens: ['ETH'] },
  boba: { chainDecimals: [18], chainTokens: ['ETH'] },
  bobabase: { chainDecimals: [18], chainTokens: ['BOBA'] },
  bobabeam: { chainDecimals: [18], chainTokens: ['BOBA'] },
  watr_network_evm: { chainDecimals: [18], chainTokens: ['WATRD'] },
};

export const getRegistry = async (networkKey: string, api: ApiPromise) => {
  const cached = cacheRegistryMap[networkKey];

  if (cached) {
    return cached;
  }

  await api.isReady;

  const { chainDecimals, chainTokens } = api.registry ||
    DEFAULT_TOKEN_REGISTRY[networkKey] || { chainDecimals: [], chainTokens: [] };

  const chainRegistry = {
    chainDecimals,
    chainTokens,
    tokenMap: state.tokenMap,
  } as ChainRegistry;

  cacheRegistryMap[networkKey] = chainRegistry;

  return chainRegistry;
};

export async function getTokenInfo(networkKey: string, api: ApiPromise, token: string): Promise<AssetJson> {
  const { tokenMap } = await getRegistry(networkKey, api);

  return tokenMap.find((el) => el.displayName === token || el.symbol === token)!;
}
