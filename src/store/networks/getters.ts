import type { AssetJson } from '@/interfaces/assets';
import type { ActiveNodes } from '@/interfaces/nodes';
import type { FiatJson } from '@/interfaces/common';
import type { GetNetwork, GetTokenName } from './types';
import type { Networks } from '@/interfaces/networks';
import type { GetHistory } from '@/interfaces/history';
import type { Currencies } from '@/interfaces/currencies';
import type { GetterTree } from 'vuex';
import type { State } from './state';

export enum GettersTypes {
  getNetworks = 'getNetworks',
  getNetwork = 'getNetwork',
  getAssets = 'getAssets',
  getTokenName = 'getTokenName',
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
  [GettersTypes.getTokenName](state: State, getters?: GetterTree<State, State> & Getters): GetTokenName;
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
  [GettersTypes.getTokenName]:
    ({ assets }) =>
    (tokenId: string) => {
      return assets.find(({ id }) => id === tokenId)?.symbol ?? '';
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
