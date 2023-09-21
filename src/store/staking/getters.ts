import { GetStakingNetwork, NetworkParams } from './types';
import type { GetterTree } from 'vuex';
import type { State } from './state';
import { isSameString } from '@/helpers';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';

export enum GettersTypes {
  allStakingItems = 'allStakingItems',
  stakingItems = 'stakingItems',
  myStakingItems = 'myStakingItems',
  getStakingNetwork = 'getStakingNetwork',
}

export type Getters = {
  [GettersTypes.allStakingItems](
    state: State,
    getters?: GetterTree<State, State> & Getters,
    rootState?: any
  ): NetworkParams[];
  [GettersTypes.stakingItems](state: State, getters?: GetterTree<State, State> & Getters): NetworkParams[];
  [GettersTypes.myStakingItems](state: State, getters?: GetterTree<State, State> & Getters): NetworkParams[];
  [GettersTypes.getStakingNetwork](state: State, getters?: GetterTree<State, State> & Getters): GetStakingNetwork | any;
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.allStakingItems]({ allStakingNetworks }, getters, rootState): NetworkParams[] {
    const accountBalances: TokenBalance[] = rootState.account.balances ?? [];

    return allStakingNetworks.map((params) => {
      if (accountBalances.length === 0) return { ...params, bondAmount: '0' };

      const { balances } = accountBalances.find(({ assetId }) => isSameString(assetId, params.assetId))!;
      const balance = balances.find(({ name }) => isSameString(name, params.network))!;
      const bondAmount = balance.frozen ?? '0';
      const transferableAmount = balance.transferable ?? '0';

      return { ...params, bondAmount, transferableAmount };
    });
  },

  [GettersTypes.stakingItems](state, getters): NetworkParams[] {
    const allStakingItems: NetworkParams[] = getters?.allStakingItems as unknown as NetworkParams[];

    return allStakingItems.filter(({ bondAmount }) => bondAmount === '0');
  },

  [GettersTypes.myStakingItems](state, getters): NetworkParams[] {
    const allStakingItems: NetworkParams[] = getters?.allStakingItems as unknown as NetworkParams[];

    return allStakingItems.filter(({ bondAmount }) => bondAmount !== '0');
  },

  [GettersTypes.getStakingNetwork]: (state, getters) => (networkName: string) => {
    const allStakingItems: NetworkParams[] = getters?.allStakingItems as unknown as NetworkParams[];

    return allStakingItems.find(({ network }) => isSameString(network, networkName))!;
  },
};

export default getters;
