import { MetadataRequest } from '@polkadot/extension-base/background/types';
import { State } from './types';
import type { GetterTree } from 'vuex';

export enum GettersTypes {
  getMetaRequest = 'getMetaRequest',
}

export type Getters = {
  [GettersTypes.getMetaRequest](state: State, getters?: GetterTree<State, State> & Getters): MetadataRequest[];
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getMetaRequest](state): MetadataRequest[] {
    return state.requests;
  },
};

export default getters;
