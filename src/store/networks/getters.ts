import { GetterTree } from 'vuex';
import { Networks } from './types';
import { State } from './state';

export enum GettersTypes {
  getNetworksInfo = 'getNetworksInfo',
  getActiveNetworks = 'getInActiveNetworks',
  getInactiveNetworks = 'getInactiveNetworks',
}

export type Getters = {
  [GettersTypes.getNetworksInfo](state: State, getters?: GetterTree<State, State> & Getters): Networks;
  [GettersTypes.getActiveNetworks](state: State, getters?: GetterTree<State, State> & Getters): Networks;
  [GettersTypes.getInactiveNetworks](state: State, getters?: GetterTree<State, State> & Getters): Networks;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getNetworksInfo]({ networks }): Networks {
    return networks;
  },
  [GettersTypes.getActiveNetworks]({ networks }): Networks {
    return networks.filter(({ isActive }) => isActive);
  },
  [GettersTypes.getInactiveNetworks]({ networks }): Networks {
    return networks.filter(({ isActive }) => !isActive);
  },
};

export default getters;
