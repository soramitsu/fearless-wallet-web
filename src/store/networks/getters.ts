import type { NetworkJson } from '@extension-base/types';
import type { AssetsPrice, FiatJson, GetHistory } from '@/interfaces';
import type { GetNetwork, GetAssetPrice, GetNetworkGenesisHash, GetActiveNodesByNetwork } from './types';
import type { GetterTree } from 'vuex';
import type { State } from './state';
import type { SelectedWallet } from '@/store/accounts/types';
import BaseApi from '@/util/BaseApi';

export enum GettersTypes {
  networks = 'networks',
  allNetworks = 'allNetworks',
  getNetwork = 'getNetwork',
  getNetworkGenesisHash = 'getNetworkGenesisHash',
  prices = 'prices',
  getAssetPrice = 'getAssetPrice',
  getAssetIcon = 'getAssetIcon',
  fiats = 'fiats',
  getHistory = 'getHistory',
  getActiveNodesByNetwork = 'getActiveNodesByNetwork',
  favoriteNetworksNames = 'favoriteNetworksNames',
}

export type Getters = {
  [GettersTypes.networks](
    state: State,
    getters?: GetterTree<State, State> & Getters,
    rootState?: any,
    rootGetters?: any
  ): NetworkJson[];
  [GettersTypes.favoriteNetworksNames](state: State): { name: string; favorite: string[] }[];
  [GettersTypes.allNetworks](state: State): NetworkJson[];
  [GettersTypes.getNetwork](state: State, getters?: GetterTree<State, State> & Getters): GetNetwork;
  [GettersTypes.fiats](state: State, getters?: GetterTree<State, State> & Getters): FiatJson[];
  [GettersTypes.getHistory](
    state: State,
    getters?: GetterTree<State, State> & Getters,
    rootState?: any,
    rootGetters?: any
  ): GetHistory;
  [GettersTypes.getActiveNodesByNetwork](state: State): GetActiveNodesByNetwork;
  [GettersTypes.getNetworkGenesisHash](state: State): GetNetworkGenesisHash;
  [GettersTypes.getAssetPrice](state: State): GetAssetPrice;
  [GettersTypes.prices](state: State): AssetsPrice;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.networks](state, getters, rootState, rootGetters): NetworkJson[] {
    const haveEthereumAccount = rootGetters.selectedWallet.ethereumAddress !== '';

    return haveEthereumAccount ? state.networks : state.networks.filter(({ name }) => !BaseApi.isEthereumNetwork(name));
  },

  [GettersTypes.favoriteNetworksNames]({ networks }): { name: string; favorite: string[] }[] {
    return networks.filter((el) => el.favorite.length).map(({ name, favorite }) => ({ name, favorite }));
  },

  [GettersTypes.allNetworks]({ networks }): NetworkJson[] {
    return networks;
  },

  [GettersTypes.getNetwork]:
    ({ networks }) =>
    (networkNameOrChainId: string) => {
      const value = networkNameOrChainId.toLowerCase();

      return networks.find(({ name, chainId }) => name.toLowerCase() === value || chainId.toLowerCase() === value)!;
    },

  [GettersTypes.getNetworkGenesisHash]:
    ({ networks }) =>
    (networkName: string) => {
      const network = networks.find(({ name }) => name === networkName)!;

      return `0x${network.chainId}`;
    },

  [GettersTypes.fiats]({ fiats }): FiatJson[] {
    return fiats;
  },

  [GettersTypes.prices]: ({ assetsPrice }) => {
    return assetsPrice;
  },

  [GettersTypes.getAssetPrice]:
    ({ assetsPrice }) =>
    (priceId: string) => {
      if (assetsPrice.tokenPriceMap[priceId] === undefined) return { price: 0, priceChange: 0 };

      const price = assetsPrice.tokenPriceMap[priceId];
      const priceChange = assetsPrice.tokenPriceChange[priceId] / 100;

      return { price, priceChange };
    },

  [GettersTypes.getHistory]:
    ({ history }, getters, rootState, rootGetters) =>
    (assetId: string, networkName: string) => {
      const wallet: SelectedWallet = rootGetters.selectedWallet;

      return history[assetId]?.[wallet.address]?.[networkName.toLowerCase()];
    },

  [GettersTypes.getActiveNodesByNetwork]:
    ({ networks }) =>
    (networkName: string) => {
      const { currentProvider, nodes } = networks.find((net) => net.name.toLowerCase() === networkName.toLowerCase())!;

      const node = nodes.find((node) => node.url === currentProvider);

      return !node ? nodes[0] : node;
    },
};

export default getters;
