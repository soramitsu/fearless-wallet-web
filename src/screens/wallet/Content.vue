<template>
  <div class="content">
    <ContentHeader
      :activeTabName="activeTabName"
      :handlerFilter="handlerFilter"
      @update:activeTabName="updateActiveTabName"
    />

    <Scroll>
      <Currencies
        v-if="showCurrencies"
        :currencies="filterCurrencies"
        :toggleVisibleActivityForm="toggleVisibleActivityForm"
      />

      <NFTs v-else-if="showNfts" />
    </Scroll>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { TabWallet } from '@/interfaces/walletPage';
import { Currency } from '@/interfaces/currencies';
import ContentHeader from './ContentHeader.vue';
import Currencies from './Currencies.vue';
import NFTs from './NFTs.vue';
import Scroll from '@/components/Scroll.vue';
import currencyMock from '@/mocks/currency';

@Component({
  components: {
    ContentHeader,
    Currencies,
    NFTs,
    Scroll,
  },
})
export default class extends Vue {
  activeTabName: TabWallet = 'Currencies';
  currencies: Currency[] = currencyMock;
  filterValue = '';

  @Prop(String) selectedNetwork!: string;
  @Prop(Function) toggleVisibleActivityForm!: VoidFunction;

  get filterCurrencies() {
    const filter = this.filterValue.trim().toLowerCase();

    return this.currencies
      .filter(({ availableInNetworks }) => {
        if (this.selectedNetwork === 'All networks') return true;

        return availableInNetworks.map(({ network }) => network).includes(this.selectedNetwork);
      })
      .filter(({ mainNetwork }) => mainNetwork.includes(filter));
  }

  get showCurrencies() {
    return this.activeTabName === 'Currencies';
  }

  get showNfts() {
    return this.activeTabName === 'NFTs';
  }

  handlerFilter(value: string) {
    this.filterValue = value;
  }

  updateActiveTabName(name: TabWallet) {
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
