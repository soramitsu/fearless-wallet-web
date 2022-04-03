import { MutationTree } from 'vuex';
import { Account } from './types';
import { State } from './state';

export enum MutationTypes {
  SET_ACCOUNT = 'SET_ACCOUNT',
  SET_NICKNAME = 'SET_NICKNAME',
  SET_PASSWORD = 'SET_PASSWORD',
}

export type Mutations = {
  [MutationTypes.SET_ACCOUNT](state: State, { account }: Record<string, Account>): void;
  [MutationTypes.SET_NICKNAME](state: State, { nickname }: Record<string, string>): void;
  [MutationTypes.SET_PASSWORD](state: State, { password }: Record<string, string>): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_ACCOUNT](state, { account }) {
    state.accounts = [...state.accounts, account];
  },
  [MutationTypes.SET_NICKNAME](state, { nickname }) {
    state.nickname = nickname;
  },
  [MutationTypes.SET_PASSWORD](state, { password }) {
    state.password = password;
  },
};

export default mutations;
