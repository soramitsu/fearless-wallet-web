import type { MutationTree } from 'vuex';
import type { State } from './state';
import type { SetAllPoolsItems, SetMyPoolsInfo } from './types';
import { isSameString } from '@/helpers';

export enum MutationTypes {
  UPDATE_POOLS_PARAMS = 'UPDATE_POOLS_PARAMS',
  CLEAR_POOLS_PARAMS = 'CLEAR_POOLS_PARAMS',
  UPDATE_MY_POOLS_INFO = 'UPDATE_MY_POOLS_INFO',
}

export type Mutations = {
  [MutationTypes.UPDATE_POOLS_PARAMS](state: State, props: SetAllPoolsItems): void;
  [MutationTypes.CLEAR_POOLS_PARAMS](state: State): void;
  [MutationTypes.UPDATE_MY_POOLS_INFO](state: State, props: SetMyPoolsInfo): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.UPDATE_POOLS_PARAMS](state, poolsParams) {
    poolsParams.forEach((params, index) => {
      const newItem = {
        ...state.allPoolsItems[index],
        ...params,
        loading: false,
      };

      state.allPoolsItems.splice(index, 1, newItem);
    });
  },

  [MutationTypes.CLEAR_POOLS_PARAMS](state) {
    state.allPoolsItems.forEach((item, index) => {
      state.allPoolsItems.splice(index, 1, {
        ...item,
        loading: true,
      });
    });

    return;
  },

  [MutationTypes.UPDATE_MY_POOLS_INFO](state, { network, poolsInfo }) {
    const index = state.allPoolsItems.findIndex(({ network: _network }) => isSameString(_network, network));
    const oldItem = state.allPoolsItems[index];

    state.allPoolsItems.splice(index, 1, {
      ...oldItem,
      ...poolsInfo,
    });
  },
};

export default mutations;
