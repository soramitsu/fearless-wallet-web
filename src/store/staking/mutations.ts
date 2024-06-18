import type { MutationTree } from 'vuex';
import type { State } from './state';
import type { SetAllStakingItems, SetMyStakingInfo } from './types';
import { isSameString } from '@/helpers';

export enum MutationTypes {
  UPDATE_STAKING_PARAMS = 'UPDATE_STAKING_PARAMS',
  CLEAR_STAKING_PARAMS = 'CLEAR_STAKING_PARAMS',
  UPDATE_MY_STAKING_INFO = 'UPDATE_MY_STAKING_INFO',
}

export type Mutations = {
  [MutationTypes.UPDATE_STAKING_PARAMS](state: State, props: SetAllStakingItems): void;
  [MutationTypes.CLEAR_STAKING_PARAMS](state: State): void;
  [MutationTypes.UPDATE_MY_STAKING_INFO](state: State, props: SetMyStakingInfo): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.UPDATE_STAKING_PARAMS](state, stakingParams) {
    stakingParams.forEach((params, index) => {
      const newItem = {
        ...state.allStakingNetworks[index],
        ...params,
        loading: false,
      };

      state.allStakingNetworks.splice(index, 1, newItem);
    });

    state.allStakingNetworks = [...state.allStakingNetworks];
  },

  [MutationTypes.CLEAR_STAKING_PARAMS](state) {
    state.allStakingNetworks.forEach((item, index) => {
      state.allStakingNetworks.splice(index, 1, {
        ...item,
        loading: true,
      });
    });

    state.allStakingNetworks = [...state.allStakingNetworks];
  },

  [MutationTypes.UPDATE_MY_STAKING_INFO](state, { network, stakingInfo }) {
    const index = state.allStakingNetworks.findIndex(({ network: _network }) => isSameString(_network, network));
    const oldItem = state.allStakingNetworks[index];

    state.allStakingNetworks.splice(index, 1, {
      ...oldItem,
      ...stakingInfo,
    });

    state.allStakingNetworks = [...state.allStakingNetworks];
  },
};

export default mutations;
