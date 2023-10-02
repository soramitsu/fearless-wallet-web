import State from '@extension-base/background/handlers/State';
import type { BalanceItem, CustomTokenJson } from '@extension-base/api/evm/types/ether';
import type { Asset } from '@extension-base/types';

export function checkMainToken(networkKey: string, id: string, state: State): boolean {
  if (id === undefined) return false;

  return (
    state.networksJson
      .find(({ name }) => name.toLowerCase() === networkKey.toLowerCase())!
      .assets.find((asset) => asset.id === id)?.isUtility ?? false
  );
}

export const setBalance = (networkKey: string, rs: Partial<BalanceItem>, address: string, state: State) => {
  const isAccountExists = state.keyringService.getAccounts().some((el) => el.address === address);

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
