// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { isEthereumAddress } from '@polkadot/util-crypto';
import { CustomTokenType } from '@extension-base/api/evm/types/ether';
import type { ChainRegistry, DeleteCustomTokenParams } from '@extension-base/types';
import type { CustomTokenJson, CustomToken } from '@extension-base/api/evm/types/ether';

export interface UpsertCustomTokenResp {
  needUpdateChainRegistry: boolean;
  newCustomTokenState: CustomTokenJson;
}

export function isEqualContractAddress(address1: string, address2: string) {
  if (isEthereumAddress(address1) && isEthereumAddress(address2)) {
    return address1.toLowerCase() === address2.toLowerCase(); // EVM address is case-insensitive
  }

  return address2 === address1;
}

export function upsertCustomToken(targetToken: CustomToken, customTokenState: CustomTokenJson): UpsertCustomTokenResp {
  let isExisted = false;
  const tokenList: CustomToken[] = customTokenState[targetToken.type];
  let newTokenList = tokenList;

  for (const token of tokenList) {
    if (isEqualContractAddress(token.smartContract, targetToken.smartContract) && token.chain === targetToken.chain) {
      isExisted = true;
      break;
    }
  }

  if (!isExisted) {
    newTokenList.push(targetToken);
  } else {
    newTokenList = tokenList.map((token: CustomToken) => {
      if (isEqualContractAddress(token.smartContract, targetToken.smartContract)) {
        if (token.isDeleted) {
          return {
            name: token.name,
            smartContract: token.smartContract,
            chain: token.chain,
            type: token.type,
          };
        }

        return targetToken;
      }

      return token;
    });
  }

  const needUpdateChainRegistry = targetToken.type === CustomTokenType.erc20; // more logic when there are more standards

  return {
    newCustomTokenState: { ...customTokenState, [targetToken.type]: newTokenList },
    needUpdateChainRegistry,
  } as UpsertCustomTokenResp;
}

export const FUNGIBLE_TOKEN_STANDARDS = [CustomTokenType.erc20];

export function getTokensForChainRegistry(customTokenJson: CustomTokenJson) {
  const customTokens: CustomToken[] = [];

  for (const tokenType of FUNGIBLE_TOKEN_STANDARDS) {
    customTokenJson[tokenType].forEach((token: CustomToken) => {
      if (!token.isDeleted) {
        customTokens.push(token);
      }
    });
  }

  return customTokens;
}

export function deleteCustomTokens(
  targetTokens: DeleteCustomTokenParams[],
  customTokenState: CustomTokenJson,
  chainRegistryMap: Record<string, ChainRegistry>
) {
  let needUpdateChainRegistry = false;
  const deletedNfts: DeleteCustomTokenParams[] = [];
  const deletedFungibleTokens: DeleteCustomTokenParams[] = [];

  // handle token state
  for (const targetToken of targetTokens) {
    const tokenList = customTokenState[targetToken.type];
    let processed = false;

    for (let index = 0; index < tokenList.length; index++) {
      if (
        isEqualContractAddress(tokenList[index].smartContract, targetToken.smartContract) &&
        tokenList[index].chain === targetToken.chain &&
        tokenList[index].type === targetToken.type
      ) {
        if (tokenList[index].isCustom) {
          tokenList.splice(index, 1);
        } else {
          tokenList[index].isDeleted = true;
        }

        processed = true;
      }
    }

    if (processed) {
      if (FUNGIBLE_TOKEN_STANDARDS.includes(targetToken.type)) {
        needUpdateChainRegistry = true;
        deletedFungibleTokens.push(targetToken);
      } else {
        deletedNfts.push(targetToken);
      }
    }
  }

  // update chain registry
  if (needUpdateChainRegistry) {
    for (const targetToken of deletedFungibleTokens) {
      const chainRegistry = chainRegistryMap[targetToken.chain];

      if (chainRegistry) {
        let deleteKey = '';

        for (const [key, token] of Object.entries(chainRegistry.assetsMap)) {
          if (token.smartContract && isEqualContractAddress(token.smartContract, targetToken.smartContract)) {
            deleteKey = key;

            break;
          }
        }

        chainRegistryMap[targetToken.chain] = chainRegistry;
      }
    }
  }

  return {
    newCustomTokenState: customTokenState,
    newChainRegistryMap: chainRegistryMap,
    deletedNfts,
  };
}
