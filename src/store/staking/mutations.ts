import type { MutationTree } from 'vuex';
import type { State } from './state';
import type { SetAllStakingItems, SetMyValidators, SetUnlocking } from './types';
import { isSameString } from '@/helpers';
import { getDefaultStakingParams } from '@/helpers/staking';

export enum MutationTypes {
  UPDATE_STAKING_PARAMS = 'UPDATE_STAKING_PARAMS',
  CLEAR_STAKING_PARAMS = 'CLEAR_STAKING_PARAMS',
  UPDATE_MY_VALIDATORS = 'UPDATE_MY_VALIDATORS',
  UPDATE_UNLOCKING = 'UPDATE_UNLOCKING',
}

export type Mutations = {
  [MutationTypes.UPDATE_STAKING_PARAMS](state: State, props: SetAllStakingItems): void;
  [MutationTypes.CLEAR_STAKING_PARAMS](state: State): void;
  [MutationTypes.UPDATE_MY_VALIDATORS](state: State, props: SetMyValidators): void;
  [MutationTypes.UPDATE_UNLOCKING](state: State, props: SetUnlocking): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.UPDATE_STAKING_PARAMS](state, stakingParams) {
    stakingParams.forEach((params, index) => {
      const { unbondPeriod, maxNominations, minBond, apy, unbond, redeemAmount, validators, myValidators, payee } =
        params;

      const newItem = {
        ...state.allStakingNetworks[index],
        unbondPeriod,
        maxNominations,
        minBond,
        apy,
        unbond,
        redeemAmount,
        validators,
        myValidators,
        payee,
        loading: false,
      };

      state.allStakingNetworks.splice(index, 1, newItem);
    });
  },

  [MutationTypes.CLEAR_STAKING_PARAMS](state) {
    state.allStakingNetworks.forEach((item, index) => {
      state.allStakingNetworks.splice(index, 1, {
        ...item,
        loading: true,
      });
    });

    return;
  },

  [MutationTypes.UPDATE_MY_VALIDATORS](state, { network, myValidators }) {
    const index = state.allStakingNetworks.findIndex(({ network: _network }) => isSameString(_network, network));
    const oldItem = state.allStakingNetworks[index];

    state.allStakingNetworks.splice(index, 1, { ...oldItem, myValidators });
  },

  [MutationTypes.UPDATE_UNLOCKING](state, { network, unlocking: { redeem, unbond } }) {
    const index = state.allStakingNetworks.findIndex(({ network: _network }) => isSameString(_network, network));
    const oldItem = state.allStakingNetworks[index];

    state.allStakingNetworks.splice(index, 1, { ...oldItem, unbond, redeemAmount: redeem });
  },
};

export default mutations;
