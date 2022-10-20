import { AuthorizeRequest, AuthUrlInfo } from '@extension-base/background/types';
import { State } from './state';
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
  [GettersTypes.getAuthRequests]({ requests }): AuthorizeRequest[] {
    return requests;
  },

  [GettersTypes.getAuthList]({ authList }): Record<string, AuthUrlInfo> {
    return authList;
  },
};

export default getters;
