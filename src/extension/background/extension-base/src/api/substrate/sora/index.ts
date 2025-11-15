import { getAssetBalance } from '../../../background/helpers';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { Asset } from '@sora/assets/types';
import type { NetworkName } from '@/interfaces';

interface Props {
  assetId: string;
  network: NetworkName;
  tokenBalance: TokenGroup;
}

const KUSAMA_PARACHAIN_ID = '6d8d9f145c2177fa83512492cdd80a71e29f22473f4a8943a6292149ac319fb9';
const POLKADOT_PARACHAIN_ID = 'e92d165ad41e41e215d09713788173aecfdbe34d3bed29409d33a2ef03980738';

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

export * from './bridge';
export * from './swap';

export { KUSAMA_PARACHAIN_ID, POLKADOT_PARACHAIN_ID, getSoraAsset };
