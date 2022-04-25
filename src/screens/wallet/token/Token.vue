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
      <ButtonWithIcon name="Send" iconType="send" :handler="send" class="button" />

      <ButtonWithIcon name="Receive" iconType="receive" :handler="receive" class="button" />

      <ButtonWithIcon name="Teleport" iconType="teleport" :handler="teleport" class="button" />

      <ButtonWithIcon name="Buy" iconType="buy" :handler="buy" class="button" />
    </div>

    <div class="content">
      <div class="content-header">
        <div class="tabs">
          <TabButton
            v-for="tabName in tabsOptions"
            :key="tabName"
            :name="tabName"
            :background="false"
            :isActive="activeTabName === tabName"
            @click.native="openTab(tabName)"
          />
        </div>

        <SearchInput v-if="showNetworks" v-model="filterNetworksValue" placeholder="Search in networks" />
      </div>

      <Scroll>
        <Networks v-if="showNetworks" :networks="filteredNetworks" :token="token" :selectedNetwork="network" />

        <History v-else-if="showHistory" :availableInNetworks="tokenInfo.availableInNetworks" />
      </Scroll>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Currency } from '@/interfaces/currencies';
import type { Tab } from '@/interfaces/walletPage';
import currencyMock from '@/mocks/currency';
import CircleButton from '@/components/CircleButton.vue';
import ButtonWithIcon from '@/components/ButtonWithIcon.vue';
import SearchInput from '@/components/SearchInput.vue';
import Scroll from '@/components/Scroll.vue';
import TokenHeader from './TokenHeader.vue';
import Networks from './Networks.vue';
import History from './History.vue';
import TabButton from '@/components/TabButton.vue';

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
  },
})
export default class extends Vue {
  currencies: Currency[] = currencyMock;
  tabsOptions: Tab[] = ['Networks', 'History'];
  activeTabName: Tab = 'Networks';
  filterNetworksValue = '';

  get filteredNetworks() {
    const { availableInNetworks } = this.tokenInfo!;
    const filter = this.filterNetworksValue.trim().toLowerCase();

    if (filter === '') return availableInNetworks;

    return availableInNetworks.filter(({ network }) => network.includes(filter));
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

  openTab(name: Tab) {
    this.activeTabName = name;
  }

  send() {
    alert('send');
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
    // justify-content: space-between;
    margin-bottom: 10px;

    .button {
      width: 25%;
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
      padding: 11px 16px 0 3px;
      height: 70px !important;

      .tabs {
        display: flex;
      }
    }
  }
}
</style>
