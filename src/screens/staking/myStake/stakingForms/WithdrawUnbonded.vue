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
import { defineComponent } from 'vue';

import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'WithdrawUnbonded' ,
  props: {
    stakingCurrency: { type: Object },
    fee: { type: String },
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
    };
  },
  computed: {
    asset() {
      return this.stakingCurrency.symbol;
    },
    stakingAssetPrice() {
      const priceId = this.stakingCurrency?.priceId ?? '';

          return this.networksStore.getAssetPrice(priceId).price;
    },
    feeValueString() {
      const value = +this.fee * this.stakingAssetPrice;

          return `${this.accountsStore.fiatSymbol}${this.$n(+value, 'price')}`;
    },
  },
});
</script>

<style lang="scss" scoped>
.withdraw-unbonded-form {
  .info-fee {
    margin-top: 10px;
  }
}
</style>
