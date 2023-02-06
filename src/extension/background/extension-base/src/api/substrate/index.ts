// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { getCurrentProvider } from '../../background/handlers/helpers';
import { ApiProps } from '../../background/types';
import { PREDEFINED_NETWORKS } from '../../predefinedNetworks';
import { NetworkJson } from '../evm/types/ether';
import { initApi } from './api';

export * from './api';

export function getGenesis(name: string): string {
  if (
    PREDEFINED_NETWORKS[name] &&
    PREDEFINED_NETWORKS[name].genesisHash &&
    PREDEFINED_NETWORKS[name].genesisHash.toLowerCase() !== 'unknown'
  ) {
    return PREDEFINED_NETWORKS[name].genesisHash;
  }

  console.info(`Genesis hash of ${name} is not available`);

  return `not_available_genesis_hash__${name}`;
}

export function connectDotSamaApis(
  networks = PREDEFINED_NETWORKS,
  networkMap: Record<string, NetworkJson>
): Record<string, ApiProps> {
  const apisMap: Record<string, ApiProps> = {};

  Object.keys(networks).forEach((networkKey) => {
    const network = networks[networkKey];

    if (
      !networkMap[networkKey] ||
      !network.genesisHash ||
      network.genesisHash.toLowerCase() === 'unknown' ||
      !network.currentProvider
    ) {
      return;
    }

    const currentProvider = getCurrentProvider(network);

    if (currentProvider) {
      apisMap[networkKey] = initApi(networkKey, currentProvider, networkMap[networkKey].isEthereum);
    }
  });

  return apisMap;
}

export default connectDotSamaApis;
