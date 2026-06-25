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
import { defineComponent } from 'vue';

import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'BondExtra' ,
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
    valueString() {
      const value = +this.fee * this.stakingAssetPrice;

          return `${this.accountsStore.fiatSymbol}${this.$n(+value, 'price')}`;
    },
  },
});
</script>

<style lang="scss" scoped>
.bond-extra-form {
  .info-fee {
    margin-top: 10px;
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
