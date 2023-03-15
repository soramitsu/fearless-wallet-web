import type { AssetsPrice, FiatJson, GetHistory } from '@/interfaces';
import type { GetNetwork, GetAssetPrice, GetNetworkGenesisHash, GetNetworkStatus } from './types';
import type { GetterTree } from 'vuex';
import type { State } from './state';
import { ETHEREUM_NETWORKS } from '@/consts/networks';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types';
import { NetworkJsonOld } from '@/extension/background/extension-base/src/types';
import { NETWORK_STATUS } from '@/extension/background/extension-base/src/api/evm/types/ether';

export enum GettersTypes {
  getNetworks = 'getNetworks',
  getBalance = 'getBalance',
  getAllNetworks = 'getAllNetworks',
  getNetwork = 'getNetwork',
  getNetworkGenesisHash = 'getNetworkGenesisHash',
  getAssetsJson = 'getAssetsJson',
  getPrice = 'getPrice',
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
  [GettersTypes.getNetworks](
    state: State,
    getters?: GetterTree<State, State> & Getters,
    rootState?: any
  ): NetworkJsonOld[];
  [GettersTypes.getAllNetworks](
    state: State,
    getters?: GetterTree<State, State> & Getters,
    rootState?: any
  ): NetworkJsonOld[];
  [GettersTypes.getNetwork](state: State, getters?: GetterTree<State, State> & Getters): GetNetwork;
  // [GettersTypes.getAssetsJson](state: State, getters?: GetterTree<State, State> & Getters): AssetJson[];
  // [GettersTypes.getAssetName](state: State, getters?: GetterTree<State, State> & Getters): GetAssetName;
  // [GettersTypes.getAssetIcon](state: State, getters?: GetterTree<State, State> & Getters): GetAssetIcon;
  [GettersTypes.getFiats](state: State, getters?: GetterTree<State, State> & Getters): FiatJson[];
  [GettersTypes.getHistory](state: State, getters?: GetterTree<State, State> & Getters): GetHistory;
  [GettersTypes.getCurrencies](state: State, getters?: GetterTree<State, State> & Getters): TokenBalance[];
  // [GettersTypes.getAssetsPriceInterval](
  //   state: State,
  //   getters?: GetterTree<State, State> & Getters
  // ): NodeJS.Timer | null;
  // [GettersTypes.getActiveNodesByNetwork](
  //   state: State,
  //   getters?: GetterTree<State, State> & Getters
  // ): GetActiveNodesByNetwork;
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
  [GettersTypes.getPrice](state: State): AssetsPrice;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getNetworks](state, getters, rootState): NetworkJsonOld[] {
    const haveEthereumAccount = rootState.account.selectedWallet.ethereumAddress !== '';

    return haveEthereumAccount
      ? state.networks
      : state.networks.filter(({ name }) => !ETHEREUM_NETWORKS.includes(name));
  },

  [GettersTypes.getAllNetworks]({ networks }): NetworkJsonOld[] {
    return networks;
  },

  [GettersTypes.getNetwork]:
    ({ networks }) =>
    (networkName: string) => {
      return networks.find(({ name }) => name.toLowerCase() === networkName.toLowerCase())!;
    },

  [GettersTypes.getNetworkGenesisHash]:
    ({ networks }) =>
    (networkName: string) => {
      const network = networks.find(({ name }) => name === networkName)!;

      return `0x${network.chainId}`;
    },

  // [GettersTypes.getAssetsJson]({ assetsJson }): AssetJson[] {
  //   return assetsJson;
  // },

  [GettersTypes.getFiats]({ fiats }): FiatJson[] {
    return fiats;
  },

  [GettersTypes.getPrice]: ({ assetsPrice }) => {
    return assetsPrice;
  },

  [GettersTypes.getAssetPrice]:
    ({ assetsPrice }) =>
    (assetId: string) => {
      if (assetsPrice.tokenPriceMap[assetId] === undefined) return { price: 0, priceChange: 0 };

      const price = assetsPrice.tokenPriceMap[assetId];
      const priceChange = assetsPrice.tokenPriceChange[assetId] / 100;

      return { price, priceChange };
    },

  // [GettersTypes.getAssetName]:
  //   ({ assetsJson }) =>
  //   (assetId: string) => {
  //     const asset = assetsJson.find(({ id }) => id === assetId);

  //     if (!asset) return '';

  //     const { symbol, displayName } = asset;

  //     return displayName ?? symbol;
  //   },

  // [GettersTypes.getAssetIcon]:
  //   ({ assetsJson }) =>
  //   (assetId: string) => {
  //     const asset = assetsJson.find(({ id }) => id === assetId);

  //     if (!asset) return '';

  //     return asset.icon;
  //   },

  [GettersTypes.getHistory]:
    ({ history }) =>
    (assetId: string, walletAddress: string, networkName: string) => {
      return history[assetId]?.[walletAddress]?.[networkName];
    },

  [GettersTypes.getCurrencies]({ currencies }): TokenBalance[] {
    return currencies;
  },

  // [GettersTypes.getAssetsPriceInterval]({ assetsPriceInterval }): NodeJS.Timer | null {
  //   return assetsPriceInterval;
  // },

  // [GettersTypes.getActiveNodesByNetwork]:
  //   ({ activeNodes }) =>
  //   (networkName: string) => {
  //     return activeNodes[networkName] ?? { name: '', url: '' };
  //   },

  [GettersTypes.getAllNetworksIsReadyToUse]({ networks }): boolean {
    return !networks.some(({ apiStatus }) => apiStatus === 'pending' || apiStatus === 'connected');
  },

  [GettersTypes.getNetworkStatus]:
    ({ networks }) =>
    (networkName: string) => {
      const network = networks.find(({ name }) => name === networkName);

      return network?.apiStatus ?? NETWORK_STATUS.PENDING;
    },
};

export default getters;
