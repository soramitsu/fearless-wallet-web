import {
  ActiveTabAuthorizeStatus,
  AuthorizeRequest,
  AuthUrlInfo,
  MetadataRequest,
  SigningRequest,
} from '@extension-base/background/types';
import { State } from './state';
import type { GetterTree } from 'vuex';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';

export enum GettersTypes {
  getAuthRequests = 'getAuthRequests',
  getAuthList = 'getAuthList',

  getMetaRequests = 'getMetaRequests',

  getSignRequestPayload = 'getSignRequestPayload',
  getSignRequest = 'getSignRequest',
  getSignList = 'getSignList',

  getTabStatus = 'getTabStatus',
}

export type Getters = {
  [GettersTypes.getAuthRequests](state: State, getters?: GetterTree<State, State> & Getters): AuthorizeRequest[];
  [GettersTypes.getAuthList](state: State, getters?: GetterTree<State, State> & Getters): Record<string, AuthUrlInfo>;
  [GettersTypes.getTabStatus](
    state: State,
    getters?: GetterTree<State, State> & Getters
  ): ActiveTabAuthorizeStatus | null;
  [GettersTypes.getMetaRequests](state: State, getters?: GetterTree<State, State> & Getters): MetadataRequest[];
  [GettersTypes.getSignRequestPayload](
    state: State,
    getters?: GetterTree<State, State> & Getters
  ): SignerPayloadJSON | SignerPayloadRaw;
  [GettersTypes.getSignRequest](state: State, getters?: GetterTree<State, State> & Getters): SigningRequest;
  [GettersTypes.getSignList](state: State, getters?: GetterTree<State, State> & Getters): SigningRequest[];
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getAuthRequests]({ requests }): AuthorizeRequest[] {
    return requests.auth;
  },

  [GettersTypes.getAuthList]({ authList }): Record<string, AuthUrlInfo> {
    return authList;
  },

  [GettersTypes.getMetaRequests](state): MetadataRequest[] {
    return state.requests.meta;
  },

  [GettersTypes.getSignRequestPayload](state): SignerPayloadJSON | SignerPayloadRaw {
    const [
      {
        request: { payload },
      },
    ] = state.requests.sign;

    return payload;
  },

  [GettersTypes.getSignRequest](state): SigningRequest {
    return state.requests.sign[0];
  },

  [GettersTypes.getSignList](state): SigningRequest[] {
    return state.requests.sign;
  },
  [GettersTypes.getTabStatus]({ tabStatus }): ActiveTabAuthorizeStatus | null {
    return tabStatus;
  },
};

export default getters;
