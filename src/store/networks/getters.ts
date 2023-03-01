import type { AssetJson, FiatJson, Networks, GetHistory, Currencies, KeysAssetPricesJson } from '@/interfaces';
import type {
  GetNetwork,
  GetAssetName,
  GetAssetPrice,
  GetNetworkGenesisHash,
  GetNetworkStatus,
  GetActiveNodesByNetwork,
  GetAssetIcon,
} from './types';
import type { GetterTree } from 'vuex';
import type { State } from './state';
import { ETHEREUM_NETWORKS } from '@/consts/networks';

export enum GettersTypes {
  getNetworks = 'getNetworks',
  getBalance = 'getBalance',
  getAllNetworks = 'getAllNetworks',
  getNetwork = 'getNetwork',
  getNetworkGenesisHash = 'getNetworkGenesisHash',
  getAssetsJson = 'getAssetsJson',
  getAssetPrice = 'getAssetPrice',
  getAssetName = 'getAssetName',
  getAssetIcon = 'getAssetIcon',
  getFiats = 'getFiats',
  getHistory = 'getHistory',
  getCurrencies = 'getCurrencies',
  getActiveNodesByNetwork = 'getActiveNodesByNetwork',
  getAllNetworksIsReadyToUse = 'getAllNetworksIsReadyToUse',
  getNetworkStatus = 'getNetworkStatus',
  getAssetsPriceInterval = 'getAssetsPriceInterval',
}

export type Getters = {
  [GettersTypes.getNetworks](state: State, getters?: GetterTree<State, State> & Getters, rootState?: any): Networks;
  [GettersTypes.getAllNetworks](state: State, getters?: GetterTree<State, State> & Getters, rootState?: any): Networks;
  [GettersTypes.getNetwork](state: State, getters?: GetterTree<State, State> & Getters): GetNetwork;
  [GettersTypes.getAssetsJson](state: State, getters?: GetterTree<State, State> & Getters): AssetJson[];
  [GettersTypes.getAssetName](state: State, getters?: GetterTree<State, State> & Getters): GetAssetName;
  [GettersTypes.getAssetIcon](state: State, getters?: GetterTree<State, State> & Getters): GetAssetIcon;
  [GettersTypes.getFiats](state: State, getters?: GetterTree<State, State> & Getters): FiatJson[];
  [GettersTypes.getHistory](state: State, getters?: GetterTree<State, State> & Getters): GetHistory;
  [GettersTypes.getCurrencies](state: State, getters?: GetterTree<State, State> & Getters): Currencies;
  [GettersTypes.getAssetsPriceInterval](
    state: State,
    getters?: GetterTree<State, State> & Getters
  ): NodeJS.Timer | null;
  [GettersTypes.getActiveNodesByNetwork](
    state: State,
    getters?: GetterTree<State, State> & Getters
  ): GetActiveNodesByNetwork;
  [GettersTypes.getAllNetworksIsReadyToUse](state: State, getters?: GetterTree<State, State> & Getters): boolean;
  [GettersTypes.getNetworkStatus](state: State, getters?: GetterTree<State, State> & Getters): GetNetworkStatus;
  [GettersTypes.getNetworkGenesisHash](
    state: State,
    getters?: GetterTree<State, State> & Getters
  ): GetNetworkGenesisHash;

  [GettersTypes.getAssetPrice](
    state: State,
    getters?: GetterTree<State, State> & Getters,
    rootState?: any
  ): GetAssetPrice;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getNetworks]({ networks }, getters, rootState): Networks {
    const haveEthereumAccount = rootState.account.selectedWallet.ethereumAddress !== '';

    return haveEthereumAccount ? networks : networks.filter(({ name }) => !ETHEREUM_NETWORKS.includes(name));
  },

  [GettersTypes.getAllNetworks]({ networks }): Networks {
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

  [GettersTypes.getAssetIcon]:
    ({ assetsJson }) =>
    (assetId: string) => {
      const asset = assetsJson.find(({ id }) => id === assetId);

      if (!asset) return '';

      return asset.icon;
    },

  [GettersTypes.getHistory]:
    ({ history }) =>
    (assetId: string, walletAddress: string, networkName: string) => {
      return history[assetId]?.[walletAddress]?.[networkName];
    },

  [GettersTypes.getCurrencies]({ currencies }): Currencies {
    return currencies;
  },

  [GettersTypes.getAssetsPriceInterval]({ assetsPriceInterval }): NodeJS.Timer | null {
    return assetsPriceInterval;
  },

  [GettersTypes.getActiveNodesByNetwork]:
    ({ activeNodes }) =>
    (networkName: string) => {
      return activeNodes[networkName] ?? { name: '', url: '' };
    },

  [GettersTypes.getAllNetworksIsReadyToUse]({ networks }): boolean {
    return !networks.some(({ status }) => status === 'pending' || status === 'connected');
  },

  [GettersTypes.getNetworkStatus]:
    ({ networks }) =>
    (networkName: string) => {
      const network = networks.find(({ name }) => name === networkName);

      return network?.status ?? 'pending';
    },
};

export default getters;
