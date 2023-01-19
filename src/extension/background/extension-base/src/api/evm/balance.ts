// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import EthProvider from './ethProvider';

export async function getEVMBalance(
  networkKey: string,
  addresses: string[],
  web3ApiMap: Record<string, EthProvider>
): Promise<string[]> {
  const eth = web3ApiMap[networkKey];

  return await Promise.all(
    addresses.map(async (address) => {
      return await eth.getBalance(address);
    })
  );
}
