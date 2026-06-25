<template>
  <div class="validator">
    <div class="left-part">
      <Identicon :address="validator.address" data-testid="address" class="ident" />

      <div data-testid="validatorName">{{ validator.name }}</div>
    </div>

    <div class="right-part">
      <div data-testid="rewards">{{ rewards }} {{ rewardedAsset }}</div>

      <div class="price" data-testid="fiatPrice">{{ accountsStore.fiatSymbol }}{{ price }}</div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'ValidatorItem' ,
  props: {
    validator: { type: Object },
    rewardedCurrency: { type: Object },
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
    };
  },
  computed: {
    rewards() {
      return this.$n(+this.validator.rewards, 'decimal');
    },
    rewardedAssetPrice() {
      const priceId = this.rewardedCurrency?.priceId ?? '';

          return this.networksStore.getAssetPrice(priceId).price;
    },
    rewardedAsset() {
      return this.rewardedCurrency.symbol;
    },
    price() {
      const value = +this.validator.rewards * this.rewardedAssetPrice;

          return this.$n(value, 'price');
    },
  },
  methods: {
    onSelect(value: boolean) {
      this.$emit('onSelect', value, this.validator.address);
    },
  },
});
</script>

<style lang="scss" scoped>
.validator {
  padding: 10px 0;
  border-bottom: $default-border;
  display: flex;
  justify-content: space-between;
  color: $default-white;
  width: 100%;

  &:last-child {
    border: none;
  }

  .left-part {
    display: flex;
    align-items: center;

    .ident {
      margin: 0 10px;
    }

    .validator-checkbox {
      height: 36px;
    }
  }

  .right-part {
    display: flex;
    align-items: flex-end;
    text-transform: uppercase;
    flex-direction: column;

    .price {
      color: $gray-color;
      margin-top: 3px;
      font-size: 0.75rem;
    }
  }
}
</style>
