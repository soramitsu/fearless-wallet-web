import { SORA_NETWORK_NAME, SORA_UTILITY_ASSET, SORA_XOR_ASSET_ID } from '@/consts/sora';
import { NetworkParams } from '@/store/staking/types';

export type State = {
  allStakingNetworks: NetworkParams[];
};

const state = (): State => {
  return {
    allStakingNetworks: [
      {
        network: SORA_NETWORK_NAME,
        asset: SORA_UTILITY_ASSET,
        assetId: SORA_XOR_ASSET_ID,
        type: 'regular',
        icon: 'https://raw.githubusercontent.com/soramitsu/shared-features-utils/master/icons/chains/white/SORA.svg',
        unbondPeriod: 0,
        maxNominations: 0,
        minBond: 0,
        apy: 0,
        bondAmount: '0',
        unbondAmount: '0',
        rebondAmount: '0',
        withdrawUnbondedAmount: '0',
      },
    ],
  };
};

export default state;
