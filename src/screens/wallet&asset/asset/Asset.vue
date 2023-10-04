<template>
  <div class="asset">
    <AssetInfo :currency="currentCurrency" :price="assetPrice" />

    <router-view
      :currency="currentCurrency"
      @openHistoryDetailsForm="openHistoryDetailsForm"
      @toggleVisible="toggleVisible"
    >
    </router-view>

    <SendForm
      v-if="showSendForm"
      :_selectedNetwork="selectedAssetNetwork"
      :_selectedAssetId="selectedAssetId"
      @closeForm="toggleVisible('showSendForm', false)"
    />

    <ReceiveForm
      v-if="showReceiveForm"
      :_selectedNetwork="selectedAssetNetwork"
      :selectedAssetId="selectedAssetId"
      @closeForm="toggleVisible('showReceiveForm', false)"
    />

    <CrossChainForm
      v-if="showCrossChainForm"
      :_originalNetwork="selectedAssetNetwork"
      :_selectedAssetId="selectedAssetId"
      @closeForm="toggleVisible('showCrossChainForm', false)"
    />

    <HistoryDetailsForm
      v-if="showHistoryDetailsForm"
      :historyElement="historyElement"
      :assetId="selectedAssetId"
      @handlerClose="closeHistoryDetailsForm"
    />

    <BuyPopup
      v-if="showBuyPopup"
      :asset="selectedAssetUpper"
      :address="displayAddressByNetwork"
      :providers="providers"
      @closePopup="toggleVisible('showBuyPopup', false)"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { NetworkJson } from '@extension-base/types';
import type { HistoryElement } from '@/interfaces/history';
import type { TokenBalance } from '@extension-base/background/types/types';
import type { GetAssetPrice, GetNetwork, SelectedWallet } from '@/store';
import HistoryDetailsForm from '@/screens/wallet&asset/asset/HistoryDetailsForm.vue';
import NetworkManagementButton from '@/screens/main/NetworkManagementButton.vue';
import ReceiveForm from '@/screens/wallet&asset/ReceiveForm.vue';
import SendForm from '@/screens/wallet&asset/SendForm.vue';
import AssetInfo from '@/screens/wallet&asset/asset/AssetInfo.vue';
import CrossChainForm from '@/screens/wallet&asset/CrossChainForm.vue';
import NetworkManagement from '@/screens/wallet&asset/NetworkManagement.vue';
import BuyPopup from '@/screens/wallet&asset/BuyPopup.vue';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { NETWORKS_GROUPS } from '@/consts/networks';
import { isNetworkGroup } from '@/helpers/common/index';

type ShowField = 'showSendForm' | 'showReceiveForm' | 'showCrossChainForm' | 'showBuyPopup';

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
  historyElement: HistoryElement | Record<string, string> | null = null;
  showSendForm = false;
  showReceiveForm = false;
  showCrossChainForm = false;
  showBuyPopup = false;
  showTipPopup = false;
  filterValue = '';

  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getSelectedNetwork) selectedNetwork!: string;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJson[];
  @Getter(NetworksGettersTypes.getAssetPrice) getTokenPrice!: GetAssetPrice;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;

  get showHistoryDetailsForm() {
    return this.historyElement !== null;
  }

  get isGroupIcon() {
    return isNetworkGroup(this.selectedNetwork);
  }

  get selectedNetworkIcon() {
    if (this.isGroupIcon) return 'all-networks';

    return this.getNetwork(this.selectedNetwork).icon;
  }

  get selectedAssetNetwork() {
    return this.$route.params.selectedNetwork ?? '';
  }

  get isSelectedNetworkHistory() {
    if (!NETWORKS_GROUPS.includes(this.selectedNetwork)) return false;

    return this.selectedAssetNetwork === '';
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
      this.balances.find(
        ({ assetId: id, balances }) =>
          id === this.selectedAssetId || balances.some((el) => el.id === this.selectedAssetId)
      )! ?? {}
    );
  }

  get displayAddressByNetwork() {
    if (this.isSelectedNetworkHistory) return BaseApi.formatAddress(this.selectedWallet, this.mainNetwork);

    return BaseApi.formatAddress(this.selectedWallet, this.selectedNetwork);
  }

  get selectedAssetId() {
    return this.$route.params.assetId ?? '';
  }

  get selectedAsset() {
    return this.currentCurrency.symbol?.toLowerCase() ?? '';
  }

  get iconPosition() {
    const isPopup = BaseApi.useIsPopup();

    return `top: 24px; right:${isPopup ? '67px' : '131px'};`;
  }

  get selectedAssetUpper() {
    return this.selectedAsset.toUpperCase();
  }

  get assetPrice() {
    return this.getAssetPrice(this.currentCurrency.priceId ?? '');
  }

  toggleVisible(field: ShowField, value = true) {
    this[field] = value;
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
      font-size: 12px;
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
