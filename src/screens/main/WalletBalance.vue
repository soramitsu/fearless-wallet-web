<template>
  <div :class="containerClasses">
    <div class="fiat-balance" data-testid="fiatBalance">{{ accountsStore.fiatSymbol }}{{ $n(balance, 'price') }}</div>

    <div v-if="changeWalletBalance" :class="percentClasses" data-testid="percent">{{ percentString }}</div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import type { ChangeWalletBalance } from '@/interfaces';
import { useAccountsStore } from '@/stores/accounts';

defineOptions({
  name: 'WalletBalance',
});

const accountsStore = useAccountsStore();
const { n } = useI18n();

const props = withDefaults(
  defineProps<{
    changeWalletBalance?: ChangeWalletBalance | null;
    balance: number;
    staticWidth?: boolean;
  }>(),
  {
    changeWalletBalance: null,
    staticWidth: true,
  }
);

const containerClasses = computed(() => [
  'wallet-balance',
  {
    'wallet-balance--static': props.staticWidth,
  },
]);

const percentString = computed(() => {
  if (!props.changeWalletBalance) return '';

  const { percent, amount } = props.changeWalletBalance;

  if (percent === 0) return `${n(0, 'percent')}`;

  const sign = percent > 0 ? '+' : '';
  const displayAmount = amount < 0 ? amount * -1 : amount;
  const percentage = percent / 100 ?? 0;

  return `${sign}${n(percentage, 'percent')}(${accountsStore.fiatSymbol}${n(displayAmount ?? 0, 'price')})`;
});

const percentClasses = computed(() => {
  if (!props.changeWalletBalance) return ['percent'];

  const classes = ['percent'];
  const { percent } = props.changeWalletBalance;

  if (percent > 0) classes.push('up-percent');
  else if (percent < 0) classes.push('down-percent');

  return classes;
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
