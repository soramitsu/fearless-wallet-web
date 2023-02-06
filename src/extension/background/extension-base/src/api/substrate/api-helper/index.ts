// Copyright 2017-2022 @polkadot/apps-config authors & contributors
// SPDX-License-Identifier: Apache-2.0

import typesChain from './chain';

import type { OverrideBundleType } from '@polkadot/types/types';

export function getChainTypes(_specName: string, chainName: string): Record<string, string | Record<string, unknown>> {
  return {
    ...(typesChain[chainName as keyof typeof typesChain] || {}),
  };
}

export const moonbeamBaseChains = ['moonbase', 'moonbeam', 'moonriver'];

// deprecated
export const ethereumChains = [
  'moonbase',
  'moonbeam',
  'moonriver',
  'moonshadow',
  'ethereum',
  'binance',
  'astarEvm',
  'shidenEvm',
  'shibuyaEvm',
  'origintrail-parachain',
];

export { typesChain };
