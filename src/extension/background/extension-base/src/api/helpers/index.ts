import type { TokenGroup } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import type { BalanceItem, CustomTokenJson } from '@extension-base/api/evm/types';
import type { Asset } from '@extension-base/types';
import type { NetworkName } from '@/interfaces';
import { isSameString } from '@/helpers';

export function getAssetInfo(assetId: string, state: State): Asset {
  return state.networkService.assetsMap.find(({ id }) => id === assetId)!;
}

export function getAssetBalance(network: NetworkName, tokenBalance: TokenGroup): BalanceItem {
  return tokenBalance.balances.find(({ name }) => isSameString(name, network))!;
}

export interface UpsertCustomTokenResp {
  needUpdateChainRegistry: boolean;
  newCustomTokenState: CustomTokenJson;
}
