<template>
  <div class="wallet-balance">
    <div class="fiat-balance">{{ fiatSymbol }}{{ $n(balanceString, 'decimal') }}</div>

    <div :class="percentClasses">{{ percentString }}</div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { ChangeWalletBalance } from '@/interfaces';
import { formattedNumber, formattedCountAsset } from '@/helpers/numbers';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

@Component
export default class WalletBalance extends Vue {
  @Prop(Object) changeWalletBalance!: ChangeWalletBalance;
  @Prop(String) balance!: string;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;

  get balanceString() {
    return formattedNumber(+this.balance);
  }

  get percentString() {
    const { percent, amount } = this.changeWalletBalance;
    const sign = percent > 0 ? '+' : '';
    const signPercent = percent !== 0 ? '%' : '';
    const displayAmount = amount < 0 ? amount * -1 : amount;

    return `${sign}${formattedNumber(percent)}${signPercent}(${this.fiatSymbol}${this.$n(displayAmount, 'decimal')})`;
  }

  get percentClasses() {
    const { percent } = this.changeWalletBalance;
    const classes = ['percent'];

    if (percent > 0) classes.push('up-percent');
    else if (percent < 0) classes.push('down-percent');

    return classes;
  }
}
</script>

<style lang="scss" scoped>
.wallet-balance {
  max-width: 170px;
  text-align: left;

  &:hover {
    cursor: pointer;
  }

  .percent {
    font-size: 12px;
    line-height: 18px;
    max-width: 175px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 400;
  }

  .up-percent {
    color: $success-color;
  }

  .down-percent {
    color: $delete-color;
  }

  .fiat-balance {
    font-weight: 800;
    text-overflow: ellipsis;
    overflow-x: hidden;
    height: 30px;
  }
}
</style>
