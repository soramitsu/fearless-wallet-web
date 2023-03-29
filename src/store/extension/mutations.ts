import Vue from 'vue';
import type { MutationTree } from 'vuex';
import type { State } from './state';
import {
  ActiveTabAuthorizeStatus,
  AuthorizeRequest,
  MetadataRequest,
  ResponseAuthorizeList,
  SigningRequest,
} from '@/extension/background/extension-base/src/background/types/types';

export enum MutationTypes {
  SET_AUTHLIST = 'SET_AUTHLIST',
  DELETE_AUTHLIST_ITEM = 'DELETE_AUTHLIST_ITEM',
  DELETE_REQUEST = 'DELETE_REQUEST',
  SET_REQUEST = 'SET_REQUEST',
  SET_TABSTATUS = 'SET_TABSTATUS',
}

interface SetPayload {
  type: keyof State['requests'];
  requests: AuthorizeRequest[] | SigningRequest[] | MetadataRequest[];
}

export type Mutations = {
  [MutationTypes.SET_AUTHLIST](state: State, payload: ResponseAuthorizeList): void;
  [MutationTypes.DELETE_AUTHLIST_ITEM](state: State, payload: string): void;
  [MutationTypes.DELETE_REQUEST](state: State, payload: keyof State['requests']): void;
  [MutationTypes.SET_REQUEST](state: State, payload: SetPayload): void;
  [MutationTypes.SET_TABSTATUS](state: State, props: ActiveTabAuthorizeStatus): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.DELETE_REQUEST](state, type) {
    state.requests[type].shift();
  },
  [MutationTypes.SET_REQUEST](state, { type, requests }) {
    if (type === 'auth') {
      state.requests.auth = [...(requests as AuthorizeRequest[])];

      return;
    }

    type === 'meta'
      ? (state.requests.meta = [...(requests as MetadataRequest[])])
      : (state.requests.sign = [...(requests as SigningRequest[])]);
  },

  [MutationTypes.SET_AUTHLIST](state, { list }) {
    Object.keys(list).forEach((key) => {
      state.authList[key] = list[key];
    });
  },

  [MutationTypes.DELETE_AUTHLIST_ITEM](state, id) {
    Vue.delete(state.authList, id);
  },
  [MutationTypes.SET_TABSTATUS](state, payload) {
    state.tabStatus = payload;
  },
};

export default mutations;
