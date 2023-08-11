<template>
  <div class="redeem-form">
    <InfoRow text="staking.rewards" :value="`${rewards} ${asset}`" :price="rewardsValueString" borderType="default" />

    <InfoRow
      text="assets.networkFee"
      borderType="default"
      icon="info"
      :value="`${fee} ${asset}`"
      :price="feeValueString"
      :hideLastBorder="false"
      :iconClasses="['network-fee']"
    />

    <Tooltip text="assets.networkFee" target=".network-fee" placement="right" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { GetAssetPrice } from '@/store';
import type { TokenBalance } from '@extension-base/background/types/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

@Component
export default class RedeemForm extends Vue {
  readonly selectAccountInputRef = 'selectAccountInput';

  @Prop({ type: Object }) stakingCurrency!: TokenBalance;
  @Prop({ type: Object }) rewardedCurrency!: TokenBalance;
  @Prop({ type: String }) fee!: string;
  @Prop({ type: String }) rewards!: string;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;

  get asset() {
    return this.stakingCurrency.symbol;
  }

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get rewardedAssetPrice() {
    const priceId = this.rewardedCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get rewardsValueString() {
    const value = +this.rewards * this.rewardedAssetPrice;

    return `${this.fiatSymbol}${this.$n(+value, 'price')}`;
  }

  get feeValueString() {
    const value = +this.fee * this.stakingAssetPrice;

    return `${this.fiatSymbol}${this.$n(+value, 'price')}`;
  }
}
</script>

<style lang="scss" scoped>
// .redeem-form {
//   padding: 0 16px;

//   .row2 {
//     font-size: 14px;
//     border-bottom: $default-border;
//     display: flex;
//     justify-content: space-between;
//     align-items: center;
//     padding: 10px 0;

//     &:first-child {
//       margin-top: 10px;
//     }

//     .column {
//       display: flex;
//       flex-direction: column;
//       align-items: flex-end;
//       color: $default-white;

//       .amount {
//         font-weight: 600;
//         text-align: right;
//         text-transform: uppercase;
//         margin-bottom: 5px;
//       }

//       .value {
//         font-size: 12px;
//         text-align: right;
//         color: $grayish-white-2;
//       }
//     }
//   }
// }
</style>
