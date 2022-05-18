import { MutationTree } from 'vuex';
import { Networks, SetNetworkStatusProps, SetNetworkBalancesProps } from './types';
import { State } from './state';

export enum MutationTypes {
  SET_NETWORKS = 'SET_NETWORKS',
  SET_NETWORK_STATUS = 'SET_NETWORK_STATUS',
  SET_NETWORK_BALANCES = 'SET_NETWORK_BALANCES',
}

export type Mutations = {
  [MutationTypes.SET_NETWORKS](state: State, { networks }: Record<string, Networks>): void;
  [MutationTypes.SET_NETWORK_STATUS](state: State, { name, isActive }: SetNetworkStatusProps): void;
  [MutationTypes.SET_NETWORK_BALANCES](state: State, { name, balances }: SetNetworkBalancesProps): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_NETWORKS](state, { networks }) {
    state.networks = networks;
  },
  [MutationTypes.SET_NETWORK_STATUS](state, { name, isActive }) {
    const network = searchNetwork(state, name);

    if (network) {
      network.isActive = isActive;
    }
  },
  [MutationTypes.SET_NETWORK_BALANCES](state, { name, balances }) {
    const network = searchNetwork(state, name);

    if (network) {
      network.balances = balances;
    }
  },
};

export function searchNetwork({ networks }: State, networksName: string) {
  return networks.find(({ name }) => name === networksName);
}

export default mutations;
