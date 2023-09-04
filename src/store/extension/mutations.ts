import Vue from 'vue';
import { SessionTypes } from '@walletconnect/types';
import {
  WalletConnectSessionRequest,
  WalletConnectTransactionRequest,
} from '@extension-base/services/wallet-connect-service/types';
import type {
  ActiveTabAuthorizeStatus,
  AuthorizeRequest,
  MetadataRequest,
  ResponseAuthorizeList,
} from '@/extension/background/extension-base/src/background/types';
import type { SigningRequest } from '@extension-base/background/types/types';
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
  type: 'auth' | 'meta' | 'sign' | 'wcConnectRequests' | 'wcRequests' | 'wcSessions';
  requests:
    | AuthorizeRequest[]
    | SigningRequest[]
    | MetadataRequest[]
    | WalletConnectSessionRequest[]
    | WalletConnectTransactionRequest[]
    | SessionTypes.Struct[]
    | null;
}

export type Mutations = {
  [MutationTypes.SET_AUTHLIST](state: State, payload: ResponseAuthorizeList): void;
  [MutationTypes.DELETE_AUTHLIST_ITEM](state: State, payload: string): void;
  [MutationTypes.DELETE_REQUEST](
    state: State,
    payload: 'authRequests' | 'metaRequests' | 'signRequests' | 'wcConnectRequests'
  ): void;
  [MutationTypes.SET_REQUEST](state: State, payload: SetPayload): void;
  [MutationTypes.SET_TAB_STATUS](state: State, payload: ActiveTabAuthorizeStatus): void;
  [MutationTypes.SET_FEATURES](state: State, features: Features): void;
  [MutationTypes.SET_ONBOARDING](state: State, payload: boolean): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.DELETE_REQUEST](state, type) {
    state[type].shift();
  },

  [MutationTypes.SET_REQUEST](state, { type, requests }) {
    if (type === 'auth') {
      state.authRequests = [...(requests as AuthorizeRequest[])];

      return;
    }

    if (type === 'meta') {
      state.metaRequests = [...(requests as MetadataRequest[])];

      return;
    }

    if (type === 'wcConnectRequests') {
      state.wcConnectRequests = [...(requests as unknown as WalletConnectSessionRequest[])];

      return;
    }

    if (type === 'wcRequests') {
      state.wcRequests = [...(requests as unknown as WalletConnectTransactionRequest[])];

      return;
    }

    if (type === 'wcSessions') {
      if (requests !== null) {
        state.wcSessions = [...(requests as SessionTypes.Struct[])];

        return;
      }

      state.wcSessions = requests;

      return;
    }

    state.signRequests = [...(requests as SigningRequest[])];
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
