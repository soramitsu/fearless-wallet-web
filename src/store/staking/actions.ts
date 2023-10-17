import type { State } from '@/store/staking/state';
import type { ActionTree } from 'vuex';
import type { AugmentedStakingContext, GetStakingNetworkProps } from './types';
import { getStakingParams, getMyStakingInfo } from '@/extension/messaging';
import { SEC1 } from '@/consts/time';
import { MutationTypes } from '@/store/staking/mutations';

export enum ActionTypes {
  GET_STAKING_PARAMS = 'GET_STAKING_PARAMS',
  GET_MY_STAKING_INFO = 'GET_MY_STAKING_INFO',
}

export type Actions = {
  [ActionTypes.GET_STAKING_PARAMS](store: AugmentedStakingContext): Promise<void>;
  [ActionTypes.GET_MY_STAKING_INFO](store: AugmentedStakingContext, props: GetStakingNetworkProps): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.GET_STAKING_PARAMS]({ commit, state }) {
    commit(MutationTypes.CLEAR_STAKING_PARAMS, undefined);

    const networks = state.allStakingNetworks.map(({ network }) => network);
    const stakingParams = await getStakingParams({ networks });

    commit(MutationTypes.UPDATE_STAKING_PARAMS, stakingParams);
  },

  async [ActionTypes.GET_MY_STAKING_INFO]({ commit }, { network }) {
    setTimeout(async () => {
      const stakingInfo = await getMyStakingInfo({ network });

      commit(MutationTypes.UPDATE_MY_STAKING_INFO, { network, stakingInfo });
    }, SEC1 * 5);
  },
};

export default actions;
