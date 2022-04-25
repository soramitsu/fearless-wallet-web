<template>
  <div class="content">
    <WalletHeader :activeTabName="activeTabName" @updateActiveTabName="updateActiveTabName" />

    <Scroll>
      <Currencies v-if="showCurrencies" :currencies="filterCurrencies" />

      <NFTs v-else-if="showNfts" />
    </Scroll>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { Tab } from '@/interfaces/walletPage';
import { Currency } from '@/interfaces/currencies';
import WalletHeader from './WalletHeader.vue';
import Currencies from './Currencies.vue';
import NFTs from './NFTs.vue';
import Scroll from '@/components/Scroll.vue';
import currencyMock from '@/mocks/currency';

@Component({
  components: {
    WalletHeader,
    Currencies,
    NFTs,
    Scroll,
  },
})
export default class extends Vue {
  activeTabName: Tab = 'Currencies';
  currencies: Currency[] = currencyMock;

  @Prop(String) selectedNetwork!: string;

  get filterCurrencies() {
    if (this.selectedNetwork === 'All networks') return this.currencies;

    return this.currencies.filter(({ availableInNetworks }) =>
      availableInNetworks.map(({ network }) => network).includes(this.selectedNetwork)
    );
  }

  get showCurrencies() {
    return this.activeTabName === 'Currencies';
  }

  get showNfts() {
    return this.activeTabName === 'NFTs';
  }

  updateActiveTabName(name: Tab) {
    this.activeTabName = name;
  }
}
</script>

<style lang="scss" scoped>
.content {
  display: flex;
  flex-direction: column;
  padding: 16px 0 0 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background-color: rgba(255, 255, 255, 0.05);
  clip-path: var(--default-clip-path-left-top);
  border-radius: 8px;
  height: 425px;
}
</style>
