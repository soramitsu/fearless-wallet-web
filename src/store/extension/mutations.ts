import {
  AuthorizeRequest,
  MetadataRequest,
  ResponseAuthorizeList,
  SigningRequest,
} from '@extension-base/background/types';
import Vue from 'vue';
import type { MutationTree } from 'vuex';
import type { State } from './state';

export enum MutationTypes {
  SET_AUTH_REQUEST = 'SET_AUTH_REQUEST',
  SET_AUTHLIST = 'SET_AUTHLIST',
  DELETE_AUTHLIST_ITEM = 'DELETE_AUTHLIST_ITEM',
  DELETE_REQUEST = 'DELETE_REQUEST',
  SET_METADATA_REQUEST = 'SET_METADATA_REQUEST',
  SET_SIGN_REQUEST = 'SET_SIGN_REQUEST',
}

export type Mutations = {
  [MutationTypes.SET_AUTH_REQUEST](state: State, props: AuthorizeRequest): void;
  [MutationTypes.SET_AUTHLIST](state: State, payload: ResponseAuthorizeList): void;
  [MutationTypes.DELETE_AUTHLIST_ITEM](state: State, payload: string): void;
  [MutationTypes.DELETE_REQUEST](state: State, payload: keyof State['requests']): void;
  [MutationTypes.SET_METADATA_REQUEST](state: State, props: MetadataRequest): void;
  [MutationTypes.SET_SIGN_REQUEST](state: State, props: SigningRequest): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_AUTH_REQUEST](state, payload) {
    state.requests.auth.push(payload);
  },

  [MutationTypes.DELETE_REQUEST](state, type) {
    state.requests[type].shift();
  },

  [MutationTypes.SET_AUTHLIST](state, { list }) {
    Object.keys(list).forEach((key) => {
      state.authList[key] = list[key];
    });
  },

  [MutationTypes.DELETE_AUTHLIST_ITEM](state, id) {
    Vue.delete(state.authList, id);
  },

  [MutationTypes.SET_METADATA_REQUEST](state, payload) {
    state.requests.meta.push(payload);
  },

  [MutationTypes.SET_SIGN_REQUEST](state, payload) {
    state.requests.sign.push(payload);
  },
};

export default mutations;
