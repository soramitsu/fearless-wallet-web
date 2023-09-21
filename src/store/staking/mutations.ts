import type { MutationTree } from 'vuex';
import type { State } from './state';
import type { SetAllStakingItems } from './types';

export enum MutationTypes {
  UPDATE_STAKING_PARAMS = 'UPDATE_STAKING_PARAMS',
}

export type Mutations = {
  [MutationTypes.UPDATE_STAKING_PARAMS](state: State, props: SetAllStakingItems): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.UPDATE_STAKING_PARAMS](state, stakingParams) {
    stakingParams.forEach((params, index) => {
      const {
        unbondPeriod,
        maxNominations,
        minBond,
        apy,
        bondAmount,
        unbondAmount,
        rebondAmount,
        withdrawUnbondedAmount,
      } = params;

      const newItem = {
        ...state.allStakingNetworks[index],
        unbondPeriod,
        maxNominations,
        minBond,
        apy,
        bondAmount,
        unbondAmount,
        rebondAmount,
        withdrawUnbondedAmount,
      };

      state.allStakingNetworks.splice(index, 1, newItem);
    });
  },
};

export default mutations;
