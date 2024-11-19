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

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

import type { HistoryElement } from '@/interfaces/history';
import HistoryDetailsForm from '@/screens/wallet&asset/asset/HistoryDetailsForm.vue';
import NetworkManagementButton from '@/screens/main/NetworkManagementButton.vue';
import ReceiveForm from '@/screens/wallet&asset/ReceiveForm.vue';
import SendForm from '@/screens/wallet&asset/SendForm.vue';
import AssetInfo from '@/screens/wallet&asset/asset/AssetInfo.vue';
import CrossChainForm from '@/screens/wallet&asset/CrossChainForm.vue';
import NetworkManagement from '@/screens/wallet&asset/NetworkManagement.vue';
import BuyPopup from '@/screens/wallet&asset/BuyPopup.vue';
import BaseApi from '@/util/BaseApi';
import { NETWORKS_GROUPS } from '@/consts/networks';
import { isNetworkGroup } from '@/helpers/common/index';
import { IS_POPUP } from '@/consts/globalClient';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

@Component({
  components: {
    AssetInfo,
    SendForm,
    BuyPopup,
    ReceiveForm,
    CrossChainForm,
    HistoryDetailsForm,
    NetworkManagementButton,
    NetworkManagement,
  },
})
export default class Asset extends Vue {
  networksStore = useNetworksStore();
  accountsStore = useAccountsStore();
  historyElement: HistoryElement | Record<string, string> | null = null;
  showBuyPopup = false;
  showTipPopup = false;
  filterValue = '';

  get showHistoryDetailsForm() {
    return this.historyElement !== null;
  }

  get isGroupIcon() {
    return isNetworkGroup(this.accountsStore.selectedNetwork);
  }

  get selectedNetworkIcon() {
    if (this.isGroupIcon) return 'all-networks';

    return this.networksStore.getNetwork(this.accountsStore.selectedNetwork).icon;
  }

  get selectedLocalNetwork() {
    return this.$route.params.selectedNetwork ?? '';
  }

  get isHistoryPage() {
    if (!NETWORKS_GROUPS.includes(this.accountsStore.selectedNetwork)) return false;

    return this.selectedLocalNetwork === '';
  }

  get providers() {
    return this.currentCurrency.providers ?? [];
  }

  get mainNetwork() {
    const currency = this.currentCurrency.balances?.find((network) => network.isUtility || network.isNative);

    return currency ? currency.name : '';
  }

  get currentCurrency() {
    return (
      this.accountsStore.balances.find(
        ({ groupId: id, balances }) =>
          id === this.selectedAssetId || balances.some(({ id }) => id === this.selectedAssetId)
      )! ?? {}
    );
  }

  get displayAddressByNetwork() {
    if (this.isHistoryPage) return BaseApi.formatAddress(this.accountsStore.selectedWallet, this.mainNetwork);

    return BaseApi.formatAddress(this.accountsStore.selectedWallet, this.selectedLocalNetwork);
  }

  get selectedAssetId() {
    return this.$route.params.assetId ?? '';
  }

  get selectedAsset() {
    return this.currentCurrency.symbol?.toLowerCase() ?? '';
  }

  get iconPosition() {
    return `top: 24px; right:${IS_POPUP ? '67px' : '131px'};`;
  }

  get selectedAssetUpper() {
    return this.selectedAsset.toUpperCase();
  }

  get assetPrice() {
    return this.networksStore.getAssetPrice(this.currentCurrency.priceId ?? '');
  }

  toggleVisible(value = true) {
    this.showBuyPopup = value;
  }

  handlerFilter(value: string) {
    this.filterValue = value;
  }

  openHistoryDetailsForm(historyElement: HistoryElement) {
    this.historyElement = historyElement;
  }

  closeHistoryDetailsForm() {
    this.historyElement = null;
  }
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
      font-size: 0.75em;
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
