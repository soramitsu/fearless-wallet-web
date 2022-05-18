<template>
  <div class="currencies">
    <CurrencyItem
      v-for="currency in currencies"
      :key="currency.mainNetwork"
      :currency="currency"
      :showAssetsManagementForm="showAssetsManagementForm"
      :hideZeroBalance="hideZeroBalance"
      :toggleVisibleActivityForm="toggleVisibleActivityForm"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Currencies as TCurrencies } from '@/interfaces/currencies';
import CurrencyItem from './CurrencyItem.vue';

@Component({
  components: { CurrencyItem },
})
export default class Currencies extends Vue {
  @Prop(Array) currencies!: TCurrencies;
  @Prop(String) selectedNetwork!: string;
  @Prop(Boolean) showAssetsManagementForm!: boolean;
  @Prop(Boolean) hideZeroBalance!: boolean;
  @Prop(Function) toggleVisibleActivityForm!: VoidFunction;
}
</script>

<style lang="scss" scoped>
.currencies {
}
</style>
