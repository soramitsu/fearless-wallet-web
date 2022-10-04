<template>
  <div class="token">
    <div class="token-header">
      <div class="descriptions">
        <div class="count-tokens">{{ countTokensString }}</div>
        <div class="balance-in-network">{{ balanceInNetworkString }}</div>
        <div class="price">{{ tokenPriceString }}</div>
      </div>

      <SelectNetworkButton
        :ref="selectNetworkButtonRef"
        :text="selectedNetwork"
        :isActive="showSelectNetworkPopup"
        @click="toggleSelectNetworkPopupVisible"
      />
    </div>

    <div class="activity">
      <BorderButton class="activity-button" text="Send" iconName="send" @click="toggleVisible('showSendForm', true)" />

      <BorderButton
        class="activity-button"
        text="Receive"
        iconName="receive"
        @click="toggleVisible('showReceiveForm', true)"
      />

      <BorderButton
        class="activity-button"
        text="Teleport"
        iconName="teleport"
        @click="toggleVisible('showTeleportForm', true)"
      />

      <BorderButton
        v-if="showBuyButton"
        class="activity-button"
        text="Buy"
        iconName="plus-pink"
        @click="toggleVisible('showBuyPopup', true)"
      />
    </div>

    <History :currency="currentCurrency" @openHistoryDetailsPopup="openHistoryDetailsPopup" />

    <SendForm
      v-if="showSendForm"
      :_selectedNetwork="selectedNetwork"
      :_selectedTokenId="selectedTokenId"
      :closeForm="toggleVisible.bind(null, 'showSendForm', false)"
    />

    <ReceiveForm
      v-if="showReceiveForm"
      :selectedNetwork="selectedNetwork"
      :closeForm="toggleVisible.bind(null, 'showReceiveForm', false)"
    />

    <TeleportForm
      v-if="showTeleportForm"
      :_originalNetwork="selectedNetwork"
      :_selectedTokenId="selectedTokenId"
      :closeForm="toggleVisible.bind(null, 'showTeleportForm', false)"
    />

    <BuyPopup
      v-if="showBuyPopup"
      :token="selectedToken"
      :address="displayAddressByNetwork"
      :providers="providers"
      :closePopup="toggleVisible.bind(null, 'showBuyPopup', false)"
    />

    <SelectNetworkPopup
      v-if="showSelectNetworkPopup"
      v-model="selectedNetwork"
      :relayChain="relayChain"
      :toggleSelectedNetwork="toggleSelectedNetwork"
      :handlerClose="toggleSelectNetworkPopupVisible"
    />

    <HistoryDetailsPopup
      v-if="showHistoryDetailsPopup"
      :handlerClose="closeHistoryDetailsPopup"
      :historyNode="historyNode"
      :tokenId="selectedTokenId"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import SelectNetworkButton from '../SelectNetworkButton.vue';
import ReceiveForm from '../ReceiveForm.vue';
import SendForm from '../SendForm.vue';
import TeleportForm from '../TeleportForm.vue';
import BuyPopup from '../BuyPopup.vue';
import SelectNetworkPopup from '../SelectNetworkPopup.vue';
import HistoryDetailsPopup from './HistoryDetailsPopup.vue';
import History from './History.vue';
import type { HistoryNode } from '@/interfaces/history';
import type { GetTokenName } from '@/store/networks/types';
import BorderButton from '@/components/BorderButton.vue';
import TabButton from '@/components/TabButton.vue';
import BaseApi from '@/util/BaseApi';
import { Currencies } from '@/interfaces/currencies';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { Components } from '@/router/routes';
import { formattedNumber, formattedPrice } from '@/helpers/numbers';

type ShowField = 'showSendForm' | 'showReceiveForm' | 'showTeleportForm' | 'showBuyPopup';

@Component({
  components: {
    History,
    SendForm,
    BuyPopup,
    TabButton,
    ReceiveForm,
    TeleportForm,
    BorderButton,
    SelectNetworkPopup,
    HistoryDetailsPopup,
    SelectNetworkButton,
  },
})
export default class Token extends Vue {
  readonly selectNetworkButtonRef = 'selectNetworkButton';

  historyNode: HistoryNode | Record<string, string> = {};
  showSendForm = false;
  showReceiveForm = false;
  showTeleportForm = false;
  showBuyPopup = false;
  showHistoryDetailsPopup = false;
  showSelectNetworkPopup = false;

  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;
  @Getter(NetworksGettersTypes.getTokenName) getTokenName!: GetTokenName;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;

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
    return this.currencies.find(({ tokenId }) => tokenId === this.selectedTokenId);
  }

  get displayAddressByNetwork() {
    return BaseApi.getDisplayAddressByNetwork(this.selectedWallet, this.selectedNetwork);
  }

  get tokenPriceString() {
    return `1 ${this.selectedToken.toUpperCase()} = ${this.fiatSymbol}${formattedPrice(this.price ?? 0)}`;
  }

  get selectedNetwork() {
    return this.$route.params.network;
  }

  get selectedTokenId() {
    return this.$route.params.tokenId;
  }

  get selectedToken() {
    return this.getTokenName(this.selectedTokenId);
  }

  get price() {
    return this.currentCurrency?.price;
  }

  get countTokensString() {
    if (!this.currentCurrency) return `${this.selectedToken.toUpperCase()} 0`;

    const totalCountTokens = +this.currentCurrency.getTotalCountTokensByNetwork(
      this.selectedWallet,
      this.selectedNetwork
    );
    const total = formattedNumber(totalCountTokens, 4, false, true);

    return `${this.selectedToken.toUpperCase()} ${total}`;
  }

  get balanceInNetworkString() {
    if (!this.currentCurrency) return `$ 0`;

    const total = this.currentCurrency.getBalanceInNetwork(this.selectedWallet, this.selectedNetwork);

    return `${this.fiatSymbol} ${formattedNumber(+total)}`;
  }

  toggleSelectedNetwork(network: string) {
    if (this.selectedNetwork === network) return;

    this.$router.push({
      name: Components.Token,
      params: {
        tokenId: this.selectedTokenId,
        network: network,
      },
    });

    this.toggleSelectNetworkPopupVisible();
  }

  toggleSelectNetworkPopupVisible() {
    const targetElement = (this.$refs[this.selectNetworkButtonRef] as Vue).$el as HTMLElement;

    this.showSelectNetworkPopup = !this.showSelectNetworkPopup;

    targetElement.style.zIndex = this.showSelectNetworkPopup ? '200' : '0';
  }

  toggleVisible(field: ShowField, value: boolean) {
    this[field] = value;
  }

  openHistoryDetailsPopup(historyNode: HistoryNode) {
    this.showHistoryDetailsPopup = true;
    this.historyNode = historyNode;
  }

  closeHistoryDetailsPopup() {
    this.showHistoryDetailsPopup = false;
    this.historyNode = {};
  }
}
</script>

<style lang="scss" scoped>
.token {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 450px;

  .token-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 16px;

    .descriptions {
      display: flex;
      justify-content: space-between;
      flex-direction: column;
      align-items: flex-start;
      height: 70px;

      .count-tokens {
        font-weight: 600;
        font-size: 28px;
        text-align: left;
        max-width: 265px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .balance-in-network {
        color: rgba(255, 255, 255, 0.5);
      }

      .price {
        color: rgba(255, 255, 255, 0.5);
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
