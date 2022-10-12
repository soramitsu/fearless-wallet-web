import { MetadataRequest } from '@extension-base/background/types';
import type { GetterTree } from 'vuex';
import { State } from '@/store/metadata/state';

export enum GettersTypes {
  getMetaRequests = 'getMetaRequests',
}

export type Getters = {
  [GettersTypes.getMetaRequests](state: State, getters?: GetterTree<State, State> & Getters): MetadataRequest[];
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getMetaRequests](state): MetadataRequest[] {
    return state.requests;
  },
};

export default getters;
