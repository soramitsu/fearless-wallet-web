<template>
  <div class="unstaking-form">
    <div class="row">
      {{ $t('staking.rewards') }}

      <div class="column">
        <div class="amount">{{ rewards }} {{ asset }}</div>

        <div class="value">{{ fiatSymbol }}{{ rewardsValueString }}</div>
      </div>
    </div>

    <div class="row">
      {{ $t('assets.networkFee') }}

      <div class="column">
        <div class="amount">{{ fee }} {{ asset }}</div>

        <div class="value">{{ feeValueString }}</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { GetAssetPrice } from '@/store';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

@Component
export default class RedeemForm extends Vue {
  readonly selectAccountInputRef = 'selectAccountInput';

  @Prop({ type: Object }) currency!: TokenBalance;
  @Prop({ type: String }) fee!: string;
  @Prop({ type: String }) rewards!: string;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;

  get asset() {
    return this.currency.symbol;
  }

  get assetPrice() {
    const priceId = this.currency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get rewardsValueString() {
    const value = +this.rewards * this.assetPrice;

    return `${this.fiatSymbol}${this.$n(+value, 'price')}`;
  }

  get feeValueString() {
    const value = +this.fee * this.assetPrice;

    return `${this.fiatSymbol}${this.$n(+value, 'price')}`;
  }
}
</script>

<style lang="scss" scoped>
.unstaking-form {
  padding: 0 16px;

  .row {
    font-size: 14px;
    border-bottom: $default-border;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 0;

    &:first-child {
      margin-top: 10px;
    }

    .column {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      color: #ffffffbf;

      .amount {
        font-weight: 600;
        text-align: right;
        text-transform: uppercase;
        margin-bottom: 5px;
      }

      .value {
        font-size: 12px;
        text-align: right;
        color: $grayish-white-2;
      }
    }
  }
}
</style>
