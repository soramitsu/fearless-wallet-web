<template>
  <div class="asset">
    <div class="asset-header">
      <div class="descriptions" @click="toggleBalanceDetailsPopup">
        <Shimmer v-if="showShimmers" height="32px" width="140px" />

        <div v-else class="count-assets">
          <div class="count-value">{{ countAssetsString }}</div>

          <Icon icon="info" class="details-icon" />
        </div>
        <div class="balance-in-network">{{ balanceInNetworkString }}</div>

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

      <!-- <BorderButton
        class="activity-button"
        text="assets.teleportButtonText"
        iconName="teleport"
        @click="toggleVisible('showTeleportForm', true)"
      /> -->

      <BorderButton
        v-if="showBuyButton"
        class="activity-button"
        text="assets.buy"
        iconName="plus-pink"
        @click="toggleVisible('showBuyPopup', true)"
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

    <TeleportForm
      v-if="showTeleportForm"
      :_originalNetwork="selectedNetwork"
      :_selectedAssetId="selectedAssetId"
      :closeForm="toggleVisible.bind(null, 'showTeleportForm', false)"
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
      :closePopup="toggleBalanceDetailsPopup"
    />

    <Tooltip text="common.networkManagement" target=".select-network-button" placement="bottom" />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import HistoryDetailsForm from './HistoryDetailsForm.vue';
import History from './History.vue';
import type { HistoryElement } from '@/interfaces/history';
import type { GetAssetName, GetAssetPrice, SelectedWallet } from '@/store';
import SelectNetworkButton from '@/screens/wallet&asset/SelectNetworkButton.vue';
import ReceiveForm from '@/screens/wallet&asset/ReceiveForm.vue';
import SendForm from '@/screens/wallet&asset/SendForm.vue';
import TeleportForm from '@/screens/wallet&asset/TeleportForm.vue';
import BuyPopup from '@/screens/wallet&asset/BuyPopup.vue';
import BalanceDetailsPopup from '@/screens/wallet&asset/BalanceDetailsPopup.vue';
import SelectNetworkPopup from '@/screens/wallet&asset/SelectNetworkPopup.vue';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { Components } from '@/router/routes';
import { tieAccount } from '@/extension/messaging';
import { ALL_NETWORKS, ETHEREUM_NETWORKS } from '@/consts/networks';
import { firstCharToUp } from '@/helpers/common';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types';
import { NetworkJsonOld } from '@/extension/background/extension-base/src/types';
import { getTotalBalance, getTotalCountAssets } from '@/helpers/currencies';
import { AssetPrice } from '@/interfaces';

type ShowField = 'showSendForm' | 'showReceiveForm' | 'showTeleportForm' | 'showBuyPopup';

@Component({
  components: {
    History,
    SendForm,
    BuyPopup,
    ReceiveForm,
    TeleportForm,
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
  showTeleportForm = false;
  showBuyPopup = false;
  showHistoryDetailsForm = false;
  showSelectNetworkPopup = false;
  showBalanceDetailsPopup = false;
  filterValue = '';
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: (value: string) => NetworkJsonOld;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;

  @Getter(AccountsGettersTypes.getOnlineStatus) isOnline!: boolean;

  get showShimmers() {
    return !this.isOnline || !this.currentNetwork || this.currentNetwork.state === 'pending';
  }

  get providers() {
    return (
      this.getNetwork(this.selectedNetwork).assets.find((el) => el.purchaseProviders?.length)?.purchaseProviders ?? []
    );
  }

  // get relayChain() {
  //   return this.currentCurrency?.relayChain;
  // }

  get currentNetwork() {
    return this.currentCurrency.balances.find((el) => el.name.toLowerCase() === this.selectedNetwork.toLowerCase());
  }

  get mainNetwork() {
    return this.currentCurrency.balances.find((network) => network.isUtility || network.isNative)!.name;
  }

  get showBuyButton() {
    return this.providers.length !== 0 && this.mainNetwork.toLowerCase() === this.selectedNetwork.toLowerCase();
  }

  get currentCurrency() {
    return this.balances.find(({ id }) => id === this.selectedAssetId)!;
  }

  get displayAddressByNetwork() {
    return BaseApi.getDisplayAddressByNetwork(this.selectedWallet, this.selectedNetwork);
  }

  get assetPriceString() {
    return `1 ${this.selectedAssetUpper} = ${this.fiatSymbol}${this.$n(this.assetPrice.price, 'price')}`;
  }

  get selectedNetwork() {
    return this.$route.params.network;
  }

  get selectedAssetId() {
    return this.$route.params.assetId;
  }

  get selectedAssetUpper() {
    return this.currentCurrency.name.toUpperCase();
  }

  get assetPrice(): AssetPrice {
    return this.getAssetPrice(this.currentCurrency.priceId);
  }

  get countAssetsString() {
    if (!this.currentCurrency) return `${this.selectedAssetUpper} 0`;

    const totalCountAssets = +getTotalCountAssets(this.currentCurrency, this.selectedNetwork);
    const total = this.$n(totalCountAssets, 'decimal');

    return `${this.selectedAssetUpper} ${total}`;
  }

  get balanceInNetworkString() {
    if (!this.currentCurrency) return `${this.fiatSymbol} 0`;

    const total = +getTotalBalance(this.currentCurrency, this.selectedNetwork);

    return `${this.fiatSymbol} ${this.$n(total, 'price')}`;
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
        return value.includes(filter);
      });
  }

  toggleSelectedNetwork(network: string) {
    if (this.selectedNetwork === network) return;

    const prepNetwork = network === ALL_NETWORKS ? null : `0x${this.getNetwork(network).chainId}`;

    tieAccount(this.selectedWallet.address, prepNetwork);

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
          opacity: 0.5;
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
      width: 125px;

      &:first-child {
        margin-left: 0;
      }
    }
  }
}
</style>
