import { MutationTree } from 'vuex';
import { SetNetworkStatusProps, SetCurrenciesStatusProps, SetNetworksStatusProps } from './types';
import { State } from './state';
import { getNetworkInfo } from '../helpers';

export enum MutationTypes {
  SET_NETWORKS = 'SET_NETWORKS',
  SET_CURRENCIES = 'SET_CURRENCIES',
  SET_NETWORK_STATUS = 'SET_NETWORK_STATUS',
}

export type Mutations = {
  [MutationTypes.SET_NETWORKS](state: State, { networks }: SetNetworksStatusProps): void;
  [MutationTypes.SET_CURRENCIES](state: State, { walletAddress, currency }: SetCurrenciesStatusProps): void;
  [MutationTypes.SET_NETWORK_STATUS](state: State, { name, isActive }: SetNetworkStatusProps): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_NETWORKS](state, { networks }) {
    state.networks = networks;
  },
  [MutationTypes.SET_CURRENCIES](state, { walletAddress, currency }) {
    const { currencies } = state;
    const addressExists = Object.prototype.hasOwnProperty.call(currencies, walletAddress);
    const newCurrenciesForAddress = addressExists ? [...currencies[walletAddress], currency] : [currency];

    const newCurrencies = {
      ...currencies,
      [walletAddress]: newCurrenciesForAddress,
    };

    state.currencies = newCurrencies;
  },
  [MutationTypes.SET_NETWORK_STATUS]({ networks }, { name, isActive }) {
    const network = getNetworkInfo(networks, name);

    if (network) {
      network.isActive = isActive;
    }
  },
};

export default mutations;
