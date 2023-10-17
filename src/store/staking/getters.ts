import { TokenBalance } from '@extension-base/background/types/types';
import { SelectedWallet } from '../accounts/types';
import { GetStakingHistory, GetStakingNetwork, NetworkParams } from './types';
import type { GetterTree } from 'vuex';
import type { State } from './state';
import type { NetworkJson } from '@extension-base/types';
import { isSameString, isSora } from '@/helpers';
import { FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { isNetworkGroup } from '@/helpers/common';
import { SoraHistoryElement, SubqueryHistory } from '@/interfaces';

export enum GettersTypes {
  allStakingItems = 'allStakingItems',
  stakingItems = 'stakingItems',
  myStakingItems = 'myStakingItems',
  getStakingNetwork = 'getStakingNetwork',
  getStakingHistory = 'getStakingHistory',
}

export type Getters = {
  [GettersTypes.allStakingItems](
    state: State,
    getters?: GetterTree<State, State> & Getters,
    rootState?: any,
    rootGetters?: any
  ): NetworkParams[];
  [GettersTypes.stakingItems](state: State, getters?: GetterTree<State, State> & Getters): NetworkParams[];
  [GettersTypes.myStakingItems](state: State, getters?: GetterTree<State, State> & Getters): NetworkParams[];
  [GettersTypes.getStakingNetwork](state: State, getters?: GetterTree<State, State> & Getters): GetStakingNetwork | any;
  [GettersTypes.getStakingHistory](
    state: State,
    getters?: GetterTree<State, State> & Getters,
    rootState?: any,
    rootGetters?: any
  ): GetStakingHistory;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.allStakingItems]({ allStakingNetworks }, getters, rootState, rootGetters): NetworkParams[] {
    const accountBalances: TokenBalance[] = rootState.account.balances ?? [];
    const selectedWallet: SelectedWallet = rootState.account.selectedWallet;
    const selectedNetwork: string = rootGetters.selectedNetwork;
    const networks: NetworkJson[] = rootState.networks.networks;

    return allStakingNetworks
      .filter(({ network }) => {
        if (!isNetworkGroup(selectedNetwork)) return isSameString(network, selectedNetwork);

        const networkParams = networks.find(({ name }) => isSameString(name, network));

        if (isSameString(network, POPULAR_NETWORKS)) return networkParams?.rank !== undefined;

        if (isSameString(network, FAVORITE_NETWORKS)) return networkParams?.favorite.includes(selectedWallet.address);

        return true;
      })
      .map((params) => {
        if (accountBalances.length === 0) return { ...params };

        const balances = accountBalances.find(({ assetId }) => isSameString(assetId, params.assetId))?.balances;

        if (balances === undefined) return { ...params };

        const balance = balances.find(({ name }) => isSameString(name, params.network))!;
        const transferableAmount = balance.transferable ?? '0';

        return { ...params, transferableAmount };
      });
  },

  [GettersTypes.stakingItems](state, getters): NetworkParams[] {
    const allStakingItems: NetworkParams[] = getters?.allStakingItems as unknown as NetworkParams[];

    return allStakingItems.filter(({ totalStake }) => totalStake === '0');
  },

  [GettersTypes.myStakingItems](state, getters): NetworkParams[] {
    const allStakingItems: NetworkParams[] = getters?.allStakingItems as unknown as NetworkParams[];

    return allStakingItems.filter(({ totalStake }) => totalStake !== '0');
  },

  [GettersTypes.getStakingNetwork]: (state, getters) => (networkName: string) => {
    const allStakingItems: NetworkParams[] = getters?.allStakingItems as unknown as NetworkParams[];

    return allStakingItems.find(({ network }) => isSameString(network, networkName))!;
  },

  [GettersTypes.getStakingHistory]:
    (state, getters, rootState, rootGetters) => (networkName: string, assetId: string) => {
      const history: SubqueryHistory = rootGetters.getHistory(assetId, networkName);

      if (isSora(networkName)) {
        const nodes = history.nodes as unknown as SoraHistoryElement[];

        return nodes.filter(({ module }) => module === 'staking');
      }

      // TODO staking доделать для новых сетей
      return history.nodes;
    },
};

export default getters;
