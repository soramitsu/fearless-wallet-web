import type { ActionTree } from 'vuex';
import type { AugmentedPoolsContext, GetPoolsParamsProps, GetPoolsNetworkProps } from './types';
import { POOLS_NETWORKS_LIST, type State } from '@/store/pools/state';
import { getPoolsParams, getMyPoolsInfo } from '@/extension/messaging';
import { SEC1 } from '@/consts/time';
import { MutationTypes } from '@/store/pools/mutations';

export enum ActionTypes {
  GET_POOLS_PARAMS = 'GET_POOLS_PARAMS',
  GET_MY_POOLS_INFO = 'GET_MY_POOLS_INFO',
}

export type Actions = {
  [ActionTypes.GET_POOLS_PARAMS](store: AugmentedPoolsContext, props: GetPoolsParamsProps): Promise<void>;
  [ActionTypes.GET_MY_POOLS_INFO](store: AugmentedPoolsContext, props: GetPoolsNetworkProps): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.GET_POOLS_PARAMS]({ commit }, props = { delay: 0 }) {
    commit(MutationTypes.CLEAR_POOLS_PARAMS, undefined);

    await new Promise((res) => {
      setTimeout(async () => {
        const poolsParams = await getPoolsParams({ networks: POOLS_NETWORKS_LIST });

        commit(MutationTypes.UPDATE_POOLS_PARAMS, poolsParams);

        res(true);
      }, props.delay);
    });
  },

  async [ActionTypes.GET_MY_POOLS_INFO]({ commit }, { network }) {
    setTimeout(async () => {
      const poolsInfo = await getMyPoolsInfo({ network });

      commit(MutationTypes.UPDATE_MY_POOLS_INFO, { network, poolsInfo });
    }, SEC1 * 10);
  },
};

export default actions;
