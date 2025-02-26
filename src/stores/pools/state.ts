import type { StatePoolParams } from './types';
import { SORA_NETWORK_NAME } from '@/consts/sora';
import { accountController } from '@/controllers';

export const POOLS_NETWORKS_LIST = [SORA_NETWORK_NAME];

export type State = {
  allPoolsItems: StatePoolParams[];
  showPoolsBanner: boolean;
};

export const state = (): State => {
  return {
    allPoolsItems: [],
    showPoolsBanner: !accountController.getHidingPoolsBanner(),
  };
};
