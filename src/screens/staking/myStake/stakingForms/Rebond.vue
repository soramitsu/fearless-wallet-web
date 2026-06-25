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

    <Tooltip text="staking.stakingFee" target=".network-fee" placement="right" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'Rebond' ,
  props: {
    stakingCurrency: { type: Object },
    fee: { type: String },
    amount: { type: String },
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
    valueString() {
      const value = +this.fee * this.stakingAssetPrice;

          return `${this.accountsStore.fiatSymbol}${this.$n(+value, 'price')}`;
    },
  },
});
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
