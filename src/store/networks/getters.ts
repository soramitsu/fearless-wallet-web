import { GetterTree } from 'vuex';
import { Networks, AssetsJson } from './types';
import { Currencies } from '@/interfaces/currencies';
import { State } from './state';

export enum GettersTypes {
  getNetworksInfo = 'getNetworksInfo',
  getAssetsInfo = 'getAssetsInfo',
  getCurrenciesInfo = 'getCurrenciesInfo',
}

export type Getters = {
  [GettersTypes.getNetworksInfo](state: State, getters?: GetterTree<State, State> & Getters): Networks;
  [GettersTypes.getAssetsInfo](state: State, getters?: GetterTree<State, State> & Getters): AssetsJson[];
  [GettersTypes.getCurrenciesInfo](state: State, getters?: GetterTree<State, State> & Getters): Currencies;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getNetworksInfo]({ networks }): Networks {
    return networks;
  },
  getAssetsInfo({ assets }): AssetsJson[] {
    return assets;
  },
  [GettersTypes.getCurrenciesInfo]({ currencies }): Currencies {
    return currencies;
  },
};

export default getters;
