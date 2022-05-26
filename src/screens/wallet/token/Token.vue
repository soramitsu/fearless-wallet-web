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

    <div class="activity-block">
      <BorderButton
        text="Send"
        iconName="send"
        type="secondary"
        width="125px"
        @click="toggleVisible('showSendForm', true)"
      />

      <BorderButton
        text="Receive"
        iconName="receive"
        type="secondary"
        width="125px"
        @click="toggleVisible('showReceiveForm', true)"
      />

      <BorderButton
        text="Teleport"
        iconName="teleport"
        type="secondary"
        width="125px"
        @click="toggleVisible('showTeleportForm', true)"
      />

      <BorderButton
        text="Buy"
        iconName="plus"
        type="secondary"
        width="125px"
        @click="toggleVisible('showBuyForm', true)"
      />
    </div>

    <Corners size="big" :bottomRightCorner="false">
      <div class="content">
        <div class="content-settings">
          <div class="history-label">History</div>

          <Corners>
            <Dropdown
              :value="filterHistoryValue"
              :options="historyDropdownOption"
              :handler="filterHistoryValueUpdate"
            />
          </Corners>
        </div>

        <Scroll>
          <History :history="filteredHistory" :availableInNetworks="currencies.availableInNetworks" />
        </Scroll>
      </div>
    </Corners>

    <SendForm
      v-if="showSendForm"
      :currencies="currenciesForSelectedWallet"
      :selectedNetwork="selectedNetwork"
      :token="token"
      :closeForm="toggleVisible.bind(null, 'showSendForm', false)"
    />

    <ReceiveForm
      v-if="showReceiveForm"
      :selectedNetwork="selectedNetwork"
      :closeForm="toggleVisible.bind(null, 'showReceiveForm', false)"
    />

    <TeleportForm
      v-if="showTeleportForm"
      :currencies="currenciesForSelectedWallet"
      :selectedNetwork="selectedNetwork"
      :token="token"
      :closeForm="toggleVisible.bind(null, 'showTeleportForm', false)"
    />

    <BuyForm v-if="showBuyForm" :closeForm="toggleVisible.bind(null, 'showBuyForm', false)" />

    <PopupWithSelect
      v-if="showSelectNetworkPopup"
      v-model="selectedNetwork"
      header="Select Network"
      space="big"
      horizontalPlacement="right"
      verticalPlacement="center"
      :showIcon="true"
      :showSearch="true"
      :staticHeight="true"
      :options="filterOptionsNetworks"
      :toggleValue="toggleSelectedNetwork"
      :handlerClose="toggleSelectNetworkPopupVisible"
      :handlerFilter="handlerFilter"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { HistoryItem, Currencies } from '@/interfaces/currencies';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { Networks as NetworksType } from '@/store/networks/types';
import { Components } from '@/router/routes';
import { getImgPathByNetworkName } from '@/util/imgPath';
import { firstCharToUp } from '@/util/helpers';
import { formattedNumber, formattedPrice } from '@/util/numbers';
import historyMock from '@/mocks/history';
import BorderButton from '@/components/BorderButton.vue';
import Scroll from '@/components/Scroll.vue';
import Dropdown from '@/components/Dropdown.vue';
import Corners from '@/components/Corners.vue';
import History from './History.vue';
import TabButton from '@/components/TabButton.vue';
import ReceiveForm from '../ReceiveForm.vue';
import SendForm from '../SendForm.vue';
import TeleportForm from '../TeleportForm.vue';
import BuyForm from '../BuyForm.vue';
import SelectNetworkButton from '../SelectNetworkButton.vue';
import PopupWithSelect from '@/components/PopupWithSelect.vue';
import CurrencyController from '@/controllers/currencyController';

@Component({
  components: {
    BorderButton,
    Scroll,
    TabButton,
    History,
    ReceiveForm,
    SendForm,
    TeleportForm,
    BuyForm,
    Dropdown,
    Corners,
    SelectNetworkButton,
    PopupWithSelect,
  },
})
export default class Token extends Vue {
  readonly selectNetworkButtonRef = 'selectNetworkButton';
  readonly historyDropdownOption = [
    { label: 'All', value: 'all' },
    { label: 'Transfer', value: 'transfer' },
    { label: 'Reward', value: 'reward' },
  ];

