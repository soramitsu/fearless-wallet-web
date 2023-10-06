import State from '@extension-base/background/handlers/State';
import type { BalanceItem, CustomTokenJson } from '@extension-base/api/evm/types/ether';
import type { Asset } from '@extension-base/types';

export const setBalance = (networkKey: string, rs: Partial<BalanceItem>, address: string, state: State) => {
  const isAccountExists = state.keyringService.getAllAccounts().some((el) => el.address === address);

  if (!isAccountExists) return;

  state.setBalanceItem(networkKey, rs, address);
};

export function getAssetInfo(assetId: string, state: State): Asset {
  return state.assetsMap.find(({ id }) => id === assetId)!;
}

export interface UpsertCustomTokenResp {
  needUpdateChainRegistry: boolean;
  newCustomTokenState: CustomTokenJson;
}
