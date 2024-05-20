import type { ActiveTabAuthorizeStatus, ResponseAuthorizeList } from '@extension-base/background/types/types';
import type { MutationTree } from 'vuex';
import type { State } from './state';
import type { Features, ScamAddressList, SetRequestsPayload } from '@/store/extension/types';

export enum MutationTypes {
  SET_AUTHLIST = 'SET_AUTHLIST',
  DELETE_AUTHLIST_ITEM = 'DELETE_AUTHLIST_ITEM',
  DELETE_REQUEST = 'DELETE_REQUEST',
  SET_REQUEST = 'SET_REQUEST',
  SET_TAB_STATUS = 'SET_TAB_STATUS',
  SET_FEATURES = 'SET_FEATURES',
  SET_SCAM = 'SET_SCAM',
  SET_ONBOARDING = 'SET_ONBOARDING',
}

export type Mutations = {
  [MutationTypes.SET_AUTHLIST](state: State, payload: ResponseAuthorizeList): void;
  [MutationTypes.DELETE_AUTHLIST_ITEM](state: State, payload: string): void;
  [MutationTypes.DELETE_REQUEST](
    state: State,
    payload: 'authRequests' | 'metaRequests' | 'signRequests' | 'wcConnectRequests' | 'wcNotSupportedRequests'
  ): void;
  [MutationTypes.SET_REQUEST](state: State, payload: SetRequestsPayload): void;
  [MutationTypes.SET_TAB_STATUS](state: State, payload: ActiveTabAuthorizeStatus): void;
  [MutationTypes.SET_FEATURES](state: State, features: Features): void;
  [MutationTypes.SET_SCAM](state: State, scamAddresses: ScamAddressList): void;
  [MutationTypes.SET_ONBOARDING](state: State, payload: boolean): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.DELETE_REQUEST](state, type) {
    state[type].shift();
  },

  [MutationTypes.SET_REQUEST](state, { type, requests }) {
    if (type === 'authRequests') return (state.authRequests = requests);

    if (type === 'metaRequests') return (state.metaRequests = requests);

    if (type === 'signRequests') return (state.signRequests = requests);

    if (type === 'wcConnectRequests') return (state.wcConnectRequests = requests);

    if (type === 'wcNotSupportedRequests') return (state.wcNotSupportedRequests = requests);

    if (type === 'wcRequests') return (state.wcRequests = requests);

    if (type === 'wcSessions') return (state.wcSessions = requests);
  },

  [MutationTypes.SET_AUTHLIST](state, { list }) {
    state.authList = { ...list };
  },

  [MutationTypes.DELETE_AUTHLIST_ITEM](state, id) {
    delete state.authList[id];
  },

  [MutationTypes.SET_TAB_STATUS](state, payload) {
    state.tabStatus = payload;
  },

  [MutationTypes.SET_FEATURES](state, features) {
    state.features = features;
  },

  [MutationTypes.SET_SCAM](state, scamAddresses) {
    state.scamAddresses = scamAddresses;
  },

  [MutationTypes.SET_ONBOARDING](state, payload) {
    state.onboarding = payload;
  },
};

export default mutations;
