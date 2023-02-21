// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { NetworkJsonOld } from './types';

export const PREDEFINED_EVM_NETWORKS = {
  chainId: '0xb60d7bdd334cd3768d43f14a05c7fe7e886ba5bcb77e1064530052fed1a3f145',
  name: 'Ethereum Mainnet',
  externalApi: {
    history: {
      type: 'etherscan',
      url: 'https://etherscan.io',
    },
    explorers: [
      {
        type: 'etherscan',
        types: ['transaction', 'account'],
        url: 'https://etherscan.io/{type}/{value}',
      },
    ],
  },
  assets: [
    {
      assetId: 'etherium_asset_id',
      isUtility: true,
    },
    {
      assetId: 'dai_asset_id',
    },
  ],
  nodes: [
    { name: 'Cloudflare', url: 'https://cloudflare-eth.com' },
    {
      name: 'BlastApi',
      url: 'https://eth-mainnet.public.blastapi.io',
    },
    {
      name: 'Infura',
      url: 'https://mainnet.infura.io/v3/b6bf7d3508c941499b10025c0776eaf8',
    },
  ],
};

export function getGenesisHashes(networkJson: Record<string, NetworkJsonOld>) {
  const result: Record<string, string> = {};

  for (const [key, network] of Object.entries(networkJson)) {
    if (network.genesisHash !== 'UNKNOWN' && network.genesisHash !== 'UPDATING') {
      result[network.genesisHash] = key;
    }
  }

  return result;
}
