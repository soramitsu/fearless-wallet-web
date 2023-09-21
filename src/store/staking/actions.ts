import { MutationTypes } from './mutations';
import type { State } from '@/store/staking/state';
import type { ActionTree } from 'vuex';
import type { AugmentedStakingContext } from './types';
import { getStakingParams } from '@/extension/messaging';
import { DAY1 } from '@/consts/time';

export enum ActionTypes {
  GET_STAKING_PARAMS = 'GET_STAKING_PARAMS',
}

export type Actions = {
  [ActionTypes.GET_STAKING_PARAMS](store: AugmentedStakingContext): Promise<void>;
};

const actions: ActionTree<State, State> & Actions = {
  async [ActionTypes.GET_STAKING_PARAMS]({ commit, state }) {
    // Если за текущую сессию уже запрашивали данные и это было меньше суток назад, то не запрашиваем
    if (Date.now() - state.timespan < DAY1) return;

    const networks = state.allStakingNetworks.map(({ network }) => network);
    const stakingParams = await getStakingParams(networks);

    commit(MutationTypes.UPDATE_STAKING_PARAMS, stakingParams);
  },
};

export default actions;
