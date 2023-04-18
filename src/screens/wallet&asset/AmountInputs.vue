<template>
  <div class="amount-wrapper">
    <FloatInput
      v-model="syncedAmount"
      class="input-amount"
      size="big"
      styleInput="pink"
      :placeholder="amountPlaceholder"
      :placeholderLocaleProps="amountPlaceholderProps"
      @change="changeAmount"
    />

    <MaxButton class="max-button-two" @click="$emit('setMaxValue')" />

    <template v-if="showValueInput">
      <Icon icon="equals" className="img-equals" />

      <div v-show="showFiatSymbol" class="fiat-symbol">{{ fiatSymbol }}</div>

      <FloatInput
        v-model="syncedValue"
        class="input-amount"
        size="big"
        styleInput="pink"
        :placeholder="valuePlaceholder"
        :placeholderLocaleProps="valuePlaceholderProps"
        @change="changeValue"
      />

      <MaxButton class="max-button-one" @click="$emit('setMaxValue')" />
    </template>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import MaxButton from './MaxButton.vue';
import type { Currency } from '@/interfaces/currencies';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

@Component({
  components: {
    MaxButton,
  },
})
export default class TeleportForm extends Vue {
  @Prop(Object) currency!: Currency;
  @PropSync('amount', { type: String }) syncedAmount!: string;
  @PropSync('value', { type: String }) syncedValue!: string;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getFiatId) fiatId!: string;

  get amountPlaceholder() {
    if (this.syncedAmount === '') return 'assets.amount';

    return 'assets.amountIn';
  }

  get amountPlaceholderProps() {
    return { asset: this.currency?.displayName.toUpperCase() };
  }

  get valuePlaceholder() {
    if (this.syncedValue === '') return 'assets.value';

    return 'assets.valueIn';
  }

  get valuePlaceholderProps() {
    return { asset: this.fiatId.toUpperCase() };
  }

  get showFiatSymbol() {
    return this.syncedValue !== '';
  }

  get showValueInput() {
    return this.currency?.price !== 0;
  }

  changeAmount(amount: string) {
    const value = this.currency?.getCostOfAssets(amount).toString() ?? '';

    this.syncedValue = value !== '0' ? value : '';
  }

  changeValue(value: string) {
    const amount = this.currency?.getCountAssetsByPrice(value).toString() ?? '';

    this.syncedAmount = amount !== '0' ? amount : '';
  }
}
</script>

<style lang="scss">
.amount-wrapper {
  .s-input__input {
    width: calc(100% - 60px);
    flex: none;
  }
}
</style>

<style lang="scss" scoped>
.amount-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: center;

  .input-amount {
    flex: 1 1 235px;
  }

  .img-equals {
    width: 22px;
    height: 22px;
    margin: 0 15px;
  }

  .max-button-one {
    left: 183px;
  }

  .max-button-two {
    right: 35px;
  }

  .fiat-symbol {
    position: absolute;
    right: 230px;
    font-size: 14px;
    margin-top: 11px;
  }
}
</style>
