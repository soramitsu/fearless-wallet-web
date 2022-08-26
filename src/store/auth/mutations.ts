import type { MutationTree } from 'vuex';
import type { State } from './types';
import { AuthorizeRequest, ResponseAuthorizeList } from '@polkadot/extension-base/background/types';

export enum MutationTypes {
  SET_AUTH_REQUEST = 'SET_AUTH_REQUEST',
  DELETE_AUTH_REQUEST = 'DELETE_AUTH_REQUEST',
  SET_AUTHLIST = 'SET_AUTHLIST',
  DELETE_AUTHLIST_ITEM = 'DELETE_AUTHLIST_ITEM',
}
export type Mutations = {
  [MutationTypes.SET_AUTH_REQUEST](state: State, props: AuthorizeRequest): void;
  [MutationTypes.DELETE_AUTH_REQUEST](state: State): void;
  [MutationTypes.SET_AUTHLIST](state: State, payload: ResponseAuthorizeList): void;
  [MutationTypes.DELETE_AUTHLIST_ITEM](state: State, payload: string): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_AUTH_REQUEST](state, payload) {
    state.requests.push(payload);
  },
  [MutationTypes.DELETE_AUTH_REQUEST](state) {
    const [, ...requests] = state.requests;
    state.requests = requests;
  },
  [MutationTypes.SET_AUTHLIST](state, { list }) {
    state.authList = list;
  },
  [MutationTypes.DELETE_AUTHLIST_ITEM](state, id) {
    delete state.authList[id];
  },
};

export default mutations;
