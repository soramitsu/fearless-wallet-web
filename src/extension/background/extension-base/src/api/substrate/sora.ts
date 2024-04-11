import { getAssetBalance, getAssetInfo } from '../helpers';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { Asset } from '@sora-substrate/util/src/assets/types';
import type State from '@extension-base/background/handlers/State';
import type { NetworkName } from '@/interfaces';

interface Props {
  assetId: string;
  network: NetworkName;
  tokenBalance: TokenGroup;
}

export function getSoraAsset(props: Props, state: State): Asset {
  const { network, tokenBalance, assetId } = props;
  const { precision, symbol } = getAssetBalance(network, tokenBalance);
  const { currencyId } = getAssetInfo(assetId, state);

  return {
    address: currencyId!,
    symbol: symbol,
    name: symbol,
    decimals: precision,
    isMintable: true,
  };
}
