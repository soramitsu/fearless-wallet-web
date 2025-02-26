import type { NetworkParams } from '@/stores/staking/types';
import { SORA_ICON, SORA_NETWORK_NAME, SORA_UTILITY_ASSET, SORA_XOR_ASSET_ID } from '@/consts/sora';
import { getDefaultStakingParams } from '@/helpers/staking';

export type State = {
  allStakingNetworks: Omit<NetworkParams, 'bondAmount'>[];
};

const getDefaultNetworkParams = (stakingNetwork: Partial<NetworkParams>) => {
  return {
    ...stakingNetwork,
    transferableAmount: '0',
    loading: true,
    ...getDefaultStakingParams(stakingNetwork.network!),
  } as Omit<NetworkParams, 'bondAmount'>;
};

const STAKING_ITEMS: Partial<NetworkParams>[] = [
  {
    network: SORA_NETWORK_NAME,
    asset: SORA_UTILITY_ASSET,
    assetId: SORA_XOR_ASSET_ID,
    icon: SORA_ICON,
    type: 'regular',
  },
];

export const state = (): State => {
  return {
    allStakingNetworks: STAKING_ITEMS.map((params) => getDefaultNetworkParams(params)),
  };
};
