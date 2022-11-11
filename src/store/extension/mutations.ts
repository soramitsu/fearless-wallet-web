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
  SET_AUTHLIST = 'SET_AUTHLIST',
  DELETE_AUTHLIST_ITEM = 'DELETE_AUTHLIST_ITEM',
  DELETE_REQUEST = 'DELETE_REQUEST',
  SET_REQUEST = 'SET_REQUEST',
}

interface SetPayload {
  type: keyof State['requests'];
  data: AuthorizeRequest | SigningRequest | MetadataRequest;
}

export type Mutations = {
  [MutationTypes.SET_AUTHLIST](state: State, payload: ResponseAuthorizeList): void;
  [MutationTypes.DELETE_AUTHLIST_ITEM](state: State, payload: string): void;
  [MutationTypes.DELETE_REQUEST](state: State, payload: keyof State['requests']): void;
  [MutationTypes.SET_REQUEST](state: State, payload: SetPayload): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.DELETE_REQUEST](state, type) {
    state.requests[type].shift();
  },
  [MutationTypes.SET_REQUEST](state, { type, data }) {
    if (type === 'auth') {
      state.requests.auth.push(data as AuthorizeRequest);

      return;
    }

    type === 'meta'
      ? state.requests.meta.push(data as MetadataRequest)
      : state.requests.sign.push(data as SigningRequest);
  },

  [MutationTypes.SET_AUTHLIST](state, { list }) {
    Object.keys(list).forEach((key) => {
      state.authList[key] = list[key];
    });
  },

  [MutationTypes.DELETE_AUTHLIST_ITEM](state, id) {
    Vue.delete(state.authList, id);
  },
};

export default mutations;
