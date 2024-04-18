import type { PoolParams } from '@/store/pools/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { GetterTree } from 'vuex';
import type { State } from './state';
import type { NetworkJson } from '@extension-base/types';
import type { SelectedWallet } from '@/store/accounts/types';
import { isSameString } from '@/helpers';
import { FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { isNetworkGroup } from '@/helpers/common';

export enum GettersTypes {
  allPoolsItems = 'allPoolsItems',
  poolsItems = 'poolsItems',
  myPoolsItems = 'myPoolsItems',
  showPoolsBanner = 'showPoolsBanner',
}

export type Getters = {
  [GettersTypes.allPoolsItems](
    state: State,
    getters?: GetterTree<State, State> & Getters,
    rootState?: any,
    rootGetters?: any
  ): PoolParams[];
  [GettersTypes.poolsItems](state: State, getters?: GetterTree<State, State> & Getters): PoolParams[];
  [GettersTypes.myPoolsItems](state: State, getters?: GetterTree<State, State> & Getters): PoolParams[];
  [GettersTypes.showPoolsBanner](state: State, getters?: GetterTree<State, State> & Getters): boolean;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.allPoolsItems]({ allPoolsItems }, getters, rootState, rootGetters): PoolParams[] {
    const accountBalances: TokenGroup[] = rootState.account.balances ?? [];
    const selectedWallet: SelectedWallet = rootState.account.selectedWallet;
    const selectedNetwork: string = rootGetters.selectedNetwork;
    const networks: NetworkJson[] = rootState.networks.networks;

    return allPoolsItems
      .filter(({ network }) => {
        if (!isNetworkGroup(selectedNetwork)) return isSameString(network, selectedNetwork);

        const poolsNetworkParams = networks.find(({ name }) => isSameString(name, network));

        if (isSameString(network, POPULAR_NETWORKS)) return poolsNetworkParams?.rank !== undefined;

        if (isSameString(network, FAVORITE_NETWORKS))
          return poolsNetworkParams?.favorite.includes(selectedWallet.address);

        return true;
      })
      .map((params) => {
        if (accountBalances.length === 0) return params;

        const tokenGroup1 = accountBalances.find(({ groupId }) => isSameString(groupId, params.asset1.id));
        const tokenGroup2 = accountBalances.find(({ groupId }) => isSameString(groupId, params.asset2.id));

        if (tokenGroup1 !== undefined) {
          const balance1 = tokenGroup1.balances.find(({ name }) => isSameString(name, params.network))!;
          const transferableAmount1 = balance1.transferable ?? '0';

          params = { ...params, asset1: { ...params.asset1, transferableAmount: transferableAmount1 } };
        }

        if (tokenGroup2 !== undefined) {
          const balance2 = tokenGroup2.balances.find(({ name }) => isSameString(name, params.network))!;

          const transferableAmount2 = balance2.transferable ?? '0';

          params = { ...params, asset2: { ...params.asset2, transferableAmount: transferableAmount2 } };
        }

        return params;
      });
  },

  [GettersTypes.poolsItems](state, getters): PoolParams[] {
    const allPoolsItems: PoolParams[] = getters?.allPoolsItems as unknown as PoolParams[];

    return allPoolsItems.filter(({ asset1: { myAmount } }) => myAmount === '0');
  },

  [GettersTypes.myPoolsItems](state, getters): PoolParams[] {
    const allPoolsItems: PoolParams[] = getters?.allPoolsItems as unknown as PoolParams[];

    return allPoolsItems.filter(({ asset1: { myAmount } }) => myAmount !== '0');
  },

  [GettersTypes.showPoolsBanner]({ showPoolsBanner }): boolean {
    return showPoolsBanner;
  },
};

export default getters;
