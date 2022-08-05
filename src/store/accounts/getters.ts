import type { GetterTree } from 'vuex';
import type { SelectedWallet } from './types';
import type { State } from './state';

export enum GettersTypes {
  getSelectedWallet = 'getSelectedWallet',
}

export type Getters = {
  [GettersTypes.getSelectedWallet](state: State, getters?: GetterTree<State, State> & Getters): SelectedWallet;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getSelectedWallet](state): SelectedWallet {
    return state.selectedWallet;
  },
};

export default getters;
