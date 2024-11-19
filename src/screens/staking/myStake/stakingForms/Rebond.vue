<template>
  <div class="rebond-form">
    <InfoRow
      class="info-fee"
      text="assets.networkFee"
      borderType="default"
      icon="info"
      :value="`${fee} ${asset}`"
      :price="valueString"
      :hideLastBorder="false"
      :iconClasses="['network-fee']"
    />

    <Tooltip text="assets.networkFee" target=".network-fee" placement="right" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { TokenGroup } from '@extension-base/background/types/types';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

@Component
export default class Rebond extends Vue {
  networksStore = useNetworksStore();
  accountsStore = useAccountsStore();

  @Prop({ type: Object }) stakingCurrency!: TokenGroup;
  @Prop({ type: String }) fee!: string;
  @Prop({ type: String }) amount!: string;

  get asset() {
    return this.stakingCurrency.symbol;
  }

  get stakingAssetPrice() {
    const priceId = this.stakingCurrency?.priceId ?? '';

    return this.networksStore.getAssetPrice(priceId).price;
  }

  get valueString() {
    const value = +this.fee * this.stakingAssetPrice;

    return `${this.accountsStore.fiatSymbol}${this.$n(+value, 'price')}`;
  }
}
</script>

<style lang="scss" scoped>
.rebond-form {
  margin-top: 15px;

  .info-fee {
    margin-top: 10px;
    margin-bottom: 20px;
  }

  .disclaimer {
    display: flex;
    align-items: center;
    font-size: 0.875em;
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
