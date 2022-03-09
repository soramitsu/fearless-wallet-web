import { GetterTree } from 'vuex';
import { Account } from './types';
import { State } from './state';

export enum GettersTypes {
  getAccount = 'getAccount',
  getNickname = 'getNickname',
}

export type Getters = {
  [GettersTypes.getAccount](state: State, getters?: any): Account;
  [GettersTypes.getNickname](state: State, getters?: any): string;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getAccount](state): Account {
    return state.account;
  },
  [GettersTypes.getNickname](state): string {
    return state.nickname;
  },
};

export default getters;
