import { MutationTree } from 'vuex';
import { Networks } from './types';
import { State } from './state';

export enum MutationTypes {
  SET_NETWORKS = 'SET_NETWORKS',
}

export type Mutations = {
  [MutationTypes.SET_NETWORKS](state: State, { networks }: Record<string, Networks>): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_NETWORKS](state, { networks }) {
    state.networks = networks;
  },
};

export default mutations;
