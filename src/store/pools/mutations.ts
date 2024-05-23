import type { MutationTree } from 'vuex';
import type { State } from './state';
import type { SetAllPoolsItems, StatePoolParams } from './types';
import { accountController } from '@/controllers';

export enum MutationTypes {
  UPDATE_POOLS_PARAMS = 'UPDATE_POOLS_PARAMS',
  CLEAR_POOLS_PARAMS = 'CLEAR_POOLS_PARAMS',
  HIDE_POOLS_BANNER = 'HIDE_POOLS_BANNER',
}

export type Mutations = {
  [MutationTypes.UPDATE_POOLS_PARAMS](state: State, props: SetAllPoolsItems): void;
  [MutationTypes.CLEAR_POOLS_PARAMS](state: State): void;
  [MutationTypes.HIDE_POOLS_BANNER](state: State): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.UPDATE_POOLS_PARAMS](state, poolParams) {
    poolParams.forEach((params, index) => {
      const newItem: StatePoolParams = {
        ...state.allPoolsItems[index],
        ...params,
        loading: false,
      };

      state.allPoolsItems.splice(index, 1, newItem);
    });

    state.allPoolsItems = [...state.allPoolsItems];
  },

  [MutationTypes.CLEAR_POOLS_PARAMS](state) {
    state.allPoolsItems.forEach((item, index) => {
      state.allPoolsItems.splice(index, 1, {
        ...item,
        loading: true,
      });
    });

    state.allPoolsItems = [...state.allPoolsItems];
  },

  [MutationTypes.HIDE_POOLS_BANNER](state) {
    accountController.setHidingPoolsBanner();

    state.showPoolsBanner = false;
  },
};

export default mutations;
