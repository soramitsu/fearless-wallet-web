import type { PoolParams } from '@/store/pools/types';
import { SORA_MAINNET, SORA_NETWORK_NAME } from '@/consts/sora';

// export const POOLS_NETWORKS_LIST = [SORA_NETWORK_NAME]; TODO revert
export const POOLS_NETWORKS_LIST = [SORA_MAINNET];

export type State = {
  allPoolsItems: PoolParams[];
};

const state = (): State => {
  return {
    allPoolsItems: [],
  };
};

export default state;
