import type { PoolParams } from '@/store/pools/types';
import { SORA_MAINNET, SORA_NETWORK_NAME } from '@/consts/sora';
import { accountController } from '@/controllers';

export const POOLS_NETWORKS_LIST = [SORA_NETWORK_NAME];
// export const POOLS_NETWORKS_LIST = [SORA_MAINNET];

export type State = {
  allPoolsItems: PoolParams[];
  showPoolsBanner: boolean;
};

const state = (): State => {
  return {
    allPoolsItems: [],
    showPoolsBanner: !accountController.getHidingPoolsBanner(),
  };
};

export default state;
