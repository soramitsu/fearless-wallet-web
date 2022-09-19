<template>
  <div :class="classes">
    <FloatInput
      v-model="syncedAmount"
      class="input-amount"
      placeholder="Amount"
      size="big"
      styleInput="pink"
      @change="changeAmount"
    />

    <MaxButton class="max-button-two" @click="$emit('setMaxValue')" />

    <template v-if="showValueInput">
      <img src="@/assets/equals.svg" class="img-equals" />

      <div v-show="showFiatSymbol" class="fiat-symbol">{{ fiatSymbol }}</div>

      <FloatInput
        v-model="syncedValue"
        class="input-amount"
        size="big"
        styleInput="pink"
        placeholder="Value"
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
import FloatInput from '@/components/FloatInput.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

@Component({
  components: {
    FloatInput,
    MaxButton,
  },
})
export default class TeleportForm extends Vue {
  @Prop(Object) currency!: Currency;
  @PropSync('amount', { type: String }) syncedAmount!: string;
  @PropSync('value', { type: String }) syncedValue!: string;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;

  get classes() {
    return ['amount-wrapper', this.showValueInput ? 'short-inputs' : 'long-inputs'];
  }

  get showFiatSymbol() {
    return this.syncedValue !== '';
  }

  get showValueInput() {
    return this.currency?.price !== 0;
  }

  changeAmount(amount: string) {
    const value = this.currency?.getCostOfTokens(amount).toString() ?? '';

    this.syncedValue = value !== '0' ? value : '';
  }

  changeValue(value: string) {
    const amount = this.currency?.getCountTokensByPrice(value).toString() ?? '';

    this.syncedAmount = amount !== '0' ? amount : '';
  }
}
</script>

<style lang="scss">
.short-inputs {
  .s-input .el-input {
    width: 140px;
  }
}

.long-inputs {
  .s-input .el-input {
    width: 420px;
  }
}

.amount-wrapper {
  .s-input__input {
    flex: 0 !important;
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
    margin: 0 15px;
  }

  .max-button-one {
    left: 180px;
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
