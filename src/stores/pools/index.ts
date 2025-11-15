import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { GetPoolsParamsProps, PoolParams, SetAllPoolsItems, StatePoolParams } from '@/stores/pools/types';
import { getPoolsParams, subscribePoolsParams } from '@/extension/messaging';
import { accountController } from '@/controllers';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';
import { createNormalizedNetworkNameSet, normalizeNetworkName } from '@/helpers/networkGroups';
import { SORA_NETWORK_NAME } from '@/consts/sora';

export const POOLS_NETWORKS_LIST = [SORA_NETWORK_NAME];

export const usePoolsStore = defineStore('pools', () => {
  const allPoolsItems = ref<StatePoolParams[]>([]);
  const showPoolsBanner = ref<boolean>(!accountController.getHidingPoolsBanner());
  const poolsSubscriptionActive = ref(false);

  const allPoolsItemsMap = computed<PoolParams[]>(() => {
    const accountsStore = useAccountsStore();
    const networksStore = useNetworksStore();

    const selectedWallet = accountsStore.selectedWallet;
    const selectedNetwork = accountsStore.selectedNetwork;
    const networks = networksStore.networks;
    const allowedNetworkNames = createNormalizedNetworkNameSet(networks, selectedNetwork, {
      favoriteAddress: selectedWallet.address,
    });

    return allPoolsItems.value
      .filter((item) => {
        const { network } = item;
        if (!network) return false;

        return allowedNetworkNames.has(normalizeNetworkName(network));
      })
      .map((params) => ({ ...params })) as PoolParams[];
  });

  const poolsItems = computed<PoolParams[]>(() => allPoolsItemsMap.value.filter(({ isMyPool }) => !isMyPool));

  const myPoolsItems = computed<PoolParams[]>(() => allPoolsItemsMap.value.filter(({ isMyPool }) => isMyPool));

  const updatePoolsParams = (poolParams: SetAllPoolsItems) => {
    allPoolsItems.value = poolParams.map((params) => ({
      ...params,
      loading: false,
    }));
  };

  const ensurePoolsSubscription = async () => {
    if (poolsSubscriptionActive.value) return;

    const subscribed = await subscribePoolsParams({ networks: POOLS_NETWORKS_LIST }, (params) => {
      updatePoolsParams(params);
    });

    poolsSubscriptionActive.value = subscribed;
  };

  const clearPoolsParams = () => {
    allPoolsItems.value = allPoolsItems.value.map((item) => ({
      ...item,
      loading: true,
    }));
  };

  const hidePoolsBanner = () => {
    accountController.setHidingPoolsBanner();
    showPoolsBanner.value = false;
  };

  const getPoolsParamsAction = async (props: GetPoolsParamsProps = { delay: 0 }) => {
    clearPoolsParams();

    await ensurePoolsSubscription();

    await new Promise<void>((resolve) => {
      setTimeout(async () => {
        const poolParams = await getPoolsParams({ networks: POOLS_NETWORKS_LIST });

        updatePoolsParams(poolParams);

        resolve();
      }, props.delay);
    });
  };

  const resetPoolsSubscription = () => {
    poolsSubscriptionActive.value = false;
  };

  return {
    // state
    allPoolsItems,
    showPoolsBanner,
    // getters
    allPoolsItemsMap,
    poolsItems,
    myPoolsItems,
    // actions
    getPoolsParams: getPoolsParamsAction,
    resetPoolsSubscription,
    hidePoolsBanner,
    clearPoolsParams,
    updatePoolsParams,
  };
});

export type PoolStore = ReturnType<typeof usePoolsStore>;
