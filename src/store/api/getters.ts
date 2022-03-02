import { GetterTree } from 'vuex';
import { Networks } from './types';
import { State } from './state';

export enum GettersTypes {
  getNetworksInfo = 'getNetworksInfo',
}

export type Getters = {
  [GettersTypes.getNetworksInfo](state: State, getters?: any): Networks;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getNetworksInfo](state): Networks {
    return state.networks;
  },
};

export default getters;
