<template>
  <div class="unstaking-form">
    <InfoRow
      class="info-fee"
      text="assets.networkFee"
      borderType="default"
      icon="info"
      :value="`${fee} ${asset}`"
      :price="valueString"
      :iconClasses="['network-fee']"
    />

    <div class="disclaimer">
      <Icon icon="wallet-2" class="img" />

      {{ $t('staking.unstakingDisclaimers1') }}
    </div>

    <div class="disclaimer">
      <Icon icon="logout" class="img" />

      {{ $t('staking.unstakingDisclaimers2') }}
    </div>

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
export default class UnstakingForm extends Vue {
  readonly selectAccountInputRef = 'selectAccountInput';

  @Prop({ type: Object }) stakingCurrency!: TokenBalance;
  @Prop({ type: String }) fee!: string;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;

  get asset() {
    return this.stakingCurrency.symbol;
  }

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.getAssetPrice(priceId).price;
  }

  get valueString() {
    const value = +this.fee * this.stakingAssetPrice;

    return `${this.fiatSymbol}${this.$n(+value, 'price')}`;
  }
}
</script>

<style lang="scss" scoped>
.unstaking-form {
  // padding: 0 16px;

  // .fee {
  //   font-size: 14px;
  //   border-bottom: $default-border;
  //   display: flex;
  //   justify-content: space-between;
  //   align-items: center;
  //   margin: 10px 0 20px;
  //   padding: 10px 0;

  //   .column {
  //     display: flex;
  //     flex-direction: column;
  //     align-items: flex-end;
  //     color: $default-white;

  //     .amount {
  //       font-weight: 600;
  //       text-align: right;
  //       text-transform: uppercase;
  //       margin-bottom: 5px;
  //     }

  //     .value {
  //       font-size: 12px;
  //       text-align: right;
  //       color: $grayish-white-2;
  //     }
  //   }
  // }

  .info-fee {
    margin-bottom: 20px;
  }

  .disclaimer {
    display: flex;
    align-items: center;
    font-size: 14px;
    color: $default-white;
    margin-bottom: 10px;

    &:last-child {
      margin-bottom: none;
    }
  }

  .img {
    margin-right: 10px;
    height: 30px;
    width: 30px;
  }
}
</style>
