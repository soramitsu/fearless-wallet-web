import { Contract } from 'ethers';
import ERC20Contract from '@extension-base/api/evm/helpers/ERC20Contract.json';
import { isEthereumAddress } from '@polkadot/util-crypto';
import { state } from '@extension-base/background/handlers';
import { CustomTokenType, CustomTokenJson, CustomToken } from '@extension-base/api/evm/types/ether';

export function checkMainToken(networkKey: string, id: string): boolean {
  if (id === undefined) return false;

  return (
    state.networksJson
      .find(({ name }) => name.toLowerCase() === networkKey.toLowerCase())!
      .assets.find((asset) => asset.id === id)?.isUtility ?? false
  );
}

export async function validateEvmToken(contractAddress: string) {
  let tokenContract: Contract;
  let name = '';
  let decimals: number | undefined = -1;
  let symbol = '';
  let contractError = false;

  try {
    tokenContract = new Contract(contractAddress, ERC20Contract.abi);

    const [_decimals, _symbol] = await Promise.all([
      tokenContract.decimals() as unknown as number,
      tokenContract.symbol() as unknown as string,
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
    if (isEqualContractAddress(token.id, targetToken.id) && token.chain === targetToken.chain) {
      isExisted = true;
      break;
    }
  }

  if (!isExisted) {
    newTokenList.push(targetToken);
  } else {
    newTokenList = tokenList.map((token: CustomToken) => {
      if (isEqualContractAddress(token.id, targetToken.id)) {
        if (token.isDeleted) {
          return {
            name: token.name,
            id: token.id,
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
