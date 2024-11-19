<template>
  <div :class="containerClasses">
    <div class="fiat-balance" data-testid="fiatBalance">{{ accountsStore.fiatSymbol }}{{ $n(balance, 'price') }}</div>

    <div v-if="changeWalletBalance" :class="percentClasses" data-testid="percent">{{ percentString }}</div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

import type { ChangeWalletBalance } from '@/interfaces';
import { useAccountsStore } from '@/stores/accounts';

@Component
export default class WalletBalance extends Vue {
  accountsStore = useAccountsStore();

  @Prop(Object) changeWalletBalance!: ChangeWalletBalance;
  @Prop(Number) balance!: number;
  @Prop({ default: true }) staticWidth!: boolean;

  get containerClasses() {
    const array = [
      'wallet-balance',
      {
        'wallet-balance--static': this.staticWidth,
      },
    ];

    return array;
  }

  get percentString() {
    const { percent, amount } = this.changeWalletBalance;

    if (percent === 0) return `${this.$n(0, 'percent')}`;

    const sign = percent > 0 ? '+' : '';
    const displayAmount = amount < 0 ? amount * -1 : amount;
    const percentage = percent / 100 ?? 0;

    return `${sign}${this.$n(percentage, 'percent')}(${this.accountsStore.fiatSymbol}${this.$n(
      displayAmount ?? 0,
      'price'
    )})`;
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
.wallet-balance--static {
  max-width: 170px;

  .percent {
    max-width: 175px;
  }
}

.wallet-balance {
  text-align: left;
  max-width: 300px;

  &:hover {
    cursor: pointer;
  }

  .percent {
    font-size: 12px;
    line-height: 18px;
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
    overflow-y: hidden;
    height: 23px;
    line-height: 23px;
  }
}
</style>
