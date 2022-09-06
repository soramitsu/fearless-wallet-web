import type { AssetJson, FiatJson, Networks } from './types';
import type { Currencies } from '@/interfaces/currencies';
import type { GetterTree } from 'vuex';
import type { History } from '@/interfaces/history';
import type { State } from './state';
import type { ActiveNodes } from '@/store/networks/types';

export enum GettersTypes {
  getNetworks = 'getNetworks',
  getAssets = 'getAssets',
  getFiats = 'getFiats',
  getHistory = 'getHistory',
  getCurrencies = 'getCurrencies',
  getAllNetworksIsLoaded = 'getAllNetworksIsLoaded',
  getActiveNodes = 'getActiveNodes',
}

export type Getters = {
  [GettersTypes.getNetworks](state: State, getters?: GetterTree<State, State> & Getters): Networks;
  [GettersTypes.getAssets](state: State, getters?: GetterTree<State, State> & Getters): AssetJson[];
  [GettersTypes.getFiats](state: State, getters?: GetterTree<State, State> & Getters): FiatJson[];
  [GettersTypes.getHistory](state: State, getters?: GetterTree<State, State> & Getters): History;
  [GettersTypes.getCurrencies](state: State, getters?: GetterTree<State, State> & Getters): Currencies;
  [GettersTypes.getAllNetworksIsLoaded](state: State, getters?: GetterTree<State, State> & Getters): boolean;
  [GettersTypes.getActiveNodes](state: State, getters?: GetterTree<State, State> & Getters): ActiveNodes;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getNetworks]({ networks }): Networks {
    return networks;
  },
  [GettersTypes.getAssets]({ assets }): AssetJson[] {
    return assets;
  },
  [GettersTypes.getFiats]({ fiats }): FiatJson[] {
    return fiats;
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
  [GettersTypes.getActiveNodes](state): ActiveNodes {
    return state.activeNodes;
  },
};

export default getters;
