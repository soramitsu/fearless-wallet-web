<template>
  <div class="currencies">
    <CurrencyItem
      v-for="currency in filteredCurrencies"
      :key="currency.mainNetwork"
      :currency="currency"
      :showAssetsManagementForm="showAssetsManagementForm"
      :toggleVisibleActivityForm="toggleVisibleActivityForm"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Currency } from '@/interfaces/currencies';
import CurrencyItem from './CurrencyItem.vue';

@Component({
  components: { CurrencyItem },
})
export default class Currencies extends Vue {
  @Prop(Array) currencies!: Currency[];
  @Prop(String) selectedNetwork!: string;
  @Prop(Boolean) showAssetsManagementForm!: boolean;
  @Prop(Boolean) hideZeroBalance!: boolean;
  @Prop(Function) toggleVisibleActivityForm!: VoidFunction;

  get filteredCurrencies() {
    if (this.showAssetsManagementForm || !this.hideZeroBalance) return this.currencies;

    return this.currencies.filter((controller) => controller.getTotalBalance() !== 0);
  }
}
</script>

<style lang="scss" scoped>
.currencies {
}
</style>
