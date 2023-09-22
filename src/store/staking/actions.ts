import { MutationTypes } from './mutations';
import type { State } from '@/store/staking/state';
import type { ActionTree } from 'vuex';
import type { AugmentedStakingContext, GetMyValidatorsProps } from './types';
import { getMyValidators, getStakingParams } from '@/extension/messaging';
import { SEC1 } from '@/consts/time';

export enum ActionTypes {
  GET_STAKING_PARAMS = 'GET_STAKING_PARAMS',
  GET_MY_VALIDATORS = 'GET_MY_VALIDATORS',
}

export type Actions = {
  [ActionTypes.GET_STAKING_PARAMS](store: AugmentedStakingContext): Promise<void>;
  [ActionTypes.GET_MY_VALIDATORS](store: AugmentedStakingContext, props: GetMyValidatorsProps): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.GET_STAKING_PARAMS]({ commit, state }) {
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
};

export default actions;