  history: HistoryItem[] = historyMock;
  filterHistoryValue = 'all';
  popupFilterValue = '';
  showSendForm = false;
  showReceiveForm = false;
  showTeleportForm = false;
  showBuyForm = false;
  showSelectNetworkPopup = false;

  @Getter(NetworksGettersTypes.getNetworksInfo) networks!: NetworksType;
  @Getter(NetworksGettersTypes.getCurrenciesInfo) currencies!: Currencies;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get optionsNetworks() {
    return [
      { label: 'All networks', value: 'All networks', path: 'globus.svg' },
      ...this.networks.map(({ name }) => ({
        label: firstCharToUp(name),
        value: name,
        path: `networks/${getImgPathByNetworkName(name)}`,
      })),
    ];
  }

  get filterOptionsNetworks() {
    const filter = this.popupFilterValue.trim().toLowerCase();

    return this.optionsNetworks.filter(({ label }) => label.toLowerCase().includes(filter));
  }

  get currenciesForSelectedWallet() {
    return this.currencies[this.selectedWallet.address] ?? [];
  }

  get currentCurrency() {
    return this.currenciesForSelectedWallet.find(({ token }) => token.toLowerCase() === this.token.toLowerCase());
  }

  get currentCurrencyController() {
    if (!this.currentCurrency) return null;

    return new CurrencyController(this.currentCurrency);
  }

  get filteredHistory() {
    if (this.filterHistoryValue === 'all') return this.history;

    return this.history.filter(({ type }) => type === this.filterHistoryValue);
  }

  get tokenPriceString() {
    return `1 ${this.token.toUpperCase()} = $${formattedPrice(this.price ?? 0)}`;
  }

  get selectedNetwork() {
    return this.$route.params.network;
  }

  get token() {
    return this.$route.params.token;
  }

  get price() {
    return this.currentCurrency?.price;
  }

  get countTokensString() {
    if (!this.currentCurrencyController) return '';

    const { totalCountTokens, availableInNetworks } = this.currentCurrencyController.getCurrencyInfo();

    if (this.selectedNetwork === 'All networks') return `${this.token.toUpperCase()} ${totalCountTokens.toFixed(4)}`;

    const balance = availableInNetworks.find(({ network }) => network === this.selectedNetwork)?.balance;
    const total = formattedNumber(+(balance?.total ?? 0), 4);

    return `${this.token.toUpperCase()} ${+total}`;
  }

  get balanceInNetworkString() {
    if (!this.currentCurrencyController) return '';

    const { totalBalance } = this.currentCurrencyController.getCurrencyInfo();

    if (this.selectedNetwork === 'All networks') return `$ ${totalBalance.toFixed(2)}`;

    const total = this.currentCurrencyController.getBalanceInNetwork(this.selectedNetwork);

    return `$ ${formattedNumber(total)}`;
  }

  handlerFilter(value: string) {
    this.popupFilterValue = value;
  }

  toggleSelectedNetwork(network: string) {
    if (this.selectedNetwork === network) return;

    this.$router.push({
      name: Components.Token,
      params: {
        token: this.token,
        network: network,
      },
    });
  }

  toggleSelectNetworkPopupVisible() {
    const targetElement = (this.$refs[this.selectNetworkButtonRef] as Vue).$el as HTMLElement;

    this.showSelectNetworkPopup = !this.showSelectNetworkPopup;

    targetElement.style.zIndex = this.showSelectNetworkPopup ? '200' : '0';
  }

  filterHistoryValueUpdate(name: string) {
    this.filterHistoryValue = name;
  }

  toggleVisible(field: 'showSendForm' | 'showReceiveForm' | 'showTeleportForm' | 'showBuyForm', value: boolean) {
    this[field] = value;
  }
}
</script>

<style lang="scss" scoped>
.token {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;

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

  .activity-block {
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .content {
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background-color: rgba(255, 255, 255, 0.05);
    clip-path: $big-clip-path-left-top;
    border-radius: 8px;
    height: 336px;

    .content-settings {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 11px 16px 5px 18px;

      .history-label {
        font-weight: 600;
      }
    }
  }
}
</style>
