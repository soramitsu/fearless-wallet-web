<template>
  <div class="history-item">
    <div class="column left">
      <div class="name">
        {{ name }}
      </div>

      <div class="date">
        {{ date }}
      </div>
    </div>

    <div class="column right">
      <div>
        <div class="amount">{{ amount }} {{ asset }}</div>

        <div class="value">{{ value }}</div>
      </div>

      <Icon icon="dots-horizontal" className="dots" @click="dostClick" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { GetAssetPrice } from '@/store';
import { getFormattedDate } from '@/helpers/common';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';

@Component
export default class HistoryItem extends Vue {
  @Prop({ type: String }) name!: string;
  @Prop({ type: String }) amount!: string;
  @Prop({ type: String }) asset!: string;
  @Prop({ type: Number }) timespan!: number;
  @Prop({ type: String }) assetId!: string;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;

  get date() {
    return getFormattedDate(this.timespan, 'ms');
  }

  get currency() {
    return this.balances.find(({ assetId }) => assetId === this.assetId);
  }

  get assetPrice() {
    const priceId = this.currency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get value() {
    const value = +this.amount * this.assetPrice;

    return `${this.fiatSymbol}${this.$n(value, 'price')}`;
  }

  dostClick() {
    console.info('dostClick');
  }
}
</script>

<style lang="scss" scoped>
.history-item {
  display: flex;
  justify-content: space-between;
  border-bottom: $secondary-border;
  padding: 15px 0;

  &:last-child {
    border-bottom: none;
  }

  .column {
    .name {
      font-size: 16px;
      color: $default-white;
    }

    .date {
      font-size: 12px;
      color: $grayish-white-2;
      text-align: left;
      margin-top: 5px;
    }
  }

  .left {
    text-align: left;
  }

  .right {
    display: flex;
    align-items: center;

    .dots {
      width: 20px;
      height: 20px;
      margin-left: 10px;
    }

    .amount {
      color: $default-white;
      text-transform: uppercase;
    }

    .value {
      font-size: 12px;
      color: $grayish-white-2;
      text-align: right;
      margin-top: 5px;
    }
  }
}
</style>
