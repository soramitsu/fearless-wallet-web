import { GetStakingNetwork, NetworkParams } from './types';
import type { GetterTree } from 'vuex';
import type { State } from './state';
import { isSameString } from '@/helpers';

export enum GettersTypes {
  stakingItems = 'stakingItems',
  myStakingItems = 'myStakingItems',
  getStakingNetwork = 'getStakingNetwork',
}

export type Getters = {
  [GettersTypes.stakingItems](state: State): NetworkParams[];
  [GettersTypes.myStakingItems](state: State): NetworkParams[];
  [GettersTypes.getStakingNetwork](state: State): GetStakingNetwork;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.stakingItems]({ allStakingNetworks }): NetworkParams[] {
    return allStakingNetworks.filter(({ bondAmount }) => bondAmount === '0');
  },

  [GettersTypes.myStakingItems]({ allStakingNetworks }): NetworkParams[] {
    return allStakingNetworks.filter(({ bondAmount }) => bondAmount !== '0');
  },

  [GettersTypes.getStakingNetwork]:
    ({ allStakingNetworks }) =>
    (networkName: string) => {
      return allStakingNetworks.find(({ network }) => isSameString(network, networkName))!;
    },
};

export default getters;
