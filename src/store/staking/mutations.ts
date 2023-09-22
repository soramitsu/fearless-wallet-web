import type { MutationTree } from 'vuex';
import type { State } from './state';
import type { SetAllStakingItems, SetMyValidators } from './types';
import { isSameString } from '@/helpers';

export enum MutationTypes {
  UPDATE_STAKING_PARAMS = 'UPDATE_STAKING_PARAMS',
  UPDATE_MY_VALIDATORS = 'UPDATE_MY_VALIDATORS',
}

export type Mutations = {
  [MutationTypes.UPDATE_STAKING_PARAMS](state: State, props: SetAllStakingItems): void;
  [MutationTypes.UPDATE_MY_VALIDATORS](state: State, props: SetMyValidators): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.UPDATE_STAKING_PARAMS](state, stakingParams) {
    stakingParams.forEach((params, index) => {
      const {
        unbondPeriod,
        maxNominations,
        minBond,
        apy,
        unbondAmount,
        withdrawUnbondedAmount,
        validators,
        myValidators,
      } = params;

      const newItem = {
        ...state.allStakingNetworks[index],
        unbondPeriod,
        maxNominations,
        minBond,
        apy,
        unbondAmount,
        withdrawUnbondedAmount,
        validators,
        myValidators,
      };

      state.allStakingNetworks.splice(index, 1, newItem);
    });
  },

  [MutationTypes.UPDATE_MY_VALIDATORS](state, { network, myValidators }) {
    const index = state.allStakingNetworks.findIndex(({ network: _network }) => isSameString(_network, network));
    const oldItem = state.allStakingNetworks[index];

    state.allStakingNetworks.splice(index, 1, { ...oldItem, myValidators });
  },
};

export default mutations;
