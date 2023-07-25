<template>
  <div class="asset">
    <ContentForm :height="160" :bottomRightCorner="true">
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
    <div v-if="isMainNetwork" class="activity">
      <BorderButton
        class="activity-button"
        text="assets.sendButtonText"
        iconName="send"
        @click="toggleVisible('showSendForm')"
      />

      <BorderButton
        class="activity-button"
        text="assets.receiveButtonText"
        iconName="receive"
        @click="toggleVisible('showReceiveForm')"
      />

      <BorderButton
        v-if="showCrossChainButton"
        class="activity-button"
        text="assets.crossChain"
        iconName="cross-chain"
        @click="toggleVisible('showCrossChainForm')"
      />

      <BorderButton
        v-if="showBuyButton"
        class="activity-button"
        text="assets.buy"
        iconName="plus-pink"
        @click="toggleVisible('showBuyPopup')"
      />

      <BorderButton
        v-if="showSwapButton"
        class="activity-button"
        text="assets.swap"
        iconName="swap"
        @click="openSoraSwap"
      />

      <BorderButton
        v-if="isMainNetwork"
        class="activity-button activity-button--settings"
        iconName="three-dots-vertical"
        @click="() => {}"
      />
    </div>

    <Networks
      v-if="isSelectedNetworkGroup"
      :currency="currentCurrency"
      @openHistoryDetailsForm="openHistoryDetailsForm"
    />

    <History v-else :currency="currentCurrency" @openHistoryDetailsForm="openHistoryDetailsForm" />

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

    <BuyPopup
      v-if="showBuyPopup"
      :asset="selectedAssetUpper"
      :address="displayAddressByNetwork"
      :providers="providers"
      :closePopup="toggleVisible.bind(null, 'showBuyPopup', false)"
    />

    <SelectPopup
      v-if="showSelectNetworkPopup"
      sizeWidth="big"
      placeholder="common.searchNetwork"
      verticalPlacement="top"
      horizontalPlacement="right"
      :value="selectedNetwork"
      :showBlur="true"
      :showBackground="true"
      :height="410"
      :top="105"
      :left="0"
      :options="optionsNetworks"
      :handlerFilter="handlerFilter"
      :toggleValue="toggleSelectedNetwork"
      :handlerClose="toggleSelectNetworkPopupVisible"
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

    <Tooltip text="common.networkManagement" target=".select-network-button" placement="bottom" />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { getNativeAssetName } from '@extension-base/background/utils/utils';
import HistoryDetailsForm from './HistoryDetailsForm.vue';
import History from './History.vue';
import Networks from './Networks.vue';
import type { HistoryElement } from '@/interfaces/history';
import type { GetAssetPrice, SelectedWallet } from '@/store';
import SelectNetworkButton from '@/screens/wallet&asset/SelectNetworkButton.vue';
import ReceiveForm from '@/screens/wallet&asset/ReceiveForm.vue';
import SendForm from '@/screens/wallet&asset/SendForm.vue';
import CrossChainForm from '@/screens/wallet&asset/CrossChainForm.vue';
import BuyPopup from '@/screens/wallet&asset/BuyPopup.vue';
import BalanceDetailsPopup from '@/screens/wallet&asset/BalanceDetailsPopup.vue';
import SelectNetworkPopup from '@/screens/wallet&asset/SelectNetworkPopup.vue';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { Components } from '@/router/routes';
import { ETHEREUM_NETWORKS, NETWORK_GROUP } from '@/consts/networks';
import { firstCharToUp, isSora } from '@/helpers';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { NetworkJson } from '@/extension/background/extension-base/src/types';
import { getSummaryLockedBalance, getSummaryTransferableBalance } from '@/helpers/common/index';

type ShowField = 'showSendForm' | 'showReceiveForm' | 'showCrossChainForm' | 'showBuyPopup';

@Component({
  components: {
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
  },
})
export default class Asset extends Vue {
  readonly selectNetworkButtonRef = 'selectNetworkButton';

  historyElement: HistoryElement | Record<string, string> = {};
  showSendForm = false;
  showReceiveForm = false;
  showCrossChainForm = false;
  showBuyPopup = false;
  showHistoryDetailsForm = false;
  showSelectNetworkPopup = false;
  showBalanceDetailsPopup = false;
  filterValue = '';

  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getSelectedNetwork) selectedNetwork!: string;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.isOnline) isOnline!: boolean;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJson[];
  @Getter(NetworksGettersTypes.getAssetPrice) getTokenPrice!: GetAssetPrice;

  get showShimmers() {
    return !this.isOnline || !this.balances.length || !this.currentNetwork || this.currentNetwork?.state === 'pending';
  }

  get isSelectedNetworkGroup() {
    return NETWORK_GROUP.includes(this.selectedNetwork);
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
    const network = this.networks.find(({ name }) => name.toLowerCase() === this.selectedNetwork?.toLowerCase())!;

    const asset = getNativeAssetName(this.selectedAsset);

    return network?.xcm?.availableAssets.some((assetName) => assetName.toLowerCase() === asset);
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
    if (this.isSelectedNetworkGroup) return BaseApi.formatAddress(this.selectedWallet, this.mainNetwork);

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
    return +getSummaryTransferableBalance(this.currentCurrency, this.selectedNetwork);
  }

  get transferableFiatBalance() {
    return this.transferableAssetBalance * this.assetPrice.price;
  }

  get transferableFiatBalanceInNetworkString() {
    if (!this.currentCurrency) return `${this.fiatSymbol} 0`;

    return `${this.fiatSymbol} ${this.$n(this.transferableFiatBalance, 'price')}`;
  }

  get optionsNetworks() {
    const haveEthereumAccount = this.selectedWallet.ethereumAddress !== '';
    const walletBalance = (this.currentCurrency?.balances ?? []).filter(({ name }) =>
      ETHEREUM_NETWORKS.includes(name) ? haveEthereumAccount : true
    );
    const filter = this.filterValue.trim().toLowerCase();

    return walletBalance
      .map(({ name, type, icon }) => {
        return {
          name: firstCharToUp(name),
          value: name,
          icon,
          type,
        };
      })
      .filter(({ value }) => {
        return value.toLowerCase().includes(filter);
      });
  }

  toggleSelectedNetwork(network: string) {
    if (this.selectedNetwork === network) return;

    this.$router.push({
      name: Components.Asset,
      params: {
        assetId: this.selectedAssetId,
        network: network,
      },
    });

    this.toggleSelectNetworkPopupVisible();
  }

  toggleSelectNetworkPopupVisible() {
    const targetElement = (this.$refs[this.selectNetworkButtonRef] as Vue).$el as HTMLElement;

    this.showSelectNetworkPopup = !this.showSelectNetworkPopup;

    targetElement.style.zIndex = this.showSelectNetworkPopup ? '400' : '0';

    this.filterValue = '';
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

  toggleBalanceDetailsPopup() {
    if (this.showShimmers) {
      this.showBalanceDetailsPopup = false;

      return;
    }

    this.showBalanceDetailsPopup = !this.showBalanceDetailsPopup;
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
