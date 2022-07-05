import type { GetterTree } from 'vuex';
import type { SelectedWallet } from './types';
import type { State } from './state';

export enum GettersTypes {
  getPassword = 'getPassword',
  getSelectedWallet = 'getSelectedWallet',
}

export type Getters = {
  [GettersTypes.getPassword](state: State, getters?: GetterTree<State, State> & Getters): string;
  [GettersTypes.getSelectedWallet](state: State, getters?: GetterTree<State, State> & Getters): SelectedWallet;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getPassword](state): string {
    return state.password;
  },
  [GettersTypes.getSelectedWallet](state): SelectedWallet {
    return state.selectedWallet;
  },
};

export default getters;
