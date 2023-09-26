import { MutationTypes } from './mutations';
import type { State } from '@/store/staking/state';
import type { ActionTree } from 'vuex';
import type { AugmentedStakingContext, GetStakingNetworkProps } from './types';
import { getMyValidators, getStakingParams, getUnlocking } from '@/extension/messaging';
import { SEC1 } from '@/consts/time';

export enum ActionTypes {
  GET_STAKING_PARAMS = 'GET_STAKING_PARAMS',
  GET_MY_VALIDATORS = 'GET_MY_VALIDATORS',
  GET_UNLOCKING = 'GET_UNLOCKING',
}

export type Actions = {
  [ActionTypes.GET_STAKING_PARAMS](store: AugmentedStakingContext): Promise<void>;
  [ActionTypes.GET_MY_VALIDATORS](store: AugmentedStakingContext, props: GetStakingNetworkProps): Promise<void>;
  [ActionTypes.GET_UNLOCKING](store: AugmentedStakingContext, props: GetStakingNetworkProps): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.GET_STAKING_PARAMS]({ commit, state }) {
    commit(MutationTypes.CLEAR_STAKING_PARAMS, undefined);

    const networks = state.allStakingNetworks.map(({ network }) => network);
    const stakingParams = await getStakingParams({ networks });

    commit(MutationTypes.UPDATE_STAKING_PARAMS, stakingParams);
  },

  async [ActionTypes.GET_MY_VALIDATORS]({ commit }, { network }) {
    setTimeout(async () => {
      const myValidators = await getMyValidators({ network });

      commit(MutationTypes.UPDATE_MY_VALIDATORS, { network, myValidators });
    }, SEC1 * 5);
  },

  async [ActionTypes.GET_UNLOCKING]({ commit }, { network }) {
    setTimeout(async () => {
      const unlocking = await getUnlocking({ network });

      commit(MutationTypes.UPDATE_UNLOCKING, { network, unlocking });
    }, SEC1 * 5);
  },
};

export default actions;
