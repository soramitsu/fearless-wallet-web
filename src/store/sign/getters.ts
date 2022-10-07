import { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';

import { SigningRequest } from '@extension-base/background/types';
import { State } from './state';
import type { GetterTree } from 'vuex';
export enum GettersTypes {
  getSignRequestPayload = 'getSignRequestPayload',
  getSignRequest = 'getSignRequest',
  getSignList = 'getSignList',
}

export type Getters = {
  [GettersTypes.getSignRequestPayload](
    state: State,
    getters?: GetterTree<State, State> & Getters
  ): SignerPayloadJSON | SignerPayloadRaw;
  [GettersTypes.getSignRequest](state: State, getters?: GetterTree<State, State> & Getters): SigningRequest;
  [GettersTypes.getSignList](state: State, getters?: GetterTree<State, State> & Getters): SigningRequest[];
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getSignRequestPayload](state): SignerPayloadJSON | SignerPayloadRaw {
    const [request] = state.requests;
    const {
      request: { payload },
    } = request;

    return payload;
  },

  [GettersTypes.getSignRequest](state): SigningRequest {
    const [request] = state.requests;

    return request;
  },
  [GettersTypes.getSignList](state): SigningRequest[] {
    return state.requests;
  },
};

export default getters;
