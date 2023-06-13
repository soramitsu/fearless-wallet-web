// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import EthProvider from '@extension-base/api/evm/ethProvider';

export async function getEVMBalance(
  networkKey: string,
  addresses: string[],
  web3ApiMap: Record<string, EthProvider>
): Promise<string[]> {
  const web3Api = web3ApiMap[networkKey];

  return await Promise.all(
    addresses.map(async (address) => {
      return await web3Api.getBalance(address);
    })
  );
}
