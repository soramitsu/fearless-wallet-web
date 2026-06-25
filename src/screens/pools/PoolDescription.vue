<template>
  <div>
    <InfoRow v-if="showAdditionalInfo && marketType" text="assets.market" :value="marketType" />

    <InfoRow v-if="showAdditionalInfo && isActivityForm" text="assets.slippage" :value="`${slippage}%`" />

    <InfoRow text="pools.rewardsPayout" :value="rewardAsset" iconValue="polkaswap" />

    <InfoRow v-if="showAdditionalInfo" text="pools.yourPoolShare" :value="yourShare" />

    <template v-if="showAdditionalInfo && isActivityForm">
      <Tooltip text="assets.networkFeeSora" target=".network-fee" placement="right" />

      <InfoRow
        text="assets.networkFee"
        :value="fee ? `${fee} ${soraMainAsset}` : undefined"
        :price="`${accountsStore.fiatSymbol} ${feePrice}`"
        icon="info"
        :iconClasses="['network-fee']"
      />
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { getShareOfPool } from '@/extension/messaging';
import { getXORCurrency } from '@/helpers/currencies';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'PoolDescription' ,
  props: {
    poolParams: { type: Object },
    showAdditionalInfo: Boolean,
    slippage: Number,
    isExchangeB: Boolean,
    marketType: String,
    amount1: String,
    amount2: String,
    fee: String,
    extrinsicType: String,
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
      estimatedYourShare: '',
      _poolParams: null,
    };
  },
  computed: {
    soraMainAsset() {
      return this.currencyXOR.symbol;
    },
    currencyXOR() {
      return getXORCurrency(this.accountsStore.balances);
    },
    feePrice() {
      const fee = this.fee ?? 0;
          const balance = this.networksStore.getAssetPrice(this.currencyXOR?.priceId ?? '').price * +fee;

          return this.$n(+balance, 'price');
    },
    rewardAsset() {
      return this.poolParams?.rewardAsset;
    },
    yourShare() {
      return `${this.$n(+this.estimatedYourShare, 'decimalPrecise')}%`;
    },
    isMyPool() {
      return this.poolParams.isMyPool;
    },
    isActivityForm() {
      return this.extrinsicType !== '';
    },
  },
  watch: {
    "amount1": 'calculateShare',
    "amount2": 'calculateShare',
    "poolParams": 'calculateShare2',
  },
  created() {
    this.calculateShare();
  },
  methods: {
    async calculateShare() {
      if (!this.poolParams) return;

          this.estimatedYourShare = await this.getShareOfPool();
    },
    async calculateShare2() {
      if (!this.poolParams) return;

          if (
            this._poolParams?.asset1.id === this.poolParams.asset1.id &&
            this._poolParams?.asset2.id === this.poolParams.asset2.id &&
            this._poolParams?.network === this.poolParams.network
          )
            return;

          this.estimatedYourShare = await this.getShareOfPool();

          this._poolParams = this.poolParams;
    },
    async getShareOfPool() {
      return await getShareOfPool({
            amount1: this.amount1,
            amount2: this.amount2,
            assetId1: this.poolParams.asset1.id,
            assetId2: this.poolParams.asset2.id,
            networkName: this.poolParams.network,
            type: this.extrinsicType || 'addLiquidity',
            isExchangeB: this.isExchangeB,
          });
    },
  },
});
</script>
