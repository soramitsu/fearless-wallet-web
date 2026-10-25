import type { CrossChainProps, Extrinsic } from '@extension-base/api/substrate/types';
import type State from '@extension-base/background/handlers/State';
import { FPNumber } from '@/sora/number';
import { SubNetworkId, LiberlandAssetType } from '@/sora/types';
import { BridgeAccountType } from '@/sora/types';
import { getAssetBalance, getAssetInfo } from '@/extension/background/extension-base/src/background/helpers';

async function createLiberlandCrossChain(props: CrossChainProps, state: State): Promise<Extrinsic> {
  const { originNet, amount, to, tokenBalance, assetId } = props;

  const api = state.getSubstrateApiMap[originNet.toLowerCase()]?.api;

  if (!api) return;

  await api.isReadyOrError;

  const { precision } = getAssetBalance(originNet, tokenBalance);
  const { currencyId } = getAssetInfo(assetId, state);

  const value = new FPNumber(amount, precision).toCodecString();

  const assetIdProp = currencyId ? { Asset: Number(currencyId) } : LiberlandAssetType.LLD;

  return api.tx.soraBridgeApp.burn(
    SubNetworkId.Mainnet,
    assetIdProp,
    {
      [BridgeAccountType.Sora]: to,
    },
    value
  );
}

export { createLiberlandCrossChain };
