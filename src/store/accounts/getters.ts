import type AccountController from '@/controllers/accountController';
import type { GetterTree } from 'vuex';
import type { SelectedWallet } from './types';
import type { State } from './state';

export enum GettersTypes {
  getPassword = 'getPassword',
  getSelectedWallet = 'getSelectedWallet',
  getAccountController = 'getAccountController',
}

export type Getters = {
  [GettersTypes.getPassword](state: State, getters?: GetterTree<State, State> & Getters): string;
  [GettersTypes.getSelectedWallet](state: State, getters?: GetterTree<State, State> & Getters): SelectedWallet;
  [GettersTypes.getAccountController](state: State, getters?: GetterTree<State, State> & Getters): AccountController;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getPassword](state): string {
    return state.password;
  },
  [GettersTypes.getSelectedWallet](state): SelectedWallet {
    return state.selectedWallet;
  },
  [GettersTypes.getAccountController](state): AccountController {
    return state.accountController;
  },
};

export default getters;
