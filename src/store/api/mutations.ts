import { MutationTree } from 'vuex';
import { Networks, SetNetworkStatusMutation } from './types';
import { State } from './state';

export enum MutationTypes {
  SET_NETWORKS = 'SET_NETWORKS',
  SET_NETWORK_STATUS = 'SET_NETWORK_STATUS',
}

export type Mutations = {
  [MutationTypes.SET_NETWORKS](state: State, { networks }: Record<string, Networks>): void;
  [MutationTypes.SET_NETWORK_STATUS](state: State, { name, active }: SetNetworkStatusMutation): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_NETWORKS](state, { networks }) {
    state.networks = networks;
  },
  [MutationTypes.SET_NETWORK_STATUS](state, { name, active }) {
    state.networks[name].active = active;
  },
};

export default mutations;
