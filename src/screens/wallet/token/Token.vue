<template>
  <div class="token">
    <TokenHeader :networkName="networkName" :price="tokenInfo.price" :tokenName="tokenName" />

    <div class="descriptions">
      <div class="column left-column">
        <div class="count-tokens">{{ countTokensString }}</div>
        <div class="total-balance">{{ totalBalanceString }}</div>
      </div>
      <div class="column right-column">
        <div class="today-label">Today</div>
        <div>{{ grownString }}</div>
        <div class="grown-percent-today">{{ grownPercentString }}</div>
      </div>
    </div>

    <div class="activity-block">
      <ButtonWithIcon name="Send" iconType="send" :handler="send" />

      <ButtonWithIcon name="Receive" iconType="receive" :handler="receive" />

      <ButtonWithIcon name="Buy" iconType="buy" :handler="buy" />
    </div>

    <div class="content">
      <div class="content-header">
        <TabButton
          v-for="tabName in tabsOptions"
          :key="tabName"
          :name="tabName"
          :background="false"
          :isActive="activeTabName === tabName"
          @click.native="openTab(tabName)"
        />
      </div>

      <Scroll>
        <Networks v-if="showNetworks" :availableInNetworks="tokenInfo.availableInNetworks" />

        <History v-else-if="showHistory" :availableInNetworks="tokenInfo.availableInNetworks" />
      </Scroll>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Currency } from '../../../interfaces/currencies';
import type { Tab } from '../../../interfaces/walletPage';
import currencyMock from '../../../mocks/currency';
import CircleButton from '../../../components/CircleButton.vue';
import ButtonWithIcon from '../../../components/ButtonWithIcon.vue';
import Scroll from '../../../components/Scroll.vue';
import TokenHeader from './TokenHeader.vue';
import Networks from './Networks.vue';
import History from './History.vue';
import TabButton from '../../../components/TabButton.vue';

@Component({
  components: {
    CircleButton,
    ButtonWithIcon,
    Scroll,
    TokenHeader,
    Networks,
    TabButton,
    History,
  },
})
export default class extends Vue {
  currencies: Currency[] = currencyMock;
  tabsOptions: Tab[] = ['Networks', 'History'];
  activeTabName: Tab = 'Networks';

  get showNetworks() {
    return this.activeTabName === 'Networks';
  }

  get showHistory() {
    return this.activeTabName === 'History';
  }

  get tokenInfo() {
    return this.currencies.find(({ token }) => token.toLowerCase() === this.tokenName);
  }

  get networkName() {
    return this.$route.params.networkName ?? 'Default';
  }

  get tokenName() {
    return this.$route.params.tokenName;
  }

  get countTokensString() {
    return `${this.tokenInfo?.countTokens} ${this.tokenName.toUpperCase()}`;
  }

  get totalBalanceString() {
    return `$ ${this.tokenInfo?.totalBalance}`;
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
    margin-bottom: 24px;

    .column {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 65px;

      .count-tokens {
        font-weight: 600;
        font-size: 28px;
      }

      .total-balance {
        color: rgba(255, 255, 255, 0.65);
      }

      .today-label {
        color: rgba(255, 255, 255, 0.65);
        font-size: 14px;
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
    clip-path: var(--default-clip-path-left-top);
    border-radius: 8px;
    height: 265px;

    .content-header {
      display: flex;
      padding: 11px 16px;
    }
  }
}
</style>
