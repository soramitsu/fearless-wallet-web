import { MetadataRequest } from '@polkadot/extension-base/background/types';
import Vue from 'vue';
import type { MutationTree } from 'vuex';
import type { State } from './types';

export enum MutationTypes {
  SET_METADATA_REQUEST = 'SET_AUTH_REQUEST',
  DELETE_METADATA_REQUEST = 'DELETE_AUTH_REQUEST',
}
export type Mutations = {
  [MutationTypes.SET_METADATA_REQUEST](state: State, props: MetadataRequest): void;
  [MutationTypes.DELETE_METADATA_REQUEST](state: State): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_METADATA_REQUEST](state, payload) {
    state.requests.push(payload);
  },
  [MutationTypes.DELETE_METADATA_REQUEST](state) {
    state.requests.shift();
  },
};

export default mutations;
