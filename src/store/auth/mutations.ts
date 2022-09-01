import { AuthorizeRequest, ResponseAuthorizeList } from '@polkadot/extension-base/background/types';
import Vue from 'vue';
import type { MutationTree } from 'vuex';
import type { State } from './types';
type TogglePayload = {
  id: string;
  value: boolean;
};
export enum MutationTypes {
  SET_AUTH_REQUEST = 'SET_AUTH_REQUEST',
  DELETE_AUTH_REQUEST = 'DELETE_AUTH_REQUEST',
  SET_AUTHLIST = 'SET_AUTHLIST',
  DELETE_AUTHLIST_ITEM = 'DELETE_AUTHLIST_ITEM',
  TOGGLE_AUTH_STATE = 'TOGGLE_AUTH_STATE',
}
export type Mutations = {
  [MutationTypes.SET_AUTH_REQUEST](state: State, props: AuthorizeRequest): void;
  [MutationTypes.DELETE_AUTH_REQUEST](state: State): void;
  [MutationTypes.SET_AUTHLIST](state: State, payload: ResponseAuthorizeList): void;
  [MutationTypes.DELETE_AUTHLIST_ITEM](state: State, payload: string): void;
  [MutationTypes.TOGGLE_AUTH_STATE](state: State, payload: TogglePayload): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_AUTH_REQUEST](state, payload) {
    state.requests.push(payload);
  },
  [MutationTypes.DELETE_AUTH_REQUEST](state) {
    state.requests.shift();
  },
  [MutationTypes.SET_AUTHLIST](state, { list }) {
    Object.keys(list).forEach((key) => {
      if (!state.authList[key]) Vue.set(state.authList, key, list[key]);
    });
  },
  [MutationTypes.DELETE_AUTHLIST_ITEM](state, id) {
    Vue.delete(state.authList, id);
  },
  [MutationTypes.TOGGLE_AUTH_STATE](state, { id, value }) {
    state.authList[id].isAllowed = value;
  },
};

export default mutations;
