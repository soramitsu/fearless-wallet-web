import { SORA_NETWORK_NAME, SORA_UTILITY_ASSET, SORA_XOR_ASSET_ID } from '@/consts/sora';
import { NetworkParams } from '@/store/staking/types';
import { getDefaultStakingParams } from '@/helpers/staking';

export type State = {
  allStakingNetworks: Omit<NetworkParams, 'bondAmount'>[];
};

const state = (): State => {
  return {
    allStakingNetworks: [
      {
        asset: SORA_UTILITY_ASSET,
        assetId: SORA_XOR_ASSET_ID,
        type: 'regular',
        icon: 'https://raw.githubusercontent.com/soramitsu/shared-features-utils/master/icons/chains/white/SORA.svg',
        transferableAmount: '0',
        ...getDefaultStakingParams(SORA_NETWORK_NAME),
      },
    ],
  };
};

export default state;
