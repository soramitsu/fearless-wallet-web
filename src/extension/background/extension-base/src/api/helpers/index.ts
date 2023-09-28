import { state } from '@extension-base/background/handlers';
import type { BalanceItem, CustomTokenJson } from '@extension-base/api/evm/types/ether';

export function checkMainToken(networkKey: string, id: string): boolean {
  if (id === undefined) return false;

  return (
    state.networksJson
      .find(({ name }) => name.toLowerCase() === networkKey.toLowerCase())!
      .assets.find((asset) => asset.id === id)?.isUtility ?? false
  );
}

export const setBalance = (networkKey: string, rs: Partial<BalanceItem>, address: string) => {
  const isAccountExists = state.keyringService.getAccounts().some((el) => el.address === address);

  if (!isAccountExists) return;

  state.setBalanceItem(networkKey, rs, address);
};

export interface UpsertCustomTokenResp {
  needUpdateChainRegistry: boolean;
  newCustomTokenState: CustomTokenJson;
}
