<template>
  <div class="bond-extra-form">
    <InfoRow
      class="info-fee"
      text="assets.networkFee"
      borderType="default"
      icon="info"
      :value="`${fee} ${asset}`"
      :price="valueString"
      :iconClasses="['network-fee']"
    />

    <Tooltip text="staking.stakingFee" target=".network-fee" placement="right" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { TokenGroup } from '@extension-base/background/types/types';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

@Component
export default class BondExtra extends Vue {
  networksStore = useNetworksStore();
  accountsStore = useAccountsStore();

  @Prop({ type: Object }) stakingCurrency!: TokenGroup;
  @Prop({ type: String }) fee!: string;

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
.bond-extra-form {
  .info-fee {
    margin-top: 10px;
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
