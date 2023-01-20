import { CustomTokenJson, CustomToken, CustomTokenType } from '../evm/types/ether';
export const FUNGIBLE_TOKEN_STANDARDS = [CustomTokenType.erc20];

export function getTokensForChainRegistry(customTokenJson: CustomTokenJson) {
  const customTokens: CustomToken[] = [];

  for (const tokenType of FUNGIBLE_TOKEN_STANDARDS) {
    customTokenJson[tokenType].forEach((token) => {
      if (!token.isDeleted) {
        customTokens.push(token);
      }
    });
  }

  return customTokens;
}
