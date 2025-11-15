<template>
  <div class="staking">
    <header class="staking-header">
      <div class="staking-balance">
        <span class="label" data-testid="labelStakingbalance"> {{ $t('staking.stakingBalance') }} </span>

        <div class="balance">
          <WalletBalance class="wallet-balance" :balance="stakingBalance" />

          <Loading v-if="showLoading" :width="28" class="balance-loading" />
        </div>
      </div>
    </header>

    <ContentForm :height="382">
      <div class="content">
        <Loader v-if="showLoader" />

        <div v-else-if="noStakingItems" class="no-staking">{{ $t('staking.noStaking') }}</div>

        <template v-else>
          <StakingSettings
            :activeTabName="activeTabName"
            :filterValue="filterValue"
            :showStakingItems="showStakingItems"
            :showMyStakingItems="showMyStakingItems"
            @update:filterValue="updateFilterValue"
            @update:activeTabName="updateActiveTabName"
          />

          <Scroll>
            <template v-if="haveFilteredItems">
              <template v-if="isAllTab">
                <StakingItem
                  v-for="item in filteredStakingItems"
                  :key="item.network"
                  :stakingNetwork="item"
                  @click="updateNetworkBond(item)"
                />
              </template>

              <template v-else>
                <MyStakingItem v-for="item in filteredMyStakingItems" :key="item.network" :stakingNetwork="item" />
              </template>
            </template>

            <div v-else class="nothing-found" data-testid="nothingFound">{{ $t('common.nothingFound') }}</div>
          </Scroll>
        </template>
      </div>
    </ContentForm>

    <Bond v-if="showBond" :stakingNetwork="stakingNetwork" @closeBond="updateNetworkBond" />
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import type { StakingTab } from '@/interfaces';
import type { NetworkParams } from '@/stores';
import { networksIsPending } from '@/helpers/shimmers';
import WalletBalance from '@/screens/main/WalletBalance.vue';
import StakingSettings from '@/screens/staking/StakingSettings.vue';
import StakingItem from '@/screens/staking/StakingItem.vue';
import MyStakingItem from '@/screens/staking/MyStakingItem.vue';
import Bond from '@/screens/staking/Bond.vue';
import { isSubstrString, isSameString } from '@/helpers';
import { getCostOfAssets } from '@/helpers/transfers';
import { useStakingStore } from '@/stores/staking';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const stakingStore = useStakingStore();
const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();

const activeTabName = ref<StakingTab | ''>('');
const filterValue = ref('');
const isLoading = ref(false);
const stakingNetwork = ref<NetworkParams | null>(null);

const filteredStakingItems = computed(() => {
  if (filterValue.value === '') return stakingStore.stakingItems;

  return stakingStore.stakingItems.filter(({ network }) => isSubstrString(network, filterValue.value));
});

const filteredMyStakingItems = computed(() => {
  if (filterValue.value === '') return stakingStore.myStakingItems;

  return stakingStore.myStakingItems.filter(({ network }) => isSubstrString(network, filterValue.value));
});

const showStakingItems = computed(() => stakingStore.stakingItems.length !== 0);
const showMyStakingItems = computed(() => stakingStore.myStakingItems.length !== 0);

const isAllTab = computed(() => activeTabName.value === 'all');

const haveFilteredItems = computed(() =>
  isAllTab.value ? filteredStakingItems.value.length : filteredMyStakingItems.value.length
);

const showLoader = computed(() => (activeTabName.value === 'all' && isLoading.value) || activeTabName.value === '');
const noStakingItems = computed(() => !showStakingItems.value && !showMyStakingItems.value);
const showBond = computed(() => stakingNetwork.value !== null);

const showLoading = computed(() => {
  const networks = networksStore.networks.filter(({ name }) =>
    stakingStore.myStakingItems.some(({ network }) => isSameString(name, network))
  );

  return networksIsPending(networks);
});

const stakingBalance = computed(() =>
  stakingStore.myStakingItems.reduce((sum, { totalStake, assetId }) => {
    const balance = accountsStore.balances.find(({ groupId }) => groupId === assetId);
    if (!balance) return sum;
    const { priceId } = balance;
    const assetPrice = networksStore.getAssetPrice(priceId ?? '').price;
    const value = getCostOfAssets(totalStake, assetPrice) as number;

    return sum + value;
  }, 0)
);

function updateFilterValue(value: string) {
  filterValue.value = value;
}

function updateActiveTabName(name: StakingTab) {
  activeTabName.value = name;
}

function updateNetworkBond(newStakingNetwork: NetworkParams | null = null, updated = false) {
  stakingNetwork.value = newStakingNetwork;

  if (updated) void updateTabStakingParams();
}

async function updateTabStakingParams() {
  isLoading.value = true;

  await stakingStore.getStakingParams({ delay: 5000 });

  isLoading.value = false;
}

onMounted(async () => {
  const updateTab = () => updateActiveTabName(showStakingItems.value ? 'all' : 'my');

  if (showMyStakingItems.value && !showStakingItems.value) updateTab();

  await stakingStore.getStakingParams();

  if (activeTabName.value === '') updateTab();
});

watch(showStakingItems, (newValue) => {
  if (!newValue) updateActiveTabName('my');
});

watch(showMyStakingItems, (newValue) => {
  if (!newValue) updateActiveTabName('all');
});

watch(
  () => accountsStore.selectedWallet.address,
  () => {
    void updateTabStakingParams();
  }
);
</script>

<style lang="scss" scoped>
.staking {
  .staking-header {
    min-height: 46px;
    display: flex;
    justify-content: space-between;
    margin-bottom: 3px;
  }

  .balance {
    display: flex;

    .wallet-balance {
      font-size: 1.375em;
      line-height: 28px;
    }

    .balance-loading {
      margin-left: 10px;
    }
  }

  .staking-balance {
    display: flex;
    flex-direction: column;
    text-transform: uppercase;

    .label {
      color: $gray-color;
      font-weight: 500;
      margin-bottom: 7px;
    }
  }

  .content {
    padding: $default-padding $default-padding 0;
    height: 100%;
    display: flex;
    flex-direction: column;

    .no-staking {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
      margin: auto;
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
