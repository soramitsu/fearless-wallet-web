<template>
  <div class="unbond-form">
    <InfoRow
      class="info-fee"
      text="assets.networkFee"
      borderType="default"
      icon="info"
      :value="`${fee} ${asset}`"
      :price="valueString"
      :iconClasses="['network-fee']"
    />

    <InfoRow class="unbond-period" text="staking.unstakingPeriod" borderType="default" :value="period" />

    <div class="disclaimer" data-testid="unstakingDisclaimers1">
      <Icon icon="wallet-2" class="img" />

      {{ $t('staking.unstakingDisclaimers1') }}
    </div>

    <div class="disclaimer" data-testid="unstakingDisclaimers2">
      <Icon icon="logout" class="img" />

      {{ $t('staking.unstakingDisclaimers2') }}
    </div>

    <Tooltip text="staking.stakingFee" target=".network-fee" placement="right" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'Unbond' ,
  props: {
    stakingCurrency: { type: Object },
    stakingNetwork: { type: Object },
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
      return this.stakingNetwork.asset;
    },
    stakingAssetPrice() {
      const priceId = this.stakingCurrency?.priceId ?? '';

          return this.networksStore.getAssetPrice(priceId).price;
    },
    valueString() {
      const value = +this.fee * this.stakingAssetPrice;

          return `${this.accountsStore.fiatSymbol}${this.$n(+value, 'price')}`;
    },
    period() {
      return `${this.stakingNetwork.unbondPeriod} ${this.$t('common.days')}`;
    },
  },
});
</script>

<style lang="scss" scoped>
.unbond-form {
  .info-fee {
    margin-top: 10px;
  }

  .unbond-period {
    margin-bottom: 20px;
  }

  .disclaimer {
    display: flex;
    align-items: center;
    font-size: 0.875em;
    color: $default-white;
    margin: 0 0 10px 16px;

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
