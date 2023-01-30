// Copyright 2019-2022 @subwallet/extension-koni authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { NetworkJson } from './api/evm/types/ether';
import { ContractType } from '@/interfaces/ether';

export const PREDEFINED_NETWORKS: Record<string, NetworkJson> = {
  ethereum: {
    key: 'ethereum',
    chain: 'Ethereum Mainnet',
    genesisHash: '0xb60d7bdd334cd3768d43f14a05c7fe7e886ba5bcb77e1064530052fed1a3f145',
    ss58Format: 0,
    providers: {
      Alchemy: 'wss://eth-mainnet.g.alchemy.com/v2/r2rCN7zWhPZ0cggKYqk_MElwxrrRM4Kw',
    },
    active: true,
    currentProviderMode: 'http',
    currentProvider: 'Alchemy',
    groups: ['MAIN_NET'],
    isEthereum: true,
    nativeToken: 'ETH',
    decimals: 18,
    coinGeckoKey: 'ethereum',
    evmChainId: 1,
    supportBonding: false,
    abiExplorer: 'https://etherscan.io',
    supportSmartContract: [ContractType.evm],
  },
  ethereum_goerli: {
    key: 'ethereum_goerli',
    chain: 'Ethereum Testnet (Goerli)',
    genesisHash: '0x2c8974e8936649eb65786299a1129fb6a47c5e703705489be96ea715496096c5',
    ss58Format: 0,
    providers: {
      Alchemy: 'wss://eth-goerli.g.alchemy.com/v2/WJz4vP6DoqLvRxiJDofxQWq8Fc9UCLbH',
    },
    active: true,
    currentProviderMode: 'http',
    currentProvider: 'Alchemy',
    groups: ['TEST_NET'],
    isEthereum: true,
    nativeToken: 'GoerliETH',
    decimals: 18,
    coinGeckoKey: 'ethereum_goerli',
    evmChainId: 1,
    supportBonding: false,
    abiExplorer: 'https://goerli.etherscan.io',
    supportSmartContract: [ContractType.evm],
  },
};

function getGenesisHashes() {
  const result: Record<string, string> = {};

  for (const [key, networkJson] of Object.entries(PREDEFINED_NETWORKS)) {
    if (networkJson.genesisHash !== 'UNKNOWN' && networkJson.genesisHash !== 'UPDATING') {
      result[networkJson.genesisHash] = key;
    }
  }

  return result;
}

export const PREDEFINED_GENESIS_HASHES = getGenesisHashes();
