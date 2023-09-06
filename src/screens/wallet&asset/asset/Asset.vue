<template>
  <div class="asset">
    <ContentForm :height="160" :isStaticHeight="true" :bottomRightCorner="true">
      <div class="asset-info">
        <div class="asset__icon">
          <ExternalLogo :name="assetIcon" :width="82" :height="82" />
        </div>

        <div class="asset-info__content">
          <div class="asset__price">
            <div class="asset__price-item asset__price-item-change">
              <span :class="changePriceClasses">{{ priceChangeString }}</span>
              <span :class="changePriceClasses">{{ fiatPriceChangeString }}</span>
            </div>
            <span class="asset__price-item">{{ assetPriceString }}</span>
          </div>
          <div class="asset__balance">{{ countAssetsString }}</div>
          <span class="asset__balance asset__balance--fiat">{{ transferableFiatBalanceInNetworkString }}</span>

          <div class="asset__locked" @click="toggleBalanceDetailsPopup">
            <div class="asset__locked-content">
              <span class="asset__locked-title">{{ $t('assets.locked') }}</span>
              <span>{{ lockedBalanceString }}</span>
              <Icon icon="info" class="details-icon" />
            </div>
          </div>
        </div>
      </div>
    </ContentForm>

    <div v-if="!isSelectedNetworkHistory" class="activity">
      <BorderButton
        v-for="(button, index) in basicButtons"
        :class="button.class"
        :text="button.text"
        :iconName="button.icon"
        @click="toggleVisible(button.formName)"
        :key="index"
      />

      <BorderButton
        v-if="showCrossChainButton"
        class="activity-button"
        text="assets.crossChain"
        iconName="cross-chain"
        @click="toggleVisible('showCrossChainForm')"
      />

      <BorderButton
        v-if="showSwapButton"
        class="activity-button"
        text="assets.swap"
        iconName="swap"
        @click="openSoraSwap"
      />

      <BorderButton
        v-if="showBuyButton && !isNeedPopupButton"
        class="activity-button"
        text="assets.buy"
        iconName="plus-pink"
        @click="toggleVisible('showBuyPopup')"
      />

      <BorderButton
        v-if="isNeedPopupButton"
        class="activity-button activity-button--settings"
        iconName="three-dots-vertical"
        @click="togglePopupButton"
      />
    </div>

    <Networks
      v-if="isSelectedNetworkHistory"
      :currency="currentCurrency"
      @openHistoryDetailsForm="openHistoryDetailsForm"
      @selectNetworkHistory="selectNetworkHistory"
    />

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
      :handlerClose="closeHistoryDetailsForm"
      :historyElement="historyElement"
      :assetId="selectedAssetId"
    />

    <BuyPopup
      v-if="showBuyPopup"
      :asset="selectedAssetUpper"
      :address="displayAddressByNetwork"
      :providers="providers"
      :closePopup="toggleVisible.bind(null, 'showBuyPopup', false)"
    />

    <Blur v-if="showPopupButton" @click="togglePopupButton">
      <div class="popup-button">
        <BorderButton
          class="activity-button activity-button--settings popup__button-width"
          iconName="three-dots-vertical"
          @click="togglePopupButton"
        />

        <BorderButton
          v-if="showBuyButton"
          class="activity-button"
          text="assets.buy"
          iconName="plus-pink"
          @click="toggleVisible('showBuyPopup')"
        />
      </div>
    </Blur>

    <NetworkManagement
      v-if="showSelectNetworkPopup"
      :type="selectedNetwork"
      :handlerClose="toggleSelectNetworkPopupVisible"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import HistoryDetailsForm from './HistoryDetailsForm.vue';
import type { NetworkJson } from '@extension-base/types';
import type { HistoryElement } from '@/interfaces/history';
import type { GetAssetPrice, SelectedWallet, GetNetwork } from '@/store';
import type { TokenBalance } from '@extension-base/background/types/types';
import SelectNetworkButton from '@/screens/wallet&asset/SelectNetworkButton.vue';
import NetworkManagementButton from '@/screens/main/NetworkManagementButton.vue';
import ReceiveForm from '@/screens/wallet&asset/ReceiveForm.vue';
import SendForm from '@/screens/wallet&asset/SendForm.vue';
import AssetInfo from '@/screens/wallet&asset/asset/AssetInfo.vue';
import CrossChainForm from '@/screens/wallet&asset/CrossChainForm.vue';
import BuyPopup from '@/screens/wallet&asset/BuyPopup.vue';
import SelectNetworkPopup from '@/screens/wallet&asset/SelectNetworkPopup.vue';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { NETWORK_GROUP } from '@/consts/networks';
import { isNetworkGroup } from '@/helpers/common/index';
import NetworkManagement from '@/screens/wallet&asset/NetworkManagement.vue';

type ShowField = 'showSendForm' | 'showReceiveForm' | 'showCrossChainForm' | 'showBuyPopup';

@Component({
  components: {
    AssetInfo,
    SendForm,
    BuyPopup,
    ReceiveForm,
    CrossChainForm,
    SelectNetworkPopup,
    HistoryDetailsForm,
    SelectNetworkButton,
    NetworkManagementButton,
    NetworkManagement,
  },
})
export default class Asset extends Vue {
  readonly selectNetworkButtonRef = 'selectNetworkButton';

  historyElement: HistoryElement | Record<string, string> | undefined;
  showSendForm = false;
  showReceiveForm = false;
  showCrossChainForm = false;
  showBuyPopup = false;
  showTipPopup = false;
  showSelectNetworkPopup = false;
  filterValue = '';

  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.selectedNetwork) selectedNetwork!: string;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJson[];
  @Getter(NetworksGettersTypes.getAssetPrice) getTokenPrice!: GetAssetPrice;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;

  get showHistoryDetailsForm() {
    return this.historyElement !== undefined;
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
    if (!NETWORK_GROUP.includes(this.selectedNetwork)) return false;

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
    return this.balances.find(({ assetId: id }) => id === this.selectedAssetId)! ?? {};
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
    this.historyElement = undefined;
  }

  toggleSelectNetworkPopupVisible() {
    this.showSelectNetworkPopup = !this.showSelectNetworkPopup;
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
