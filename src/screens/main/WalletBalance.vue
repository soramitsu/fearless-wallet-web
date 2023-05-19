<template>
  <div class="wallet-balance">
    <div class="fiat-balance">{{ fiatSymbol }}{{ $n(balance, 'price') }}</div>

    <div :class="percentClasses">{{ percentString }}</div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { ChangeWalletBalance } from '@/interfaces';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

@Component
export default class WalletBalance extends Vue {
  @Prop(Object) changeWalletBalance!: ChangeWalletBalance;
  @Prop(Number) balance!: number;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;

  get percentString() {
    const { percent, amount } = this.changeWalletBalance;

    if (percent === 0) return `${this.$n(0, 'percent')}`;

    const sign = percent > 0 ? '+' : '';
    const displayAmount = amount < 0 ? amount * -1 : amount;
    const percentage = percent / 100 ?? 0;

    return `${sign}${this.$n(percentage, 'percent')}(${this.fiatSymbol}${this.$n(displayAmount ?? 0, 'price')})`;
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
    color: $orange-color;
  }

  .fiat-balance {
    font-weight: 800;
    text-overflow: ellipsis;
    overflow-x: hidden;
    height: 30px;
  }
}
</style>
