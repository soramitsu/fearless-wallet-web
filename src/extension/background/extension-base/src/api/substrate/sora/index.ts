import { getAssetBalance } from '../../../background/helpers';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { Asset } from '@/sora/types';
import type { NetworkName } from '@/interfaces';

interface Props {
  assetId: string;
  network: NetworkName;
  tokenBalance: TokenGroup;
}

function getSoraAsset(props: Props): Asset {
  const { network, tokenBalance } = props;
  const { precision, symbol, currencyId } = getAssetBalance(network, tokenBalance);

  return {
    address: currencyId!,
    symbol,
    name: symbol,
    decimals: precision,
    isMintable: true,
  };
}

export * from './swap';

export { getSoraAsset };
