<template>
  <div class="withdraw-unbonded-form">
    <InfoRow
      text="assets.networkFee"
      borderType="default"
      icon="info"
      :value="`${fee} ${asset}`"
      :price="feeValueString"
      :hideLastBorder="false"
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
export default class WithdrawUnbonded extends Vue {
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

  get feeValueString() {
    const value = +this.fee * this.stakingAssetPrice;

    return `${this.accountsStore.fiatSymbol}${this.$n(+value, 'price')}`;
  }
}
</script>

<style lang="scss" scoped>
.withdraw-unbonded-form {
  .info-fee {
    margin-top: 10px;
  }
}
</style>
