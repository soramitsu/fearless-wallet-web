<template>
  <AboveForm header="pools.liquidityPools" :fullScreen="true" @closeHandler="closeForm">
    <div class="pools">
      <PoolsSettings
        :activeTabName="activeTabName"
        :filterValue="filterValue"
        :showPoolsItems="showPoolsItems"
        :showMyPoolsItems="showMyPoolsItems"
        @update:filterValue="updateFilterValue"
        @update:activeTabName="updateActiveTabName"
      />

      <ContentForm :height="460">
        <div class="content">
          <Loader v-if="showLoader" />

          <div v-else-if="noPoolsItems" class="no-pools">{{ $t('pools.noPools') }}</div>
          <template v-else>
            <Scroll>
              <template v-if="haveFilteredItems">
                <template v-if="isAllTab">
                  <PoolItem
                    v-for="item in filteredPoolsItems"
                    :key="getKey(item)"
                    :poolParams="item"
                    @click="openPoolDetails(item)"
                  />
                </template>

                <template v-else>
                  <PoolItem
                    v-for="item in filteredMyPoolsItems"
                    :key="getKey(item)"
                    :poolParams="item"
                    @click="openPoolDetails(item)"
                  />
                </template>
              </template>

              <div v-else class="nothing-found" data-testid="nothingFound">{{ $t('common.nothingFound') }}</div>
            </Scroll>
          </template>
        </div>
      </ContentForm>
    </div>
  </AboveForm>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { AccountLiquidity } from '@/types/sora';
import type { PoolsTab } from '@/interfaces';
import type { PoolParams } from '@/stores';
import PoolsSettings from '@/screens/pools/PoolsSettings.vue';
import PoolItem from '@/screens/pools/PoolItem.vue';
import { Components } from '@/router/routes';
import { subscribeAccountLiquidity, unsubscribePools } from '@/extension/messaging';
import { usePoolsStore } from '@/stores/pools';
import { useAccountsStore } from '@/stores/accounts';

const router = useRouter();
const poolsStore = usePoolsStore();
const accountsStore = useAccountsStore();

const activeTabName = ref<PoolsTab | ''>('');
const filterValue = ref('');
const isLoading = ref(false);

const filterMatchesPool = (filter: string, assetA: string, assetB: string) => {
  const normalizedFilter = filter.toLowerCase();
  const combined = `${assetA}${assetB}`.toLowerCase();
  const dashed = `${assetA}-${assetB}`.toLowerCase();

  return combined.includes(normalizedFilter) || dashed.includes(normalizedFilter);
};

const filteredPoolsItems = computed(() => {
  if (filterValue.value === '') return poolsStore.poolsItems;

  return poolsStore.poolsItems.filter(({ asset1, asset2 }) => {
    const symbol1 = asset1.symbol || asset1.name;
    const symbol2 = asset2.symbol || asset2.name;

    return filterMatchesPool(filterValue.value, symbol1, symbol2);
  });
});

const filteredMyPoolsItems = computed(() => {
  if (filterValue.value === '') return poolsStore.myPoolsItems;

  return poolsStore.myPoolsItems.filter(({ asset1, asset2 }) => {
    const symbol1 = asset1.symbol || asset1.name;
    const symbol2 = asset2.symbol || asset2.name;

    return filterMatchesPool(filterValue.value, symbol1, symbol2);
  });
});

const isAllTab = computed(() => activeTabName.value === 'all');

const haveFilteredItems = computed(() =>
  isAllTab.value ? filteredPoolsItems.value.length : filteredMyPoolsItems.value.length
);

const showPoolsItems = computed(() => poolsStore.poolsItems.length !== 0);
const showMyPoolsItems = computed(() => poolsStore.myPoolsItems.length !== 0);

const showLoader = computed(() => {
  if (activeTabName.value === 'all' && isLoading.value) return true;

  return activeTabName.value === '';
});

const noPoolsItems = computed(() => !showPoolsItems.value && !showMyPoolsItems.value);

const selectedWallet = computed(() => accountsStore.selectedWallet);

async function fetchPoolInfo() {
  const updateTab = () => updateActiveTabName(showMyPoolsItems.value ? 'my' : 'all');

  if (showMyPoolsItems.value && !showPoolsItems.value) updateTab();

  await poolsStore.getPoolsParams();

  if (activeTabName.value === '') updateTab();
}

function updateFilterValue(value: string) {
  filterValue.value = value;
}

function updateActiveTabName(name: PoolsTab) {
  activeTabName.value = name;
}

function openPoolDetails(poolParams: PoolParams) {
  const asset1 = poolParams.asset1.symbol || poolParams.asset1.name;
  const asset2 = poolParams.asset2.symbol || poolParams.asset2.name;

  router.push({
    name: Components.PoolDetails,
    params: {
      poolName: `${asset1}-${asset2}`,
    },
  });
}

function closeForm() {
  unsubscribePools();
  poolsStore.resetPoolsSubscription();

  router.push({ name: Components.Wallet });
}

function getKey(item: PoolParams) {
  return item.poolId;
}

onMounted(() => {
  void fetchPoolInfo();

  const callback = (accountLiquidity: AccountLiquidity[]) => {
    console.info('Client accountLiquidity:', accountLiquidity);

    void fetchPoolInfo();
  };

  subscribeAccountLiquidity(callback);
});

onBeforeUnmount(() => {
  unsubscribePools();
  poolsStore.resetPoolsSubscription();
});

watch(
  () => showPoolsItems.value,
  (newValue) => {
    if (!newValue) updateActiveTabName('my');
  }
);

watch(
  () => showMyPoolsItems.value,
  (newValue) => {
    if (!newValue) updateActiveTabName('all');
  }
);

watch(
  () => selectedWallet.value,
  async () => {
    isLoading.value = true;

    await poolsStore.getPoolsParams({ delay: 5000 });

    isLoading.value = false;
  }
);
</script>

<style lang="scss" scoped>
.pools {
  .content {
    padding: $default-padding $default-padding 0;
    height: 100%;
    display: flex;
    flex-direction: column;

    .no-pools {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
    }
  }

  .nothing-found {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
</style>
