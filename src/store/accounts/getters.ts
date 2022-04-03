import { GetterTree } from 'vuex';
import { Accounts, Account } from './types';
import { State } from './state';

export enum GettersTypes {
  getAccounts = 'getAccounts',
  getAccount = 'getAccount',
  getNickname = 'getNickname',
  getPassword = 'getPassword',
}

export type Getters = {
  [GettersTypes.getAccounts](state: State, getters?: any): Accounts;
  [GettersTypes.getAccount](state: State, getters?: any): (address: string) => Account | Record<string, never>;
  [GettersTypes.getNickname](state: State, getters?: any): string;
  [GettersTypes.getPassword](state: State, getters?: any): string;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getAccounts](state): Accounts {
    return state.accounts;
  },
  [GettersTypes.getAccount]: (state) => (address) => {
    return state.accounts.find((wallet) => wallet.address === address) || {};
  },
  [GettersTypes.getNickname](state): string {
    return state.nickname;
  },
  [GettersTypes.getPassword](state): string {
    return state.password;
  },
};

export default getters;
