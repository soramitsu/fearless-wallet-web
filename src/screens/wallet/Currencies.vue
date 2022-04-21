<template>
  <div class="currencies">
    <CurrencyItem v-for="currency in currencies" :key="currency.networkName" :currency="currency" />
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
}
</script>

<style lang="scss" scoped>
.currencies {
}
</style>
