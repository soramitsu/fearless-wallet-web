import { AuthUrlInfo } from '@polkadot/extension-base/background/handlers/State';
import { AuthorizeRequest } from '@polkadot/extension-base/background/types';
import { State } from './types';
import type { GetterTree } from 'vuex';

export enum GettersTypes {
  getAuthRequests = 'getAuthRequests',
  getAuthList = 'getAuthList',
}

export type Getters = {
  [GettersTypes.getAuthRequests](state: State, getters?: GetterTree<State, State> & Getters): AuthorizeRequest[];
  [GettersTypes.getAuthList](state: State, getters?: GetterTree<State, State> & Getters): Record<string, AuthUrlInfo>;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getAuthRequests](state): AuthorizeRequest[] {
    return state.requests;
  },
  [GettersTypes.getAuthList](state): Record<string, AuthUrlInfo> {
    return state.authList;
  },
};

export default getters;
