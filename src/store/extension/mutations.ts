import Vue from 'vue';
import type {
  ActiveTabAuthorizeStatus,
  AuthorizeRequest,
  MetadataRequest,
  ResponseAuthorizeList,
} from '@extension-base/background/types/types';
import type { SigningRequest } from '@extension-base/background/types';
import type { MutationTree } from 'vuex';
import type { State } from './state';
import type { Features } from '@/store/extension/types';

export enum MutationTypes {
  SET_AUTHLIST = 'SET_AUTHLIST',
  DELETE_AUTHLIST_ITEM = 'DELETE_AUTHLIST_ITEM',
  DELETE_REQUEST = 'DELETE_REQUEST',
  SET_REQUEST = 'SET_REQUEST',
  SET_TAB_STATUS = 'SET_TAB_STATUS',
  SET_FEATURES = 'SET_FEATURES',
  SET_ONBOARDING = 'SET_ONBOARDING',
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
  [MutationTypes.SET_TAB_STATUS](state: State, payload: ActiveTabAuthorizeStatus): void;
  [MutationTypes.SET_FEATURES](state: State, features: Features): void;
  [MutationTypes.SET_ONBOARDING](state: State, payload: boolean): void;
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

    if (type === 'meta') {
      state.requests.meta = [...(requests as MetadataRequest[])];

      return;
    }

    state.requests.sign = [...(requests as SigningRequest[])];
  },

  [MutationTypes.SET_AUTHLIST](state, { list }) {
    Object.assign(state.authList, list);
  },

  [MutationTypes.DELETE_AUTHLIST_ITEM](state, id) {
    Vue.delete(state.authList, id);
  },

  [MutationTypes.SET_TAB_STATUS](state, payload) {
    state.tabStatus = payload;
  },

  [MutationTypes.SET_FEATURES](state, features) {
    state.features = features;
  },

  [MutationTypes.SET_ONBOARDING](state, payload) {
    state.onboarding = payload;
  },
};

export default mutations;
