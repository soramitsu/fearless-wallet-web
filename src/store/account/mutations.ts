import { MutationTree } from 'vuex';
import { Account } from './types';
import { State } from './state';

export enum MutationTypes {
  SET_ACCOUNT = 'SET_ACCOUNT',
  SET_NICKNAME = 'SET_NICKNAME',
}

export type Mutations = {
  [MutationTypes.SET_ACCOUNT](state: State, { account }: Record<string, Account>): void;
  [MutationTypes.SET_NICKNAME](state: State, { nickname }: Record<string, string>): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_ACCOUNT](state, { account }) {
    state.account = account;
  },
  [MutationTypes.SET_NICKNAME](state, { nickname }) {
    state.nickname = nickname;
  },
};

export default mutations;
