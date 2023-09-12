<template>
  <div>
    <ContentForm :height="210" :isStaticHeight="true" :bottomRightCorner="true" class="about-form">
      <div class="about-stake">
        <div class="one block">
          <div class="label">{{ $t('staking.stakingBalance') }}</div>
          <div class="amount">{{ stakingAmount }} {{ stakingAsset }}</div>
          <div class="value">{{ fiatSymbol }}{{ stakingValue }}</div>
        </div>

        <div class="two block">
          <div class="label">{{ $t('staking.rewarded') }}</div>
          <div class="amount">{{ rewardedAmount }} {{ rewardedAsset }}</div>
          <div class="value">{{ fiatSymbol }}{{ rewardedValue }}</div>
        </div>

        <div class="three block">
          <div class="label">{{ $t('staking.unstaking') }}</div>
          <div class="amount">{{ unstakingAmount }} {{ stakingAsset }}</div>
          <div class="value">{{ fiatSymbol }}{{ unstakingValue }}</div>
        </div>

        <div class="four block">
          <div class="label">{{ $t('staking.redeemable') }}</div>
          <div class="amount">{{ redeemableAmount }} {{ stakingAsset }}</div>
          <div class="value">{{ fiatSymbol }}{{ redeemableValue }}</div>
        </div>
      </div>
    </ContentForm>

    <div class="about-label">
      {{ $t('common.about') }}
    </div>

    <div class="descriptions">
      {{ $t('staking.about') }}
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { MyStakingTab } from '@/interfaces/common';
import type { GetAssetPrice } from '@/store';
import type { TokenBalance } from '@extension-base/background/types/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
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
    return this.stakingCurrency?.symbol;
  }

  get rewardedAsset() {
    return this.rewardedCurrency?.symbol;
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
    const value = +this.stakingAmount * this.stakingAssetPrice;

    return this.$n(value, 'price');
  }

  get rewardedValue() {
    const value = +this.rewardedAmount * this.rewardedAssetPrice;

    return this.$n(value, 'price');
  }

  get unstakingValue() {
    const value = +this.unstakingAmount * this.stakingAssetPrice;

    return this.$n(value, 'price');
  }

  get redeemableValue() {
    const value = +this.redeemableAmount * this.stakingAssetPrice;

    return this.$n(value, 'price');
  }
}
</script>

<style lang="scss" scoped>
.about-label {
  font-weight: 600;
  color: $default-white;
  margin: 15px 0;
  text-align: left;
}

.descriptions {
  font-size: 14px;
  color: $default-white;
  text-align: left;
  line-height: 20px;
}

.about-form {
  margin-top: 10px;

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
      color: $grayish-white;
      margin-bottom: 5px;
    }

    .amount {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 5px;
    }

    .value {
      font-size: 14px;
      color: $grayish-white;
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
}
</style>
