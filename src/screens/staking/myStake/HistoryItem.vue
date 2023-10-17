<template>
  <div class="history-item">
    <div class="column left">
      <span class="name">
        {{ operationName }}
      </span>

      <span class="date">
        {{ date }}
      </span>
    </div>

    <div class="column right">
      <div>
        <div class="amount">-{{ $n(amount, 'decimal') }} {{ symbol }}</div>

        <div class="value">{{ value }}</div>
      </div>

      <Icon icon="chevron-right" className="chevron" @click="dostClick" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { GetAssetPrice } from '@/store';
import type { TokenBalance } from '@extension-base/background/types/types';
import { getFormattedDate } from '@/helpers';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { SoraHistoryElement } from '@/interfaces';

@Component
export default class HistoryItem extends Vue {
  @Prop({ type: Object }) history!: SoraHistoryElement;
  @Prop({ type: String }) assetId!: string;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;

  get operationName() {
    return this.$t(`staking.${this.history.method}`);
  }

  get method() {
    return this.history.method;
  }

  get amount() {
    const data = this.history.data;

    if (this.method === 'unbond') {
      const value = +data.value;

      return +this.networkFee + value;
    }

    if (this.method === 'bondExtra') {
      const value = +data.maxAdditional;

      return +this.networkFee + value;
    }

    return +this.networkFee;
  }

  get networkFee() {
    return this.history.networkFee;
  }

  get symbol() {
    return this.currency?.symbol;
  }

  get date() {
    return getFormattedDate(this.history.timestamp);
  }

  get currency() {
    return this.balances.find(({ assetId }) => assetId === this.assetId);
  }

  get assetPrice() {
    const priceId = this.currency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get value() {
    const value = this.amount * this.assetPrice;

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
    display: flex;

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
    flex-direction: column;
  }

  .right {
    text-align: right;
    align-items: center;
    height: 38px;
    max-width: 325px;

    .chevron {
      width: 20px;
      height: 20px;
      margin-left: 10px;
      color: $gray-color;
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
