<template>
  <div class="asset">
    <AssetInfo :currency="currentCurrency" :price="assetPrice" />

    <router-view
      :currency="currentCurrency"
      @openHistoryDetailsForm="openHistoryDetailsForm"
      @toggleVisible="toggleVisible"
    >
    </router-view>

    <HistoryDetailsForm
      v-if="showHistoryDetailsForm"
      :historyElement="historyElement"
      :assetId="selectedAssetId"
      :selectedNetwork="selectedLocalNetwork"
      @handlerClose="closeHistoryDetailsForm"
    />

    <BuyPopup
      v-if="showBuyPopup"
      :asset="selectedAssetUpper"
      :address="displayAddressByNetwork"
      :providers="providers"
      @closePopup="toggleVisible(false)"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { HistoryElement } from '@/interfaces/history';
import HistoryDetailsForm from '@/screens/wallet&asset/asset/HistoryDetailsForm.vue';
import AssetInfo from '@/screens/wallet&asset/asset/AssetInfo.vue';
import BuyPopup from '@/screens/wallet&asset/BuyPopup.vue';
import BaseApi from '@/util/BaseApi';
import { isNetworkGroup } from '@/helpers/networkGroups';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const route = useRoute();

const historyElement = ref<HistoryElement | Record<string, string> | null>(null);
const showBuyPopup = ref(false);

const showHistoryDetailsForm = computed(() => historyElement.value !== null);

const selectedLocalNetwork = computed(() => (route.params.selectedNetwork as string | undefined) ?? '');

const selectedAssetId = computed(() => (route.params.assetId as string | undefined) ?? '');

const currentCurrency = computed(() => {
  return (
    accountsStore.balances.find(
      ({ groupId: id, balances }) =>
        id === selectedAssetId.value || balances.some(({ id }) => id === selectedAssetId.value)
    ) ?? {}
  );
});

const providers = computed(() => currentCurrency.value.providers ?? []);

const mainNetwork = computed(() => {
  const currency = currentCurrency.value.balances?.find((network) => network.isUtility || network.isNative);

  return currency ? currency.name : '';
});

const isHistoryPage = computed(() => {
  if (!isNetworkGroup(accountsStore.selectedNetwork)) return false;

  return selectedLocalNetwork.value === '';
});

const displayAddressByNetwork = computed(() => {
  if (isHistoryPage.value) return BaseApi.formatAddress(accountsStore.selectedWallet, mainNetwork.value);

  return BaseApi.formatAddress(accountsStore.selectedWallet, selectedLocalNetwork.value);
});

const selectedAsset = computed(() => currentCurrency.value.symbol?.toLowerCase() ?? '');
const selectedAssetUpper = computed(() => selectedAsset.value.toUpperCase());

const assetPrice = computed(() => networksStore.getAssetPrice(currentCurrency.value.priceId ?? ''));

function toggleVisible(value = true) {
  showBuyPopup.value = value;
}

function openHistoryDetailsForm(element: HistoryElement) {
  historyElement.value = element;
}

function closeHistoryDetailsForm() {
  historyElement.value = null;
}
</script>

<style lang="scss" scoped>
.asset {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  height: 450px;

  .popup-tip {
    position: absolute;
    display: flex;
    flex-flow: column;
    align-items: flex-end;
    height: 100px;
    width: 100%;
    gap: 10px;

    .controls {
      display: flex;
      flex-flow: row nowrap;
      align-items: center;
      gap: 15px;
    }

    .background-ellipse {
      display: flex;
      align-items: center;
      height: 32px;
      padding: 12px;
      font-size: 0.75rem;
      line-height: 18px;
      border-radius: 20px;
      background-color: $default-background-color;
      user-select: none;
    }

    .popup-tip__message {
      width: 260px;
    }

    .popup__button-width {
      width: 42px;
    }

    .icon-arrow-tip {
      display: flex;
      flex-flow: column;
      width: 100%;
      align-items: flex-end;
      padding-right: 60px;
      gap: 20px;
    }

    .icon__close {
      height: 18px;
      width: 18px;
    }
  }
}
</style>
