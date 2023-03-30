// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { getCurrentProvider } from '../../background/handlers/helpers';
import { ApiProps } from '../../background/types/types';
import { NetworkJsonOld } from '../../types';
import { initApi } from './api';

export * from './api';

export function getGenesis(name: string, networks: Record<string, NetworkJsonOld>): string {
  if (networks[name] && networks[name].genesisHash && networks[name].genesisHash.toLowerCase() !== 'unknown') {
    return networks[name].genesisHash;
  }

  console.info(`Genesis hash of ${name} is not available`);

  return `not_available_genesis_hash__${name}`;
}

export function connectDotSamaApis(
  networks: Record<string, NetworkJsonOld>,
  networkMap: Record<string, NetworkJsonOld>
): Record<string, ApiProps> {
  const apisMap: Record<string, ApiProps> = {};

  Object.keys(networks).forEach(async (networkKey) => {
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
      apisMap[networkKey] = await initApi(networkMap[networkKey]);
    }
  });

  return apisMap;
}

export default connectDotSamaApis;
