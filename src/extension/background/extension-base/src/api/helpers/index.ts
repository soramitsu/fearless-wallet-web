import { state } from '@extension-base/background/handlers';
import { CustomTokenJson } from '@extension-base/api/evm/types/ether';

export function checkMainToken(networkKey: string, id: string): boolean {
  if (id === undefined) return false;

  return (
    state.networksJson
      .find(({ name }) => name.toLowerCase() === networkKey.toLowerCase())!
      .assets.find((asset) => asset.id === id)?.isUtility ?? false
  );
}

export interface UpsertCustomTokenResp {
  needUpdateChainRegistry: boolean;
  newCustomTokenState: CustomTokenJson;
}
