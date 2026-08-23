<template>
  <div :class="containerClasses">
    <div class="fiat-balance" data-testid="fiatBalance">{{ accountsStore.fiatSymbol }}{{ formattedBalance }}</div>

    <div v-if="changeWalletBalance" :class="percentClasses" data-testid="percent">{{ percentString }}</div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { FPNumber } from '@sora-substrate/util';
import { useAccountsStore } from '@/stores/accounts';
import { formatDecimalString } from '@/helpers/numbers';

export default defineComponent({ name: 'WalletBalance' ,
  props: {
    changeWalletBalance: Object,
    balance: { type: [String, Number], default: '0' },
    staticWidth: { default: true },
  },
  data() {
    return {
      accountsStore: useAccountsStore(),
    };
  },
  computed: {
    containerClasses() {
      const array = [
            'wallet-balance',
            {
              'wallet-balance--static': this.staticWidth,
            },
          ];

          return array;
    },
    formattedBalance() {
      return formatDecimalString(this.balance, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    percentString() {
      const { percent, amount } = this.changeWalletBalance;
      const percentValue = new FPNumber(String(percent ?? '0'));
      const amountValue = new FPNumber(String(amount ?? '0'));

          if (percentValue.isZero()) return '0.00%';

          const sign = percentValue.isGtZero() ? '+' : '';
          const displayAmount = amountValue.isLtZero() ? amountValue.mul(new FPNumber('-1')) : amountValue;

          return `${sign}${formatDecimalString(percentValue.toString(), {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}%(${this.accountsStore.fiatSymbol}${formatDecimalString(displayAmount.toString(), {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })})`;
    },
    percentClasses() {
      const { percent } = this.changeWalletBalance;
          const percentValue = new FPNumber(String(percent ?? '0'));
          const classes = ['percent'];

          if (percentValue.isGtZero()) classes.push('up-percent');
          else if (percentValue.isLtZero()) classes.push('down-percent');

          return classes;
    },
  },
});
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
    font-size: 0.75rem;
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
