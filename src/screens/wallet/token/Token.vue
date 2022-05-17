<template>
  <div class="token">
    <TokenHeader :network="network" :price="price" :token="token" />

    <div class="descriptions">
      <div class="column left-column">
        <div class="first-row">{{ tokenPriceString }}</div>
        <div class="count-tokens">{{ countTokensString }}</div>
        <div class="total-balance">{{ balanceInNetworkString }}</div>
      </div>
      <div class="column right-column">
        <div class="first-row">Today</div>
        <div>{{ grownString }}</div>
        <div class="grown-percent-today">{{ grownPercentString }}</div>
      </div>
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
          <div class="tabs">
            <TabButton
              v-for="tabName in tabsOptions"
              :key="tabName"
              :name="tabName"
              :isActive="activeTabName === tabName"
              class="tab"
              @click.native="openTab(tabName)"
            />
          </div>

          <SearchInput v-if="showNetworks" v-model="filterNetworksValue" placeholder="Search in networks" />

          <Corners v-else-if="showHistory">
            <Dropdown
              :value="filterHistoryValue"
              :options="historyDropdownOption"
              :handler="filterHistoryValueUpdate"
            />
          </Corners>
        </div>

        <Scroll>
          <Networks v-if="showNetworks" :networks="filteredNetworks" :token="token" :selectedNetwork="network" />

          <History v-else-if="showHistory" :history="filteredHistory" :availableInNetworks="availableInNetworks" />
        </Scroll>
      </div>
    </Corners>

    <SendForm
      v-if="showSendForm"
      :selectedNetwork="network"
      :token="token"
      :closeForm="toggleVisible.bind(null, 'showSendForm', false)"
    />

    <ReceiveForm
      v-if="showReceiveForm"
      :selectedNetwork="network"
      :closeForm="toggleVisible.bind(null, 'showReceiveForm', false)"
    />

    <TeleportForm
      v-if="showTeleportForm"
      :selectedNetwork="network"
      :token="token"
      :closeForm="toggleVisible.bind(null, 'showTeleportForm', false)"
    />

    <BuyForm v-if="showBuyForm" :closeForm="toggleVisible.bind(null, 'showBuyForm', false)" />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Currency, HistoryItem } from '@/interfaces/currencies';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import type { TabCurrency } from '@/interfaces/walletPage';
import currencyMock from '@/mocks/currency';
import historyMock from '@/mocks/history';
import BorderButton from '@/components/BorderButton.vue';
import SearchInput from '@/components/SearchInput.vue';
import Scroll from '@/components/Scroll.vue';
import Dropdown from '@/components/Dropdown.vue';
import Corners from '@/components/Corners.vue';
import TokenHeader from './TokenHeader.vue';
import Networks from './Networks.vue';
import History from './History.vue';
import TabButton from '@/components/TabButton.vue';
import ReceiveForm from '../ReceiveForm.vue';
import SendForm from '../SendForm.vue';
import TeleportForm from '../TeleportForm.vue';
import BuyForm from '../BuyForm.vue';

@Component({
  components: {
    BorderButton,
    Scroll,
    TokenHeader,
    Networks,
    TabButton,
    History,
    SearchInput,
    ReceiveForm,
    SendForm,
    TeleportForm,
    BuyForm,
    Dropdown,
    Corners,
  },
})
export default class Token extends Vue {
  readonly historyDropdownOption = [
    { label: 'All', value: 'all' },
    { label: 'Transfer', value: 'transfer' },
    { label: 'Reward', value: 'reward' },
  ];

  readonly tabsOptions: TabCurrency[] = ['Networks', 'History'];

  history: HistoryItem[] = historyMock;
  activeTabName: TabCurrency = 'Networks';
  filterNetworksValue = '';
  filterHistoryValue = 'all';
  showSendForm = false;
  showReceiveForm = false;
  showTeleportForm = false;
  showBuyForm = false;

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get currencies(): Currency[] {
    // TODO: fix as ''
    const substrateWalletCurrency = currencyMock[this.selectedWallet.address as ''];
    const ethereumWalletCurrency = currencyMock[this.selectedWallet.ethereumAddress as ''];

    return [...substrateWalletCurrency, ...ethereumWalletCurrency];
  }

  get tokenInfo() {
    return this.currencies.find(({ token }) => token.toLowerCase() === this.token.toLowerCase());
  }

  get availableInNetworks() {
    return this.tokenInfo?.availableInNetworks;
  }

  get filteredNetworks() {
    const filter = this.filterNetworksValue.trim().toLowerCase();

    return this.availableInNetworks?.filter(({ network }) => network.includes(filter));
  }

  get filteredHistory() {
    if (this.filterHistoryValue === 'all') return this.history;

    return this.history.filter(({ type }) => type === this.filterHistoryValue);
  }

  get tokenPriceString() {
    return `1 ${this.token.toUpperCase()} = $${this.tokenInfo?.price}`;
  }

  get showNetworks() {
    return this.activeTabName === 'Networks';
  }

  get showHistory() {
    return this.activeTabName === 'History';
  }

  get network() {
    return this.$route.params.network;
  }

  get token() {
    return this.$route.params.token;
  }

  get price() {
    return this.tokenInfo?.price;
  }

  get tokenInfoInSelectedNetwork() {
    return this.tokenInfo?.availableInNetworks.find(({ network }) => network === this.network);
  }

  get balanceInNetwork() {
    const balance = this.tokenInfoInSelectedNetwork?.balance;

    if (!balance) return 0;

    return this.tokenInfo!.price * balance;
  }

  get countTokensString() {
    const balance = this.tokenInfoInSelectedNetwork?.balance ?? 0;

    return `${balance} ${this.token.toUpperCase()}`;
  }

  get balanceInNetworkString() {
    return `$ ${this.balanceInNetwork.toFixed(2)}`;
  }

  get grownString() {
    return `+$${this.tokenInfo?.grown}`;
  }

  get grownPercentString() {
    return `+${this.tokenInfo?.grownPercent}%`;
  }

  filterHistoryValueUpdate(name: string) {
    this.filterHistoryValue = name;
  }

  openTab(name: TabCurrency) {
    this.activeTabName = name;
  }

  toggleVisible(field: 'showSendForm' | 'showReceiveForm' | 'showTeleportForm' | 'showBuyForm', value: boolean) {
    this[field] = value;
  }

  receive() {
    alert('receive');
  }

  teleport() {
    alert('teleport');
  }

  buy() {
    alert('buy');
  }
}
</script>

<style lang="scss" scoped>
.token {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;

  .descriptions {
    display: flex;
    justify-content: space-between;
    margin-bottom: 16px;
    height: 75px;

    .column {
      display: flex;
      flex-direction: column;
      justify-content: space-between;

      .count-tokens {
        font-weight: 600;
        font-size: 28px;
        margin-bottom: 4px;
      }

      .total-balance {
        color: rgba(255, 255, 255, 0.65);
      }

      .first-row {
        color: rgba(255, 255, 255, 0.65);
        font-size: 14px;
        margin-bottom: 4px;
      }

      .grown-percent-today {
        color: #00ffcc;
      }
    }

    .left-column {
      align-items: flex-start;
    }

    .right-column {
      align-items: flex-end;
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
    clip-path: var(--big-clip-path-left-top);
    border-radius: 8px;
    height: 277px;

    .content-settings {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 11px 16px 5px 18px;

      .tabs {
        display: flex;
        align-items: center;
        height: 42px;

        .tab {
          margin-right: 8px;
        }
      }
    }
  }
}
</style>
