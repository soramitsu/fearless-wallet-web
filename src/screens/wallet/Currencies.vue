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
import { Currency } from '@/interfaces/currencies';
import CurrencyItem from './CurrencyItem.vue';

@Component({
  components: { CurrencyItem },
})
export default class extends Vue {
  @Prop(Array) currencies!: Currency[];
  @Prop(Boolean) showAssetsManagementForm!: boolean;
  @Prop(Boolean) hideZeroBalance!: boolean;
  @Prop(Function) toggleVisibleActivityForm!: VoidFunction;
}
</script>

<style lang="scss" scoped>
.currencies {
}
</style>
