import { MutationTree } from 'vuex';
import { State } from './state';

export enum MutationTypes {
  SET_PASSWORD = 'SET_PASSWORD',
}

export type Mutations = {
  [MutationTypes.SET_PASSWORD](state: State, { password }: Record<string, string>): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_PASSWORD](state, { password }) {
    state.password = password;
  },
};

export default mutations;
