<template>
  <div class="asset">
    <div class="asset-header">
      <div class="descriptions" @click="toggleBalanceDetailsPopup">
        <Shimmer v-if="showShimmers" height="32px" width="140px" />

        <div v-else class="count-assets">
          <div class="count-value">{{ countAssetsString }}</div>

          <Icon icon="info" class="details-icon" />
        </div>
        <div class="balance-in-network">{{ transferableFiatBalanceInNetworkString }}</div>

        <div class="price">{{ assetPriceString }}</div>
      </div>

      <SelectNetworkButton
        :ref="selectNetworkButtonRef"
        :text="selectedNetwork"
        :isActive="showSelectNetworkPopup"
        @openNetworkPopup="toggleSelectNetworkPopupVisible"
      />
    </div>

    <div class="activity">
      <BorderButton
        class="activity-button"
        text="assets.sendButtonText"
        iconName="send"
        @click="toggleVisible('showSendForm', true)"
      />

      <BorderButton
        class="activity-button"
        text="assets.receiveButtonText"
        iconName="receive"
        @click="toggleVisible('showReceiveForm', true)"
      />

      <BorderButton
        v-if="showCrossChainButton"
        class="activity-button"
        text="assets.crossChain"
        iconName="cross-chain"
        @click="toggleVisible('showCrossChainForm', true)"
      />

      <BorderButton
        v-if="showBuyButton"
        class="activity-button"
        text="assets.buy"
        iconName="plus-pink"
        @click="toggleVisible('showBuyPopup', true)"
      />

      <BorderButton
        v-if="showSwapButton"
        class="activity-button"
        text="assets.swap"
        iconName="swap"
        @click="openSoraSwap"
      />
    </div>

    <History :currency="currentCurrency" @openHistoryDetailsForm="openHistoryDetailsForm" />

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
import { ETHEREUM_NETWORKS } from '@/consts/networks';
import { firstCharToUp, isSora } from '@/helpers/common';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { getSummaryTransferableBalance } from '@/helpers/currencies';
import { NetworkJson } from '@/extension/background/extension-base/src/types';

type ShowField = 'showSendForm' | 'showReceiveForm' | 'showCrossChainForm' | 'showBuyPopup';

@Component({
  components: {
    History,
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
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.isOnline) isOnline!: boolean;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJson[];

  get showShimmers() {
    return !this.isOnline || !this.balances.length || !this.currentNetwork || this.currentNetwork?.state === 'pending';
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

  get mainNetwork() {
    return this.currentCurrency.balances?.find((network) => network.isUtility || network.isNative)!.name ?? '';
  }

  get showBuyButton() {
    return this.providers.length !== 0 && this.mainNetwork?.toLowerCase() === this.selectedNetwork?.toLowerCase();
  }

  get currentCurrency() {
    return this.balances.find(({ assetId: id }) => id === this.selectedAssetId)! ?? {};
  }

  get displayAddressByNetwork() {
    return BaseApi.formatAddress(this.selectedWallet, this.selectedNetwork);
  }

  get assetPriceString() {
    return `1 ${this.selectedAssetUpper} = ${this.fiatSymbol}${this.$n(this.assetPrice.price, 'price')}`;
  }

  get selectedNetwork() {
    return this.$route.params.network ?? '';
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
    if (!this.currentCurrency) return `${this.selectedAssetUpper} 0`;

    const totalCountAssets = +getSummaryTransferableBalance(this.currentCurrency, this.selectedNetwork);
    const total = this.$n(totalCountAssets, 'decimal');

    return `${this.selectedAssetUpper} ${total}`;
  }

  get transferableAssetBalance() {
    return this.currentCurrency?.balances?.reduce((result, { transferable }) => {
      if (transferable) return result + +transferable;
      else return result;
    }, 0);
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

  toggleVisible(field: ShowField, value: boolean) {
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
  width: 100%;
  height: 450px;

  .asset-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 16px;

    .descriptions {
      display: flex;
      justify-content: space-between;
      flex-direction: column;
      align-items: flex-start;
      height: 70px;

      &:hover {
        cursor: pointer;
      }

      .count-assets {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: 600;
        font-size: 28px;
        text-align: left;
        max-width: 265px;
        height: 32px;

        .count-value {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .details-icon {
          width: 18px;
          height: 18px;
          min-height: 18px;
          min-width: 18px;
          margin-left: 10px;
          color: $grayish-white;

          &:hover {
            color: $default-white;
          }
        }
      }

      .balance-in-network {
        color: $gray-color;
      }

      .price {
        color: $gray-color;
        font-size: 12px;
        line-height: 15px;
      }
    }
  }

  .activity {
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;

    .activity-button {
      flex-grow: 1;
      margin-left: 5px;

      &:first-child {
        margin-left: 0;
      }
    }
  }
}
</style>
