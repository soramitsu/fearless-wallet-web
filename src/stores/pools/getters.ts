import { useAccountsStore } from '../accounts';
import { useNetworksStore } from '../networks';
import type { PoolParams } from '@/stores/pools/types';
import type { State } from './state';
import { isSameString } from '@/helpers';
import { FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { isNetworkGroup } from '@/helpers/common';

type Getters = {
  allPoolsItemsMap(state: State): PoolParams[];
  poolsItems(state: State): PoolParams[];
  myPoolsItems(state: State): PoolParams[];
};

export const getters: Getters = {
  allPoolsItemsMap({ allPoolsItems }): PoolParams[] {
    const accountsStore = useAccountsStore();
    const networksStore = useNetworksStore();

    const accountBalances = accountsStore.balances ?? [];
    const selectedWallet = accountsStore.selectedWallet;
    const selectedNetwork = accountsStore.selectedNetwork;
    const networks = networksStore.networks;

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

        let newParams = { ...params } as PoolParams;

        const tokenGroup1 = accountBalances.find(({ groupId }) => isSameString(groupId, params.asset1.id));
        const tokenGroup2 = accountBalances.find(({ groupId }) => isSameString(groupId, params.asset2.id));

        if (tokenGroup1 !== undefined) {
          const balance1 = tokenGroup1.balances.find(({ name }) => isSameString(name, params.network))!;
          const transferableAmount1 = balance1.transferable ?? '0';

          newParams = {
            ...newParams,
            asset1: {
              ...newParams.asset1,
              transferableAmount: transferableAmount1,
              priceId: tokenGroup1.priceId ?? '',
              color: tokenGroup1.color ?? '',
            },
          } as PoolParams;
        }

        if (tokenGroup2 !== undefined) {
          const balance2 = tokenGroup2.balances.find(({ name }) => isSameString(name, params.network))!;

          const transferableAmount2 = balance2.transferable ?? '0';

          newParams = {
            ...newParams,
            asset2: {
              ...newParams.asset2,
              transferableAmount: transferableAmount2,
              priceId: tokenGroup2.priceId ?? '',
              icon: tokenGroup2.icon,
              color: tokenGroup2.color ?? '',
            },
          } as PoolParams;
        }

        return newParams;
      }) as PoolParams[];
  },

  poolsItems(): PoolParams[] {
    const allPoolsItems: PoolParams[] = this.allPoolsItemsMap as unknown as PoolParams[];

    return allPoolsItems.filter(({ isMyPool }) => !isMyPool);
  },

  myPoolsItems(): PoolParams[] {
    const allPoolsItems: PoolParams[] = this.allPoolsItemsMap as unknown as PoolParams[];

    return allPoolsItems.filter(({ isMyPool }) => isMyPool);
  },
};
