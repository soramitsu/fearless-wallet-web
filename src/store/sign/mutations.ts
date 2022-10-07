import { SigningRequest } from '@extension-base/background/types';
import type { MutationTree } from 'vuex';
import type { State } from './state';

export enum MutationTypes {
  SET_SIGN_REQUEST = 'SET_SIGN_REQUEST',
}
export type Mutations = {
  [MutationTypes.SET_SIGN_REQUEST](state: State, props: SigningRequest): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_SIGN_REQUEST](state, payload) {
    state.requests.push(payload);
  },
};

export default mutations;
