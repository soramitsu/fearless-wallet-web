import type {
  AssetJson,
  ActiveNodes,
  FiatJson,
  Networks,
  GetHistory,
  Currencies,
  KeysTokenPricesJson,
} from '@/interfaces';
import type { GetNetwork, GetTokenName, GetTokenPrice } from './types';
import type { GetterTree } from 'vuex';
import type { State } from './state';

export enum GettersTypes {
  getNetworks = 'getNetworks',
  getNetwork = 'getNetwork',
  getAssetsJson = 'getAssetsJson',
  getTokenPrice = 'getTokenPrice',
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
  [GettersTypes.getAssetsJson](state: State, getters?: GetterTree<State, State> & Getters): AssetJson[];
  [GettersTypes.getTokenPrice](
    state: State,
    getters?: GetterTree<State, State> & Getters,
    rootState?: any
  ): GetTokenPrice;
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
      return networks.find(({ name }) => name === networkName)!;
    },
  [GettersTypes.getAssetsJson]({ assetsJson }): AssetJson[] {
    return assetsJson;
  },

  [GettersTypes.getFiats]({ fiats }): FiatJson[] {
    return fiats;
  },

  [GettersTypes.getTokenPrice]:
    ({ tokensPrice }, getters, rootState) =>
    (assetId: string) => {
      const selectedFiat = rootState.account.selectedFiat;
      const hours24ChangeField = `${selectedFiat}_24h_change` as KeysTokenPricesJson;
      const price = tokensPrice[assetId]?.[selectedFiat as KeysTokenPricesJson];
      const hours24Change = tokensPrice[assetId]?.[hours24ChangeField];

      return { price, hours24Change };
    },

  [GettersTypes.getTokenName]:
    ({ assetsJson }) =>
    (assetId: string) => {
      const asset = assetsJson.find(({ id }) => id === assetId);

      if (!asset) return '';

      const { symbol, displayName } = asset;

      return displayName ?? symbol;
    },

  [GettersTypes.getHistory]:
    ({ history }) =>
    (assetId: string, walletAddress: string, networkName: string) => {
      return history[assetId]?.[walletAddress]?.[networkName];
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
