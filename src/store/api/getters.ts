import { GetterTree } from 'vuex';
import { Networks } from './types';
import { State } from './state';

export enum GettersTypes {
  getNetworksInfo = 'getNetworksInfo',
  getActiveNetworks = 'getInActiveNetworks',
  getInactiveNetworks = 'getInactiveNetworks',
}

export type Getters = {
  [GettersTypes.getNetworksInfo](state: State, getters?: any): Networks;
  [GettersTypes.getActiveNetworks](state: State, getters?: any): Networks;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getNetworksInfo](state): Networks {
    return state.networks;
  },
  [GettersTypes.getActiveNetworks]({ networks }): Networks {
    return Object.entries(networks)
      .filter(([, networkInfo]) => networkInfo.active)
      .reduce((accumulator, [netName, networkInfo]) => {
        return {
          ...accumulator,
          [netName]: networkInfo,
        };
      }, {});
  },
  [GettersTypes.getInactiveNetworks]({ networks }): Networks {
    return Object.entries(networks)
      .filter(([, networkInfo]) => !networkInfo.active)
      .reduce((accumulator, [netName, networkInfo]) => {
        return {
          ...accumulator,
          [netName]: networkInfo,
        };
      }, {});
  },
};

export default getters;
