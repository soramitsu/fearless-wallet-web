// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Contract, ethers } from 'ethers';
import EthProvider from '@extension-base/api/evm/ethProvider';
import { CustomTokenType, CustomTokenJson, NetworkJson } from '@extension-base/api/evm/types/ether';
import { DEFAULT_EVM_TOKENS } from '@extension-base/api/tokens/evm/defaultEvmToken';
import { ERC20Contract } from '@extension-base/api/tokens/evm/web3';
import { isEqualContractAddress } from '@extension-base/api/tokens';

export async function validateEvmToken(contractAddress: string, tokenType: CustomTokenType.erc20, web3: EthProvider) {
  let tokenContract: Contract;
  let name = '';
  let decimals: number | undefined = -1;
  let symbol = '';
  let contractError = false;

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument,@typescript-eslint/no-unsafe-member-access
    tokenContract = new ethers.Contract(contractAddress, ERC20Contract.abi);

    const [_decimals, _symbol] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      tokenContract.methods.decimals().call() as number,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      tokenContract.methods.symbol().call() as string,
    ]);

    name = _symbol;
    decimals = _decimals;
    symbol = _symbol;

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

export function initEvmTokenState(customTokenState: CustomTokenJson, networkMap: Record<string, NetworkJson>) {
  const evmTokenState = { erc20: customTokenState.erc20 };

  for (const defaultToken of DEFAULT_EVM_TOKENS.erc20) {
    let exist = false;

    for (const storedToken of evmTokenState.erc20) {
      if (
        isEqualContractAddress(defaultToken.smartContract, storedToken.smartContract) &&
        defaultToken.chain === storedToken.chain
      ) {
        if (storedToken.isCustom) {
          // if existed, migrate the custom token -> default token
          delete storedToken.isCustom;
        }

        exist = true;
        break;
      }
    }

    if (!exist) {
      evmTokenState.erc20.push(defaultToken);
    }
  }

  // Update networkKey in case networkMap change
  for (const token of evmTokenState.erc20) {
    if (!(token.chain in networkMap) && token.chain.startsWith('custom_')) {
      let newKey = '';
      const genesisHash = token.chain.split('custom_')[1]; // token from custom network has key with prefix custom_

      for (const [key, network] of Object.entries(networkMap)) {
        if (network.genesisHash.toLowerCase() === genesisHash.toLowerCase()) {
          newKey = key;
          break;
        }
      }

      token.chain = newKey;
    }
  }

  return evmTokenState;
}
