// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { ethers } from 'ethers';
import EthProvider from '@extension-base/api/evm/ethProvider';
import type { EvmNetworkType } from '@/interfaces/ether';

// eslint-disable-next-line @typescript-eslint/no-var-requires,@typescript-eslint/no-unsafe-assignment
export const ERC20Contract = require('./helper/ERC20Contract.json');

export const getERC20Contract = (
  networkKey: string,
  assetAddress: string,
  web3ApiMap: Record<string, EthProvider>
): ethers.Contract => {
  return new ethers.Contract(assetAddress, ERC20Contract.abi, web3ApiMap[networkKey].provider);
};

export const initWeb3Api = (provider: string) => {
  if (provider.startsWith('http')) {
    return new EthProvider(provider as EvmNetworkType);
  } else {
    return new EthProvider(provider as EvmNetworkType);
  }
};
