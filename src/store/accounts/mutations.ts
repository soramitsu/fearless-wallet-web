import { MutationTree } from 'vuex';
import { Account } from './types';
import { State } from './state';

export enum MutationTypes {
  SET_ACCOUNT = 'SET_ACCOUNT',
  SET_PASSWORD = 'SET_PASSWORD',
  SET_HAVE_CONNECTED_ACCOUNTS = 'SET_HAVE_CONNECTED_ACCOUNTS',
}

export type Mutations = {
  [MutationTypes.SET_ACCOUNT](state: State, { account }: Record<string, Account>): void;
  [MutationTypes.SET_PASSWORD](state: State, { password }: Record<string, string>): void;
  [MutationTypes.SET_HAVE_CONNECTED_ACCOUNTS](state: State, { value }: Record<string, boolean>): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_ACCOUNT](state, { account }) {
    state.accounts = [...state.accounts, account];
  },
  [MutationTypes.SET_PASSWORD](state, { password }) {
    state.password = password;
  },
  [MutationTypes.SET_HAVE_CONNECTED_ACCOUNTS](state, { value }) {
    state.haveConnectedAccounts = value;
  },
};

export default mutations;
