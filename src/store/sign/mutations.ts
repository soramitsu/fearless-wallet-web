import { SigningRequest } from '@extension-base/background/types';
import type { MutationTree } from 'vuex';
import type { State } from './state';

export enum MutationTypes {
  SET_SIGN_REQUEST = 'SET_SIGN_REQUEST',
  DELETE_SIGN_REQUEST = 'DELETE_SIGN_REQUEST',
}
export type Mutations = {
  [MutationTypes.SET_SIGN_REQUEST](state: State, props: SigningRequest): void;
  [MutationTypes.DELETE_SIGN_REQUEST](state: State): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_SIGN_REQUEST](state, payload) {
    state.requests.push(payload);
  },
  [MutationTypes.DELETE_SIGN_REQUEST](state) {
    state.requests.shift();
  },
};

export default mutations;
