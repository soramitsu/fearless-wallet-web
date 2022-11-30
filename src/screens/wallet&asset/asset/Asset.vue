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
        text="asset.sendButtonText"
        iconName="send"
        @click="toggleVisible('showSendForm', true)"
      />

      <BorderButton
        class="activity-button"
        text="asset.receiveButtonText"
        iconName="receive"
        @click="toggleVisible('showReceiveForm', true)"
      />

      <BorderButton
        class="activity-button"
        text="asset.teleportButtonText"
        iconName="teleport"
        @click="toggleVisible('showTeleportForm', true)"
      />

      <BorderButton
        v-if="showBuyButton"
        class="activity-button"
        text="asset.buy"
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

    <SelectNetworkPopup
      v-if="showSelectNetworkPopup"
      :selectedNetwork="selectedNetwork"
      :height="410"
      :allNetworksItem="false"
      :relayChain="relayChain"
      :toggleSelectedNetwork="toggleSelectedNetwork"
      :handlerClose="toggleSelectNetworkPopupVisible"
    />

    <HistoryDetailsForm
      v-if="showHistoryDetailsForm"
      :handlerClose="closeHistoryDetailsForm"
      :historyNode="historyNode"
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
import type { HistoryNode } from '@/interfaces/history';
import type { GetAssetName } from '@/store/networks/types';
import SelectNetworkButton from '@/screens/wallet&asset/SelectNetworkButton.vue';
import ReceiveForm from '@/screens/wallet&asset/ReceiveForm.vue';
import SendForm from '@/screens/wallet&asset/SendForm.vue';
import TeleportForm from '@/screens/wallet&asset/TeleportForm.vue';
import BuyPopup from '@/screens/wallet&asset/BuyPopup.vue';
import BalanceDetailsPopup from '@/screens/wallet&asset/BalanceDetailsPopup.vue';
import SelectNetworkPopup from '@/screens/wallet&asset/SelectNetworkPopup.vue';
import BaseApi from '@/util/BaseApi';
import { Currencies } from '@/interfaces/currencies';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { Components } from '@/router/routes';
import { formattedNumber, formattedPrice } from '@/helpers/numbers';
import Tooltip from '@/components/Tooltip.vue';
import { GetNetworkStatus } from '@/store/networks/types';

type ShowField = 'showSendForm' | 'showReceiveForm' | 'showTeleportForm' | 'showBuyPopup';

@Component({
  components: {
    History,
    Tooltip,
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

  historyNode: HistoryNode | Record<string, string> = {};
  showSendForm = false;
  showReceiveForm = false;
  showTeleportForm = false;
  showBuyPopup = false;
  showHistoryDetailsForm = false;
  showSelectNetworkPopup = false;
  showBalanceDetailsPopup = false;

  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;
  @Getter(NetworksGettersTypes.getAssetName) getAssetName!: GetAssetName;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getNetworkStatus) getNetworkStatus!: GetNetworkStatus;
  @Getter(AccountsGettersTypes.getOnlineStatus) isOnline!: boolean;

  get showShimmers() {
    const status = this.getNetworkStatus(this.selectedNetwork);

    return !this.isOnline || status === 'pending';
  }

  get providers() {
    return this.currentCurrency?.providers ?? [];
  }

  get relayChain() {
    return this.currentCurrency?.relayChain;
  }

  get showBuyButton() {
    return this.providers.length !== 0 && this.currentCurrency?.mainNetwork === this.selectedNetwork;
  }

  get currentCurrency() {
    return this.currencies.find(({ assetId }) => assetId === this.selectedAssetId);
  }

  get displayAddressByNetwork() {
    return BaseApi.getDisplayAddressByNetwork(this.selectedWallet, this.selectedNetwork);
  }

  get assetPriceString() {
    return `1 ${this.selectedAssetUpper} = ${this.fiatSymbol}${formattedPrice(this.price ?? 0)}`;
  }

  get selectedNetwork() {
    return this.$route.params.network;
  }

  get selectedAssetId() {
    return this.$route.params.assetId;
  }

  get selectedAssetUpper() {
    return this.getAssetName(this.selectedAssetId).toUpperCase();
  }

  get price() {
    return this.currentCurrency?.price;
  }

  get countAssetsString() {
    if (!this.currentCurrency) return `${this.selectedAssetUpper} 0`;

    const totalCountAssets = +this.currentCurrency.getTotalCountAssets(this.selectedWallet, this.selectedNetwork);
    const total = formattedNumber(totalCountAssets, {
      decimalsValue: 4,
      returnOriginNumber: false,
      removeTrailingZeros: true,
    });

    return `${this.selectedAssetUpper} ${total}`;
  }

  get balanceInNetworkString() {
    if (!this.currentCurrency) return `$ 0`;

    const total = this.currentCurrency.getTotalBalance(this.selectedWallet, this.selectedNetwork);

    return `${this.fiatSymbol} ${formattedNumber(+total)}`;
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
  }

  toggleVisible(field: ShowField, value: boolean) {
    this[field] = value;
  }

  openHistoryDetailsForm(historyNode: HistoryNode) {
    this.showHistoryDetailsForm = true;
    this.historyNode = historyNode;
  }

  closeHistoryDetailsForm() {
    this.showHistoryDetailsForm = false;
    this.historyNode = {};
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
