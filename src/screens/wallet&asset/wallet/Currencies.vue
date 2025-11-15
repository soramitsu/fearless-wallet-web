<template>
  <Scroll>
    <Loader v-if="showLoader" class="asset-loader" />

    <div v-else-if="showHiddenText" class="info-text" data-testid="infoText">{{ $t(mainText()) }}</div>

    <Draggable
      v-else
      v-model="filteredTokenGroups"
      handle=".handle"
      item-key="groupId"
      :key="accountsStore.selectedWallet.address"
    >
      <CurrencyItem
        v-for="(asset, assetKey) in filteredTokenGroups"
        :assetData="asset"
        :price="getAssetPrice(asset.priceId)"
        :priceChange="getPriceChange(asset.priceId)"
        :key="assetKey"
        :selectedNetwork="accountsStore.selectedNetwork"
        :showAssetsManagementForm="showAssetsManagementForm"
        :timeoutCallback="timeoutCallback"
        @toggleVisibleActivityForm="emit('toggleVisibleActivityForm', ...arguments)"
        @toggleNetworkManagementVisible="emit('toggleNetworkManagementVisible')"
      />
    </Draggable>
  </Scroll>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import Draggable from 'vuedraggable';
import type { TokenGroup } from '@extension-base/background/types/types';
import CurrencyItem from '@/screens/wallet&asset/wallet/CurrencyItem.vue';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

type TimeoutSubscription = {
  subscription: ReturnType<typeof setTimeout>;
  fn: () => void;
};

const props = defineProps<{
  balances: TokenGroup[];
  filterValue: string;
  showAssetsManagementForm: boolean;
}>();

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();

const timeoutSubscriptions = ref<TimeoutSubscription[]>([]);

const showLoader = computed(() => isEmptyBalances.value || accountsStore.isBalanceLoading);

const isEmptyBalances = computed(() => accountsStore.balances.length === 0);

const isOnline = computed(() => navigator.onLine);

const showHiddenText = computed(() => {
  if (!isOnline.value || !props.balances) return true;

  if (props.showAssetsManagementForm) return false;

  const allHidden = props.balances.every(({ groupId }) => accountsStore.hiddenAssets.includes(groupId));

  return props.balances.length === accountsStore.hiddenAssets.length || allHidden || !navigator.onLine;
});

const filteredTokenGroups = computed({
  get: () => props.balances,
  set: (balances: TokenGroup[]) => {
    accountsStore.setBalance({
      details: balances,
      reset: false,
      saveSequence: true,
    });
  },
});

function getAssetPrice(assetKey: string | undefined) {
  if (assetKey === undefined) return 0;

  if (Object.keys(networksStore.assetsPrice).length && networksStore.assetsPrice.tokenPriceMap[assetKey])
    return networksStore.assetsPrice.tokenPriceMap[assetKey];

  return 0;
}

function getPriceChange(assetKey: string | undefined) {
  if (
    networksStore.assetsPrice === undefined ||
    networksStore.assetsPrice.tokenPriceChange === undefined ||
    assetKey === undefined
  )
    return 0;

  if (networksStore.assetsPrice.tokenPriceChange[assetKey])
    return networksStore.assetsPrice.tokenPriceChange[assetKey] / 100;

  return 0;
}

function timeoutCallback(fn: () => void) {
  timeoutSubscriptions.value.forEach(({ subscription }) => clearTimeout(subscription));

  const subscription = setTimeout(() => fn(), 0);
  timeoutSubscriptions.value = [{ subscription, fn }];
}

function mainText() {
  if (!navigator.onLine) return 'common.offlineStatus';

  return props.filterValue !== '' ? 'common.nothingFound' : 'wallet.allAssetsHidden';
}

onBeforeUnmount(() => {
  timeoutSubscriptions.value.forEach(({ subscription }) => clearTimeout(subscription));
  timeoutSubscriptions.value = [];
});
</script>

<style lang="scss" scoped>
.info-text {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: -16px;
}

.asset-loader {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}
</style>
