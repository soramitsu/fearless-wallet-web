import type { MutationTree } from 'vuex';
import type { State } from './state';

export enum MutationTypes {
  SET_QR = 'SET_QR',
  DELETE_QR = 'DELETE_QR',
}

export type Mutations = {
  [MutationTypes.SET_QR](state: State, props: string): void;
  [MutationTypes.DELETE_QR](state: State): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_QR](state, payload) {
    state.qr = payload;
  },

  [MutationTypes.DELETE_QR](state) {
    state.qr = null;
  },
};

export default mutations;
