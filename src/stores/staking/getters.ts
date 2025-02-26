import { useAccountsStore } from '../accounts';
import { useNetworksStore } from '../networks';
import type { GetStakingHistory, GetStakingNetwork, NetworkParams } from '@/stores/staking/types';
import type { State } from './state';
import type { SoraHistoryElement, SubqueryHistory } from '@/interfaces';
import { isSameString, isSora } from '@/helpers';
import { FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { isNetworkGroup } from '@/helpers/common';
import { SORA_VAL_ASSET_ID } from '@/consts/sora';

type CountStoreComputedGetters = {
  [Getter in keyof Getters]: ReturnType<Getters[Getter]>;
};

type CountStoreStateAndGetters = State & CountStoreComputedGetters;

export type Getters = {
  allStakingItems(state: State): NetworkParams[];
  stakingItems(this: CountStoreStateAndGetters): NetworkParams[];
  myStakingItems(this: CountStoreStateAndGetters): NetworkParams[];
  getStakingNetwork(this: CountStoreStateAndGetters): GetStakingNetwork;
  getStakingHistory(state: State): GetStakingHistory;
};

export const getters: Getters = {
  allStakingItems({ allStakingNetworks }): NetworkParams[] {
    const accountsStore = useAccountsStore();
    const networksStore = useNetworksStore();

    const accountBalances = accountsStore.balances ?? [];
    const selectedWallet = accountsStore.selectedWallet;
    const selectedNetwork = accountsStore.selectedNetwork;
    const networks = networksStore.networks;

    return allStakingNetworks
      .filter(({ network }) => {
        if (!isNetworkGroup(selectedNetwork)) return isSameString(network, selectedNetwork);

        const stakingNetwork = networks.find(({ name }) => isSameString(name, network));

        if (isSameString(network, POPULAR_NETWORKS)) return stakingNetwork?.rank !== undefined;

        if (isSameString(network, FAVORITE_NETWORKS)) return stakingNetwork?.favorite.includes(selectedWallet.address);

        return true;
      })
      .map((params) => {
        if (accountBalances.length === 0) return params;

        const balances = accountBalances.find(({ groupId }) => isSameString(groupId, params.assetId))?.balances;

        if (balances === undefined) return params;

        const balance = balances.find(({ name }) => isSameString(name, params.network))!;
        const transferableAmount = balance.transferable ?? '0';

        return { ...params, transferableAmount };
      });
  },

  stakingItems(this) {
    return this.allStakingItems.filter(({ totalStake }) => totalStake === '0');
  },

  myStakingItems(this) {
    return this.allStakingItems.filter(({ totalStake }) => totalStake !== '0');
  },

  getStakingNetwork(this) {
    const allStakingItems = this.allStakingItems;

    return (networkName: string) => {
      return allStakingItems.find(({ network }) => isSameString(network, networkName))!;
    };
  },

  getStakingHistory: () => (networkName: string, assetId: string, stashAddress?: string, payeeAddress?: string) => {
    const networksStore = useNetworksStore();

    const history: SubqueryHistory = networksStore.getHistory(assetId, networkName, stashAddress);

    if (isSora(networkName)) {
      const nodes = (history?.nodes as unknown as SoraHistoryElement[]) ?? [];
      const stakingXor = nodes.filter(({ module }) => module === 'staking');

      const historyVal: SubqueryHistory = networksStore.getHistory(SORA_VAL_ASSET_ID, networkName, payeeAddress);
      const nodesVal = (historyVal?.nodes as unknown as SoraHistoryElement[]) ?? [];
      const stakingVal = nodesVal.filter(({ module }) => module === 'staking');

      return [...stakingXor, ...stakingVal].sort(
        ({ timestamp: timestamp1 }, { timestamp: timestamp2 }) => +timestamp2 - +timestamp1
      );
    }

    // TODO staking доделать когда появятся новые сети для стейкинга
    return history?.nodes ?? [];
  },
};
