<template>
  <div class="asset">
    <ContentForm :height="160" :isStaticHeight="true" :bottomRightCorner="true">
      <div class="asset-info">
        <div class="asset__icon">
          <ExternalLogo :name="assetIcon" :width="82" :height="82" />
        </div>

        <div class="asset-info__content" @click="toggleBalanceDetailsPopup">
          <div class="asset__price">
            <div class="asset__price-item asset__price-item-change">
              <span :class="changePriceClasses">{{ priceChangeString }}</span>
              <span>{{ fiatPriceChangeString }}</span>
            </div>
            <span class="asset__price-item">{{ transferableFiatBalanceInNetworkString }}</span>
            <span class="asset__price-item">{{ assetPriceString }}</span>
          </div>
          <div class="asset__balance count-value">{{ countAssetsString }}</div>
          <div class="asset__locked">
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

    <History
      v-else
      :currency="currentCurrency"
      :selectedNetwork="selectedNetworkForHistory"
      @openHistoryDetailsForm="openHistoryDetailsForm"
    />

    <SendForm
      v-if="showSendForm"
      :_selectedNetwork="selectedNetwork"
      :_selectedAssetId="selectedAssetId"
      :closeForm="toggleVisible.bind(null, 'showSendForm', false)"
    />

    <ReceiveForm
      v-if="showReceiveForm"
      :_selectedNetwork="selectedNetwork"
      :selectedAssetId="selectedAssetId"
      :closeForm="toggleVisible.bind(null, 'showReceiveForm', false)"
    />

    <CrossChainForm
      v-if="showCrossChainForm"
      :_originalNetwork="selectedNetwork"
      :_selectedAssetId="selectedAssetId"
      :closeForm="toggleVisible.bind(null, 'showCrossChainForm', false)"
    />

    <HistoryDetailsForm
      v-if="showHistoryDetailsForm"
      :handlerClose="closeHistoryDetailsForm"
      :historyElement="historyElement"
      :assetId="selectedAssetId"
    />

    <BalanceDetailsPopup
      v-if="showBalanceDetailsPopup"
      :network="selectedNetwork"
      :currency="currentCurrency"
      :assetPrice="assetPrice"
      :closePopup="toggleBalanceDetailsPopup"
    />

    <BuyPopup
      v-if="showBuyPopup"
      :asset="selectedAssetUpper"
      :address="displayAddressByNetwork"
      :providers="providers"
      :closePopup="toggleVisible.bind(null, 'showBuyPopup', false)"
    />

    <Blur v-if="showTipPopup" @click="toggleTipPopup">
      <div class="popup-tip" :style="iconPosition">
        <div class="controls">
          <NetworkManagementButton
            classes="background-ellipse"
            :isGroupIcon="isGroupIcon"
            :icon="selectedNetworkIcon"
            :selectedNetwork="selectedNetwork"
            @onToggle="toggleSelectNetworkPopupVisible"
          />

          <Icon icon="close" class="icon__close" @click.stop="toggleTipPopup" />
        </div>

        <div class="icon-arrow-tip">
          <Icon icon="arrow-tip" width="120" height="100" />
          <span class="popup-tip__message">{{ $t('assets.networkManagementTip') }}</span>
        </div>
      </div>
    </Blur>

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
    <Tooltip text="common.networkManagement" target=".select-network-button" placement="bottom" />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter, Mutation } from 'vuex-class';
import { getNativeAssetName } from '@extension-base/background/utils/utils';
import HistoryDetailsForm from './HistoryDetailsForm.vue';
import History from './History.vue';
import Networks from './Networks.vue';
import type { HistoryElement } from '@/interfaces/history';
import type { AssetTipDataProps, GetAssetPrice, SelectedWallet } from '@/store';
import SelectNetworkButton from '@/screens/wallet&asset/SelectNetworkButton.vue';
import NetworkManagementButton from '@/screens/main/NetworkManagementButton.vue';
import ReceiveForm from '@/screens/wallet&asset/ReceiveForm.vue';
import Blur from '@/components/Blur.vue';
import SendForm from '@/screens/wallet&asset/SendForm.vue';
import CrossChainForm from '@/screens/wallet&asset/CrossChainForm.vue';
import BuyPopup from '@/screens/wallet&asset/BuyPopup.vue';
import BalanceDetailsPopup from '@/screens/wallet&asset/BalanceDetailsPopup.vue';
import SelectNetworkPopup from '@/screens/wallet&asset/SelectNetworkPopup.vue';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { Components } from '@/router/routes';
import { NETWORK_GROUP } from '@/consts/networks';
import { isSora } from '@/helpers';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { NetworkJson } from '@/extension/background/extension-base/src/types';
import { getSummaryLockedBalance, isNetworkGroup } from '@/helpers/common/index';
import NetworkManagement from '@/screens/wallet&asset/NetworkManagement.vue';
import { ONE_WEEK } from '@/consts/global';
import { getSummaryTransferableBalanceFilteredByActiveNetworks } from '@/helpers/currencies';

