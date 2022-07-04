import type { AssetsJson, Networks } from './types';
import type { Currencies } from '@/interfaces/currencies';
import type { GetterTree } from 'vuex';
import type { History } from '@/interfaces/history';
import type { State } from './state';

export enum GettersTypes {
  getNetworks = 'getNetworks',
  getAssetsInfo = 'getAssetsInfo',
  getHistory = 'getHistory',
  getCurrencies = 'getCurrencies',
  getAllNetworksIsLoaded = 'getAllNetworksIsLoaded',
}

export type Getters = {
  [GettersTypes.getNetworks](state: State, getters?: GetterTree<State, State> & Getters): Networks;
  [GettersTypes.getAssetsInfo](state: State, getters?: GetterTree<State, State> & Getters): AssetsJson[];
  [GettersTypes.getHistory](state: State, getters?: GetterTree<State, State> & Getters): History;
  [GettersTypes.getCurrencies](state: State, getters?: GetterTree<State, State> & Getters): Currencies;
  [GettersTypes.getAllNetworksIsLoaded](state: State, getters?: GetterTree<State, State> & Getters): boolean;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getNetworks]({ networks }): Networks {
    return networks;
  },
  [GettersTypes.getAssetsInfo]({ assets }): AssetsJson[] {
    return assets;
  },
  [GettersTypes.getHistory]({ history }): History {
    return history;
  },
  [GettersTypes.getCurrencies]({ currencies }): Currencies {
    return currencies;
  },
  [GettersTypes.getAllNetworksIsLoaded](state): boolean {
    return state.allNetworksIsLoaded;
  },
};

export default getters;
