import type { MutationTree } from 'vuex';
import type { State } from './state';

export enum MutationTypes {
  SET_AUTH_LOGIN = 'SET_NETWORKS',
}

export type Mutations = {
  [MutationTypes.SET_AUTH_LOGIN](state: State, authLogin: any): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_AUTH_LOGIN](state, authLogin) {
    state.authLogin = authLogin;
  },
};

export default mutations;