type ShowField = 'showSendForm' | 'showReceiveForm' | 'showCrossChainForm' | 'showBuyPopup';
type ControlButtons = {
  class: string;
  text: string;
  icon: string;
  formName: ShowField;
  isActive: boolean;
};
@Component({
  components: {
    Blur,
    History,
    Networks,
    SendForm,
    BuyPopup,
    ReceiveForm,
    CrossChainForm,
    SelectNetworkPopup,
    HistoryDetailsForm,
    BalanceDetailsPopup,
    SelectNetworkButton,
    NetworkManagementButton,
    NetworkManagement,
  },
})
export default class Asset extends Vue {
  readonly selectNetworkButtonRef = 'selectNetworkButton';
  readonly basicButtons: ControlButtons[] = [
    {
      class: 'activity-button',
      text: 'assets.sendButtonText',
      icon: 'send',
      formName: 'showSendForm',
      isActive: true,
    },
    {
      class: 'activity-button',
      text: 'assets.receiveButtonText',
      icon: 'receive',
      formName: 'showReceiveForm',
      isActive: true,
    },
  ];
  historyElement: HistoryElement | Record<string, string> = {};
  showSendForm = false;
  showReceiveForm = false;
  showCrossChainForm = false;
  showBuyPopup = false;
  showPopupButton = false;
  showTipPopup = false;
  showHistoryDetailsForm = false;
  showSelectNetworkPopup = false;
  showBalanceDetailsPopup = false;
  filterValue = '';

  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getSelectedNetwork) selectedNetwork!: string;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getAssetTipData) getAssetTipData!: AssetTipDataProps;
  @Getter(AccountsGettersTypes.getAssetPageNetwork) assetPageNetwork!: string;

  @Getter(AccountsGettersTypes.isOnline) isOnline!: boolean;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJson[];
  @Getter(NetworksGettersTypes.getAssetPrice) getTokenPrice!: GetAssetPrice;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: (value: string) => NetworkJson;
  @Mutation(AccountsMutationTypes.SET_ASSET_TIP_STATE) setAssetTipData!: (props: AssetTipDataProps) => void;
  @Mutation(AccountsMutationTypes.SET_ASSET_PAGE_NETWORK) setAssetPageNetwork!: (props: string) => void;

  get isGroupIcon() {
    return isNetworkGroup(this.selectedNetwork);
  }

  get selectedNetworkIcon() {
    if (this.isGroupIcon) return 'all-networks';

    return this.getNetwork(this.selectedNetwork).icon;
  }

  get showShimmers() {
    return !this.isOnline || !this.balances.length || !this.currentNetwork || this.currentNetwork?.state === 'pending';
  }

  get isNeedPopupButton() {
    return this.showCrossChainButton && this.showBuyButton && this.showSwapButton;
  }

  get selectedNetworkForHistory() {
    if (!NETWORK_GROUP.includes(this.selectedNetwork)) return this.selectedNetwork;

    return this.assetPageNetwork;
  }

  get isSelectedNetworkHistory() {
    if (!NETWORK_GROUP.includes(this.selectedNetwork)) return false;

    return this.assetPageNetwork === '';
  }

  get getPrice() {
    return this.getAssetPrice(this.currentCurrency.priceId ?? '0');
  }

  get priceChangeString() {
    return this.$n(this.getPrice.priceChange, 'percent');
  }

  get fiatPriceChangeString() {
    return `(${this.fiatSymbol}${this.$n(this.transferableFiatBalance * this.getPrice.priceChange, 'price')})`;
  }

  get assetIcon() {
    return this.currentCurrency.icon;
  }

  get providers() {
    return this.currentCurrency.providers ?? [];
  }

  get showCrossChainButton() {
    const network = this.networks.find(
      ({ name }) => name.toLowerCase() === this.selectedNetworkForHistory?.toLowerCase()
    )!;

    const asset = getNativeAssetName(this.selectedAsset);
    if (!network.xcm) return false;

    return network.xcm.availableAssets.some((assetName) => assetName.toLowerCase() === asset);
  }

  mounted() {
    this.showAssetTipPopup();
  }

  showAssetTipPopup() {
    const { count, time } = this.getAssetTipData;

    if (count >= 2) {
      this.showTipPopup = false;

      return;
    }

    if (time === 0) {
      this.showTipPopup = true;

      return;
    }

    const now = Date.now();

    if (now < time) {
      this.showTipPopup = false;

      return;
    }

    this.showTipPopup = true;
  }

  get showSwapButton() {
    return isSora(this.selectedNetwork) && !this.selectedWallet.isMobile;
  }

  get currentNetwork() {
    return this.currentCurrency.balances?.find(
      ({ name }) => name.toLowerCase() === this.selectedNetwork?.toLowerCase()
    );
  }

  get isMainNetwork() {
    return this.currentNetwork && this.currentNetwork.name === this.mainNetwork;
  }

  get mainNetwork() {
    const currency = this.currentCurrency.balances?.find((network) => network.isUtility || network.isNative);

    return currency ? currency.name : '';
  }

  get showBuyButton() {
    return this.providers.length !== 0 && this.mainNetwork?.toLowerCase() === this.selectedNetwork?.toLowerCase();
  }

  get currentCurrency() {
    return this.balances.find(({ assetId: id }) => id === this.selectedAssetId)! ?? {};
  }

  get displayAddressByNetwork() {
    if (this.isSelectedNetworkHistory) return BaseApi.formatAddress(this.selectedWallet, this.mainNetwork);

    return BaseApi.formatAddress(this.selectedWallet, this.selectedNetwork);
  }

  get assetPriceString() {
    return `1 ${this.selectedAssetUpper} = ${this.fiatSymbol}${this.$n(this.assetPrice.price, 'price')}`;
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

  get countAssetsString() {
    if (!this.currentCurrency) return `0 ${this.selectedAssetUpper}`;

    const total = this.$n(this.transferableAssetBalance, 'decimal');

    return `${total} ${this.selectedAssetUpper}`;
  }

  get lockedBalanceString() {
    const lockedBalance = getSummaryLockedBalance(this.currentCurrency);

    return `${this.$n(lockedBalance, 'price')} ${this.selectedAssetUpper}`;
  }

  get changePriceClasses() {
    const classes = ['price-change'];

    if (this.getPrice.priceChange > 0) classes.push('up-price');
    else if (this.getPrice.priceChange < 0) classes.push('down-price');

    return classes;
  }

  get transferableAssetBalance() {
    return +getSummaryTransferableBalanceFilteredByActiveNetworks(this.currentCurrency, this.selectedNetwork);
  }

  get transferableFiatBalance() {
    return this.transferableAssetBalance * this.assetPrice.price;
  }

  get transferableFiatBalanceInNetworkString() {
    if (!this.currentCurrency) return `${this.fiatSymbol} 0`;

    return `${this.fiatSymbol} ${this.$n(this.transferableFiatBalance, 'price')}`;
  }

  toggleVisible(field: ShowField, value = true) {
    this[field] = value;
  }

  handlerFilter(value: string) {
    this.filterValue = value;
  }

  openHistoryDetailsForm(historyElement: HistoryElement) {
    this.showHistoryDetailsForm = true;
    this.historyElement = historyElement;
  }

  closeHistoryDetailsForm() {
    this.showHistoryDetailsForm = false;
    this.historyElement = {};
  }

  selectNetworkHistory(name: string) {
    this.setAssetPageNetwork(name);
  }

  toggleBalanceDetailsPopup() {
    if (this.showShimmers) {
      this.showBalanceDetailsPopup = false;

      return;
    }

    this.showBalanceDetailsPopup = !this.showBalanceDetailsPopup;
  }

  togglePopupButton() {
    this.showPopupButton = !this.showPopupButton;
  }

  toggleTipPopup() {
    this.showTipPopup = !this.showTipPopup;

    this.setAssetTipData({ count: +this.getAssetTipData.count + 1, time: Date.now() + ONE_WEEK });
  }

  toggleSelectNetworkPopupVisible() {
    if (this.showTipPopup === true) this.toggleTipPopup();
    this.showSelectNetworkPopup = !this.showSelectNetworkPopup;
  }

  openSoraSwap() {
    this.$router.push({
      name: Components.SoraSwap,
      params: {
        assetId: this.selectedAssetId,
        reset: '',
      },
    });
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

  .asset-info {
    display: flex;
    align-items: center;
    height: 100%;
    gap: 20px;

    .asset__icon {
      background: $secondary-background-color;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 14px;
      margin: 16px;
    }

    .asset-info__content {
      display: flex;
      justify-content: space-between;
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
      &:hover {
        cursor: pointer;
      }
      .asset__price {
        display: flex;
        flex-flow: row nowrap;
        font-family: Sora;
        color: $gray-color;
        line-height: 1px;

        .asset__price-item {
          font-size: 12px;
          font-weight: 400;
          border-right: solid 1px transparent;
          padding: 4px;
        }
        .asset__price-item-change {
          display: flex;
          flex-flow: row nowrap;
          gap: 4px;
        }
        & > :not(:last-child) {
          border-right: solid 1px $gray-color;
          line-height: 1px;
        }

        > :first-child {
          padding-left: 0px;
        }
      }
      .asset__balance {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 24px;
        font-style: normal;
        font-weight: 700;
      }
      .asset__locked-content {
        display: flex;
        gap: 6px;
        align-items: center;
        .asset__locked-title {
          color: $default-white;
        }
        .details-icon {
          width: 14px;
          height: 14px;
          min-height: 14px;
          min-width: 14px;
          color: $grayish-white;

          &:hover {
            color: $default-white;
          }
        }
      }
    }
  }
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
  .popup-button {
    position: absolute;
    display: flex;
    flex-flow: column;
    align-items: flex-end;
    top: 250px;
    left: 465px;
    height: 100px;
    gap: 10px;

    .popup__button-width {
      width: 42px;
    }
  }

  .activity {
    display: flex;
    justify-content: space-between;
    gap: 5px;

    .activity-button {
      flex-grow: 1;

      &:first-child {
        margin-left: 0;
      }

      &--settings {
        flex-grow: 0;
        margin: 0;
      }
    }
  }
}
</style>
