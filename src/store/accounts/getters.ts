import { GetterTree } from 'vuex';
import { Accounts, Account } from './types';
import { State } from './state';

export enum GettersTypes {
  getAccounts = 'getAccounts',
  getAccount = 'getAccount',
  getPassword = 'getPassword',
  getHaveConnectedAccounts = 'getHaveConnectedAccounts',
}

export type Getters = {
  [GettersTypes.getAccounts](state: State, getters?: any): Accounts;
  [GettersTypes.getAccount](state: State, getters?: any): (address: string) => Account | Record<string, never>;
  [GettersTypes.getPassword](state: State, getters?: any): string;
  [GettersTypes.getHaveConnectedAccounts](state: State, getters?: any): boolean;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getAccounts](state): Accounts {
    return state.accounts;
  },
  [GettersTypes.getAccount]: (state) => (address) => {
    return state.accounts.find((wallet) => wallet.address === address) || {};
  },
  [GettersTypes.getPassword](state): string {
    return state.password;
  },
  [GettersTypes.getHaveConnectedAccounts](state): boolean {
    return state.haveConnectedAccounts;
  },
};

export default getters;
