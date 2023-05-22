import { State } from './state';
import type { GetterTree } from 'vuex';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import {
  ActiveTabAuthorizeStatus,
  AuthorizeRequest,
  AuthUrlInfo,
  MetadataRequest,
  SigningRequest,
} from '@/extension/background/extension-base/src/background/types/types';

export enum GettersTypes {
  authRequests = 'authRequests',
  authList = 'authList',
  metaRequests = 'metaRequests',
  signRequestPayload = 'signRequestPayload',
  signList = 'signList',
  tabStatus = 'tabStatus',
}

export type Getters = {
  [GettersTypes.authRequests](state: State, getters?: GetterTree<State, State> & Getters): AuthorizeRequest[];
  [GettersTypes.authList](state: State, getters?: GetterTree<State, State> & Getters): Record<string, AuthUrlInfo>;
  [GettersTypes.tabStatus](state: State, getters?: GetterTree<State, State> & Getters): ActiveTabAuthorizeStatus | null;
  [GettersTypes.metaRequests](state: State, getters?: GetterTree<State, State> & Getters): MetadataRequest[];
  [GettersTypes.signRequestPayload](
    state: State,
    getters?: GetterTree<State, State> & Getters
  ): SignerPayloadJSON | SignerPayloadRaw;
  [GettersTypes.signList](state: State, getters?: GetterTree<State, State> & Getters): SigningRequest[];
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.authRequests]({ requests }): AuthorizeRequest[] {
    return requests.auth;
  },

  [GettersTypes.authList]({ authList }): Record<string, AuthUrlInfo> {
    return authList;
  },

  [GettersTypes.metaRequests](state): MetadataRequest[] {
    return state.requests.meta;
  },

  [GettersTypes.signRequestPayload](state): SignerPayloadJSON | SignerPayloadRaw {
    const [
      {
        request: { payload },
      },
    ] = state.requests.sign;

    return payload;
  },

  [GettersTypes.signList](state): SigningRequest[] {
    return state.requests.sign;
  },

  [GettersTypes.tabStatus]({ tabStatus }): ActiveTabAuthorizeStatus | null {
    return tabStatus;
  },
};

export default getters;
