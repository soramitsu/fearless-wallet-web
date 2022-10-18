import type {
  AssetJson,
  ActiveNodes,
  FiatJson,
  Networks,
  GetHistory,
  Currencies,
  KeysAssetPricesJson,
} from '@/interfaces';
import type { GetNetwork, GetAssetName, GetAssetPrice, GetNetworkGenesisHash } from './types';
import type { GetterTree } from 'vuex';
import type { State } from './state';

export enum GettersTypes {
  getNetworks = 'getNetworks',
  getNetwork = 'getNetwork',
  getNetworkGenesisHash = 'getNetworkGenesisHash',
  getAssetsJson = 'getAssetsJson',
  getAssetPrice = 'getAssetPrice',
  getAssetName = 'getAssetName',
  getFiats = 'getFiats',
  getHistory = 'getHistory',
  getCurrencies = 'getCurrencies',
  getActiveNodes = 'getActiveNodes',
}

export type Getters = {
  [GettersTypes.getNetworks](state: State, getters?: GetterTree<State, State> & Getters): Networks;
  [GettersTypes.getNetwork](state: State, getters?: GetterTree<State, State> & Getters): GetNetwork;
  [GettersTypes.getNetworkGenesisHash](
    state: State,
    getters?: GetterTree<State, State> & Getters
  ): GetNetworkGenesisHash;

  [GettersTypes.getAssetsJson](state: State, getters?: GetterTree<State, State> & Getters): AssetJson[];
  [GettersTypes.getAssetPrice](
    state: State,
    getters?: GetterTree<State, State> & Getters,
    rootState?: any
  ): GetAssetPrice;
  [GettersTypes.getAssetName](state: State, getters?: GetterTree<State, State> & Getters): GetAssetName;
  [GettersTypes.getFiats](state: State, getters?: GetterTree<State, State> & Getters): FiatJson[];
  [GettersTypes.getHistory](state: State, getters?: GetterTree<State, State> & Getters): GetHistory;
  [GettersTypes.getCurrencies](state: State, getters?: GetterTree<State, State> & Getters): Currencies;
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
  [GettersTypes.getNetworkGenesisHash]:
    ({ networks }) =>
    (networkName: string) => {
      const network = networks.find(({ name }) => name === networkName)!;
      console.log(network, networkName, 'network');

      return `0x${network.chainId}`;
    },
  [GettersTypes.getAssetsJson]({ assetsJson }): AssetJson[] {
    return assetsJson;
  },

  [GettersTypes.getFiats]({ fiats }): FiatJson[] {
    return fiats;
  },

  [GettersTypes.getAssetPrice]:
    ({ assetsPrice }, getters, rootState) =>
    (assetId: string) => {
      const selectedFiat = rootState.account.selectedFiat;
      const hours24ChangeField = `${selectedFiat}_24h_change` as KeysAssetPricesJson;
      const price = assetsPrice[assetId]?.[selectedFiat as KeysAssetPricesJson];
      const hours24Change = assetsPrice[assetId]?.[hours24ChangeField];

      return { price, hours24Change };
    },

  [GettersTypes.getAssetName]:
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

  [GettersTypes.getActiveNodes](state): ActiveNodes {
    return state.activeNodes;
  },
};

export default getters;
