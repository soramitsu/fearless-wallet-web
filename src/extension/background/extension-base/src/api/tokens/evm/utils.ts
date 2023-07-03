// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Contract, ethers } from 'ethers';
import ERC20Contract from '@extension-base/api/evm/helpers/ERC20Contract.json';

export async function validateEvmToken(contractAddress: string) {
  let tokenContract: Contract;
  const name = '';
  const decimals: number | undefined = -1;
  const symbol = '';
  let contractError = false;

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument,@typescript-eslint/no-unsafe-member-access
    tokenContract = new ethers.Contract(contractAddress, ERC20Contract.abi);

    // const [_decimals, _symbol] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
    // tokenContract.methods.decimals().call() as number,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
    // tokenContract.methods.symbol().call() as string,
    // ]);

    // name = _symbol;
    // decimals = _decimals;
    // symbol = _symbol;

    if (name === '' || symbol === '') {
      contractError = true;
    }

    return {
      name,
      decimals,
      symbol,
      contractError,
    };
  } catch (e) {
    console.error('Error response while validating EVM contract', e);

    return {
      name,
      decimals,
      symbol,
      contractError: true,
    };
  }
}
