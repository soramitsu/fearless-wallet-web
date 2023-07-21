<template>
  <ContentForm :height="210" :isStaticHeight="true" :bottomRightCorner="true">
    <div class="about-stake">
      <div class="one block">
        <div class="label">{{ $t('staking.stakingBalance') }}</div>
        <div class="amount">{{ stakingAmount }} {{ stakingAsset }}</div>
        <div class="value">{{ fiatSymbol }}{{ stakingValue }}</div>
      </div>

      <div class="two block">
        <div class="label">{{ $t('staking.stakingBalance') }}</div>
        <div class="amount">{{ rewardedAmount }} {{ rewardedAsset }}</div>
        <div class="value">{{ fiatSymbol }}{{ rewardedValue }}</div>
      </div>

      <div class="three block">
        <div class="label">{{ $t('staking.stakingBalance') }}</div>
        <div class="amount">{{ unstakingAmount }} {{ stakingAsset }}</div>
        <div class="value">{{ fiatSymbol }}{{ unstakingValue }}</div>
      </div>

      <div class="four block">
        <div class="label">{{ $t('staking.stakingBalance') }}</div>
        <div class="amount">{{ redeemableAmount }} {{ stakingAsset }}</div>
        <div class="value">{{ fiatSymbol }}{{ redeemableValue }}</div>
      </div>
    </div>
  </ContentForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { MyStakingTab } from '@/interfaces/common';
import type { GetAssetPrice } from '@/store';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

@Component
export default class About extends Vue {
  readonly dotsVerticalRef = 'dotsVertical';
  activeTabName: MyStakingTab = 'about';

  @Prop({ type: Object }) stakingCurrency!: TokenBalance;
  @Prop({ type: Object }) rewardedCurrency!: TokenBalance;
  @Prop({ type: String }) stakingAmount!: string;
  @Prop({ type: String }) rewardedAmount!: string;
  @Prop({ type: String }) unstakingAmount!: string;
  @Prop({ type: String }) redeemableAmount!: string;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;

  get stakingAsset() {
    return this.stakingCurrency.symbol;
  }

  get rewardedAsset() {
    return this.rewardedCurrency.symbol;
  }

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get rewardedAssetPrice() {
    const priceId = this.rewardedCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get stakingValue() {
    return +this.stakingAmount * this.stakingAssetPrice;
  }

  get rewardedValue() {
    return +this.rewardedAmount * this.rewardedAssetPrice;
  }

  get unstakingValue() {
    return +this.unstakingAmount * this.stakingAssetPrice;
  }

  get redeemableValue() {
    return +this.redeemableAmount * this.stakingAssetPrice;
  }
}
</script>

<style lang="scss" scoped>
.about-stake {
  display: grid;
  grid-auto-columns: 247px;
  grid-auto-rows: 105px;
  text-transform: uppercase;

  .block {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    text-align: left;
    padding-left: 35px;
  }

  .label {
    font-size: 12px;
    font-weight: 600;
    text-align: left;
    color: #ffffffa6;
    margin-bottom: 5px;
  }

  .amount {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 5px;
  }

  .value {
    font-size: 14px;
    color: #ffffffa6;
  }

  .one {
    grid-column: 1;
    grid-row: 1;
    border-right: $default-border;
    border-bottom: $default-border;
  }

  .two {
    grid-column: 2;
    grid-row: 1;
    border-bottom: $default-border;
  }

  .three {
    grid-column: 1;
    grid-row: 2;
    border-right: $default-border;
  }

  .four {
    grid-column: 2;
    grid-row: 2;
  }
}
</style>
