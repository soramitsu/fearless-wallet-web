import type { ActionTree } from 'vuex';
import type { AugmentedPoolsContext, GetPoolsParamsProps } from './types';
import { POOLS_NETWORKS_LIST, type State } from '@/store/pools/state';
import { getPoolsParams } from '@/extension/messaging';
import { MutationTypes } from '@/store/pools/mutations';

export enum ActionTypes {
  GET_POOLS_PARAMS = 'GET_POOLS_PARAMS',
}

export type Actions = {
  [ActionTypes.GET_POOLS_PARAMS](store: AugmentedPoolsContext, props: GetPoolsParamsProps): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.GET_POOLS_PARAMS]({ commit }, props = { delay: 0 }) {
    commit(MutationTypes.CLEAR_POOLS_PARAMS, undefined);

    await new Promise((res) => {
      setTimeout(async () => {
        const poolParams = await getPoolsParams({ networks: POOLS_NETWORKS_LIST });

        commit(MutationTypes.UPDATE_POOLS_PARAMS, poolParams);

        res(true);
      }, props.delay);
    });
  },
};

export default actions;
