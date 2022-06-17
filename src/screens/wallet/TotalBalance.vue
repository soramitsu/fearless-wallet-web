<template>
  <div class="total-balance" @click="$emit('click')">
    <div>
      <div v-if="name" class="name">{{ name }}</div>
      <div class="balance">${{ balanceString }}</div>
      <div :class="percentClasses">{{ percentString }}</div>
    </div>
    <s-icon name="basic-check-mark-24" v-show="showIcon" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { Currency } from '@/interfaces/currencies';
import currencyMock from '@/mocks/currency';

@Component
export default class TotalBalance extends Vue {
  @Prop({ default: '' }) name!: string;
  @Prop(Number) balance!: number;
  @Prop(Number) percent!: number;
  @Prop({ default: false }) showIcon!: boolean;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get currencies(): Currency[] {
    // TODO: fix as ''
    return currencyMock[this.selectedWallet.address as ''];
  }

  get totalBalance() {
    return this.currencies.reduce((sum, { price, availableInNetworks }) => {
      const sumToken = availableInNetworks.reduce((sumToken, { balance }) => sumToken + balance, 0);

      return price * sumToken + sum;
    }, 0);
  }

  get balanceString() {
    return this.balance.toFixed(2);
  }

  get percentString() {
    return `${this.percent > 0 ? '+' : ''}${this.percent.toFixed(2)}%`;
  }

  get percentClasses() {
    return ['percent', this.percent >= 0 ? 'percent-plus' : 'percent-minus'];
  }
}
</script>

<style lang="scss" scoped>
.total-balance {
  display: flex;
  justify-content: space-between;
  align-items: center;
  text-align: left;
  opacity: 0.95;

  &:hover {
    cursor: pointer;
    opacity: 1;
  }

  .name {
    margin-bottom: 4px;
  }

  .balance {
    font-weight: 800;
    font-size: 22px;
    line-height: 28px;
  }

  .percent {
    font-size: 12px;
    line-height: 18px;
  }

  .percent-plus {
    color: #00ffcc;
  }

  .percent-minus {
    color: #d0021b;
  }

  .s-icon-basic-check-mark-24 {
    color: var(--pink-lavender-color);
  }
}
</style>
