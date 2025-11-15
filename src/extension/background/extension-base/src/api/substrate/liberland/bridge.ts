import { getFPNumberCtor } from '@extension-base/services/utils/sora';
import type { CrossChainProps, Extrinsic } from '@extension-base/api/substrate/types';
import type State from '@extension-base/background/handlers/State';
import { getAssetBalance, getAssetInfo } from '@/extension/background/extension-base/src/background/helpers';

const getFPNumber = getFPNumberCtor;
const SUB_NETWORK_MAINNET = 'Mainnet';
const LIBERLAND_ASSET_LLD = 'LLD';
const BRIDGE_ACCOUNT_SORA = 'Sora';

async function createLiberlandCrossChain(props: CrossChainProps, state: State): Promise<Extrinsic> {
  const { originNet, amount, to, tokenBalance, assetId } = props;

  const api = state.getSubstrateApiMap[originNet.toLowerCase()]?.api;

  if (!api) return;

  await api.isReadyOrError;

  const { precision } = getAssetBalance(originNet, tokenBalance);
  const { currencyId } = getAssetInfo(assetId, state);

  const FPNumber = await getFPNumber();
  const value = new FPNumber(amount, precision).toCodecString();

  const assetIdProp = currencyId ? { Asset: Number(currencyId) } : LIBERLAND_ASSET_LLD;

  return api.tx.soraBridgeApp.burn(
    SUB_NETWORK_MAINNET,
    assetIdProp,
    {
      [BRIDGE_ACCOUNT_SORA]: to,
    },
    value
  );
}

export { createLiberlandCrossChain };
