<template>
  <div class="token">
    <TokenHeader :network="network" :price="tokenInfo.price" :token="token" />

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
      <ButtonWithIcon
        name="Send"
        iconType="send"
        class="button"
        :handler="toggleVisible.bind(null, 'showSendForm', true)"
      />

      <ButtonWithIcon
        name="Receive"
        iconType="receive"
        class="button"
        :handler="toggleVisible.bind(null, 'showReceiveForm', true)"
      />

      <ButtonWithIcon
        name="Teleport"
        iconType="teleport"
        class="button"
        :handler="toggleVisible.bind(null, 'showTeleportForm', true)"
      />

      <ButtonWithIcon
        name="Buy"
        iconType="buy"
        class="button"
        :handler="toggleVisible.bind(null, 'showBuyForm', true)"
      />
    </div>

    <div class="content">
      <div class="content-header">
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

        <Dropdown
          v-else-if="showHistory"
          :value="filterHistoryValue"
          :options="historyDropdownOption"
          :handler="filterHistoryValueUpdate"
        />
      </div>

      <Scroll>
        <Networks v-if="showNetworks" :networks="filteredNetworks" :token="token" :selectedNetwork="network" />

        <History
          v-else-if="showHistory"
          :history="filteredHistory"
          :availableInNetworks="tokenInfo.availableInNetworks"
        />
      </Scroll>
    </div>

    <SendForm
      v-if="showSendForm"
      :selectedNetwork="network"
      :closeForm="toggleVisible.bind(null, 'showSendForm', false)"
    />

    <ReceiveForm v-if="showReceiveForm" :closeForm="toggleVisible.bind(null, 'showReceiveForm', false)" />

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
import type { TabCurrency } from '@/interfaces/walletPage';
import currencyMock from '@/mocks/currency';
import historyMock from '@/mocks/history';
import CircleButton from '@/components/CircleButton.vue';
import ButtonWithIcon from '@/components/ButtonWithIcon.vue';
import SearchInput from '@/components/SearchInput.vue';
import Scroll from '@/components/Scroll.vue';
import Dropdown from '@/components/Dropdown.vue';
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
    CircleButton,
    ButtonWithIcon,
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
  },
})
export default class extends Vue {
  readonly historyDropdownOption = [
    { label: 'All', value: 'all' },
    { label: 'Transfer', value: 'transfer' },
    { label: 'Reward', value: 'reward' },
  ];

  readonly tabsOptions: TabCurrency[] = ['Networks', 'History'];

  currencies: Currency[] = currencyMock;
  history: HistoryItem[] = historyMock;
  activeTabName: TabCurrency = 'Networks';
  filterNetworksValue = '';
  filterHistoryValue = 'all';
  showSendForm = false;
  showReceiveForm = false;
  showTeleportForm = false;
  showBuyForm = false;

  get filteredNetworks() {
    const { availableInNetworks } = this.tokenInfo!;
    const filter = this.filterNetworksValue.trim().toLowerCase();

    return availableInNetworks.filter(({ network }) => network.includes(filter));
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

  get tokenInfo() {
    return this.currencies.find(({ token }) => token.toLowerCase() === this.token.toLowerCase());
  }

  get network() {
    return this.$route.params.network;
  }

  get token() {
    return this.$route.params.token;
  }

  get tokenInfoInSelectedNetwork() {
    return this.tokenInfo!.availableInNetworks.find(({ network }) => network === this.network);
  }

  get balanceInNetwork() {
    const { balance } = this.tokenInfoInSelectedNetwork!;

    return this.tokenInfo!.price * balance;
  }

  get countTokensString() {
    const { balance } = this.tokenInfoInSelectedNetwork!;

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

    .button {
      width: 24%;
    }
  }

  .content {
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background-color: rgba(255, 255, 255, 0.05);
    clip-path: var(--default-clip-path-left-top);
    border-radius: 8px;
    height: 275px;

    .content-header {
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
