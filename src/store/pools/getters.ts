import type { GetPoolsHistory, GetPoolsNetwork, PoolsNetworkParams } from '@/store/pools/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { GetterTree } from 'vuex';
import type { State } from './state';
import type { NetworkJson } from '@extension-base/types';
import type { SelectedWallet } from '@/store/accounts/types';
import { isSameString, isSora } from '@/helpers';
import { FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { isNetworkGroup } from '@/helpers/common';
import { type SoraHistoryElement, type SubqueryHistory } from '@/interfaces';
import { SORA_VAL_ASSET_ID } from '@/consts/sora';

export enum GettersTypes {
  allPoolsItems = 'allPoolsItems',
  poolsItems = 'poolsItems',
  myPoolsItems = 'myPoolsItems',
  getPoolsNetwork = 'getPoolsNetwork',
  getPoolsHistory = 'getPoolsHistory',
}

export type Getters = {
  [GettersTypes.allPoolsItems](
    state: State,
    getters?: GetterTree<State, State> & Getters,
    rootState?: any,
    rootGetters?: any
  ): PoolsNetworkParams[];
  [GettersTypes.poolsItems](state: State, getters?: GetterTree<State, State> & Getters): PoolsNetworkParams[];
  [GettersTypes.myPoolsItems](state: State, getters?: GetterTree<State, State> & Getters): PoolsNetworkParams[];
  [GettersTypes.getPoolsNetwork](state: State, getters?: GetterTree<State, State> & Getters): GetPoolsNetwork | any;
  [GettersTypes.getPoolsHistory](
    state: State,
    getters?: GetterTree<State, State> & Getters,
    rootState?: any,
    rootGetters?: any
  ): GetPoolsHistory;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.allPoolsItems]({ allPoolsItems }, getters, rootState, rootGetters): PoolsNetworkParams[] {
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
        if (accountBalances.length === 0) return { ...params };

        const balances = accountBalances.find(({ groupId }) => isSameString(groupId, params.assetId))?.balances;

        if (balances === undefined) return { ...params };

        const balance = balances.find(({ name }) => isSameString(name, params.network))!;
        const transferableAmount = balance.transferable ?? '0';

        return { ...params, transferableAmount };
      });
  },

  [GettersTypes.poolsItems](state, getters): PoolsNetworkParams[] {
    const allPoolsItems: PoolsNetworkParams[] = getters?.allPoolsItems as unknown as PoolsNetworkParams[];

    return allPoolsItems.filter(({ totalStake }) => totalStake === '0');
  },

  [GettersTypes.myPoolsItems](state, getters): PoolsNetworkParams[] {
    const allPoolsItems: PoolsNetworkParams[] = getters?.allPoolsItems as unknown as PoolsNetworkParams[];

    return allPoolsItems.filter(({ totalStake }) => totalStake !== '0');
  },

  [GettersTypes.getPoolsNetwork]: (state, getters) => (networkName: string) => {
    const allPoolsItems: PoolsNetworkParams[] = getters?.allPoolsItems as unknown as PoolsNetworkParams[];

    return allPoolsItems.find(({ network }) => isSameString(network, networkName))!;
  },

  [GettersTypes.getPoolsHistory]:
    (state, getters, rootState, rootGetters) =>
    (networkName: string, assetId: string, stashAddress?: string, payeeAddress?: string) => {
      const history: SubqueryHistory = rootGetters.getHistory(assetId, networkName, stashAddress);

      if (isSora(networkName)) {
        const nodes = (history?.nodes as unknown as SoraHistoryElement[]) ?? [];
        const poolsXor = nodes.filter(({ module }) => module === 'pools');

        const historyVal: SubqueryHistory = rootGetters.getHistory(SORA_VAL_ASSET_ID, networkName, payeeAddress);
        const nodesVal = (historyVal?.nodes as unknown as SoraHistoryElement[]) ?? [];
        const poolsVal = nodesVal.filter(({ module }) => module === 'pools');

        return [...poolsXor, ...poolsVal].sort(
          ({ timestamp: timestamp1 }, { timestamp: timestamp2 }) => +timestamp2 - +timestamp1
        );
      }

      // TODO pools доделать когда появятся новые сети для стейкинга
      return history?.nodes ?? [];
    },
};

export default getters;
