import { GetterTree } from 'vuex';
import { Networks, AssetsJson } from './types';
import { Currencies } from '@/interfaces/currencies';
import { State } from './state';

export enum GettersTypes {
  getNetworksInfo = 'getNetworksInfo',
  getAssetsInfo = 'getAssetsInfo',
  getCurrencies = 'getCurrencies',
  getAllNetworksIsLoaded = 'getAllNetworksIsLoaded',
}

export type Getters = {
  [GettersTypes.getNetworksInfo](state: State, getters?: GetterTree<State, State> & Getters): Networks;
  [GettersTypes.getAssetsInfo](state: State, getters?: GetterTree<State, State> & Getters): AssetsJson[];
  [GettersTypes.getCurrencies](state: State, getters?: GetterTree<State, State> & Getters): Currencies;
  [GettersTypes.getAllNetworksIsLoaded](state: State, getters?: GetterTree<State, State> & Getters): boolean;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getNetworksInfo]({ networks }): Networks {
    return networks;
  },
  getAssetsInfo({ assets }): AssetsJson[] {
    return assets;
  },
  [GettersTypes.getCurrencies]({ currencies }): Currencies {
    return currencies;
  },
  [GettersTypes.getAllNetworksIsLoaded](state): boolean {
    return state.allNetworksIsLoaded;
  },
};

export default getters;
