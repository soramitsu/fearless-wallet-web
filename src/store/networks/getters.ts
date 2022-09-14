import type { ActiveNodes, GetNetwork, AssetJson, FiatJson, Networks } from './types';
import type { GetHistory } from '@/interfaces/history';
import type { Currencies } from '@/interfaces/currencies';
import type { GetterTree } from 'vuex';
import type { State } from './state';

export enum GettersTypes {
  getNetworks = 'getNetworks',
  getNetwork = 'getNetwork',
  getAssets = 'getAssets',
  getFiats = 'getFiats',
  getHistory = 'getHistory',
  getCurrencies = 'getCurrencies',
  getAllNetworksIsLoaded = 'getAllNetworksIsLoaded',
  getActiveNodes = 'getActiveNodes',
}

export type Getters = {
  [GettersTypes.getNetworks](state: State, getters?: GetterTree<State, State> & Getters): Networks;
  [GettersTypes.getNetwork](state: State, getters?: GetterTree<State, State> & Getters): GetNetwork;
  [GettersTypes.getAssets](state: State, getters?: GetterTree<State, State> & Getters): AssetJson[];
  [GettersTypes.getFiats](state: State, getters?: GetterTree<State, State> & Getters): FiatJson[];
  [GettersTypes.getHistory](state: State, getters?: GetterTree<State, State> & Getters): GetHistory;
  [GettersTypes.getCurrencies](state: State, getters?: GetterTree<State, State> & Getters): Currencies;
  [GettersTypes.getAllNetworksIsLoaded](state: State, getters?: GetterTree<State, State> & Getters): boolean;
  [GettersTypes.getActiveNodes](state: State, getters?: GetterTree<State, State> & Getters): ActiveNodes;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getNetworks]({ networks }): Networks {
    return networks;
  },
  [GettersTypes.getNetwork]:
    ({ networks }) =>
    (networkName: string) => {
      return networks.find(({ name }) => name === networkName)!; // eslint-disable-line
    },
  [GettersTypes.getAssets]({ assets }): AssetJson[] {
    return assets;
  },
  [GettersTypes.getFiats]({ fiats }): FiatJson[] {
    return fiats;
  },
  [GettersTypes.getHistory]:
    ({ history }) =>
    (networkName: string) => {
      return history[networkName];
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
