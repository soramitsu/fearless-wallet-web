<template>
  <div>
    <SelectInput
      text="assets.sendButtonText"
      :totalAmount="transferableAmount1"
      :value="value1"
      :asset="asset1"
      :assetId="assetId1"
      :amount="syncedAmount1"
      :isRotate="false"
      :showIcon="false"
      :showOriginValue="syncedIsExchangeB"
      @update:amount="updateAmount1"
      @setMax="setMax(false)"
    />

    <SelectInput
      class="input-to"
      text="assets.receiveButtonText"
      :totalAmount="transferableAmount2"
      :value="value2"
      :asset="asset2"
      :assetId="assetId2"
      :amount="syncedAmount2"
      :isRotate="false"
      :showIcon="false"
      :showOriginValue="!syncedIsExchangeB"
      @update:amount="updateAmount2"
      @setMax="setMax(true)"
    />

    <div class="plus-icon">
      <Icon icon="plus-pink" class="img" :hover="false" />
    </div>

    <template v-if="isRemoveLiquidity">
      <div class="slider-info">
        <div class="slider-value" data-testid="sliderValue">{{ percent }}%</div>

        <EllipseButton text="common.max" :disabled="percentIsMax" @click="updatePercent" />
      </div>

      <Slider :value="percent" class="percent-slider" @updateValue="updatePercent" />
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { FPNumber } from '@sora-substrate/util';
import { calcTransferableSendMinusFee } from '@/helpers/currencies';

import { getCostOfAssets } from '@/helpers/transfers';
import { getAmountPoolValue } from '@/extension/messaging';
import { useNetworksStore } from '@/stores/networks';

export default defineComponent({ name: 'InputsForm' ,
  props: {
    poolParams: { type: Object },
    currency1: { type: Object },
    currency2: { type: Object },
    fee: { type: String },
    extrinsicType: String,
    amount1: { type: String },
    amount2: { type: String },
    isExchangeB: { type: Boolean },
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      percent: 0,
      isPercentChanging: false,
    };
  },
  computed: {
    isRemoveLiquidity() {
      return this.extrinsicType === 'removeLiquidity';
    },
    isAddLiquidity() {
      return this.extrinsicType === 'addLiquidity';
    },
    transferableAmount1() {
      if (this.isRemoveLiquidity) return this.poolParams.asset1.tokenBalance;

          return this.poolParams.asset1.transferableAmount;
    },
    transferableAmount2() {
      if (this.isRemoveLiquidity) return this.poolParams.asset2.tokenBalance;

          return this.poolParams.asset2.transferableAmount;
    },
    assetId1() {
      return this.poolParams.asset1.id;
    },
    assetId2() {
      return this.poolParams.asset2.id;
    },
    asset1() {
      return this.poolParams.asset1.name;
    },
    asset2() {
      return this.poolParams.asset2.name;
    },
    assetPrice1() {
      const priceId = this.poolParams.asset1.priceId;

          return this.networksStore.getAssetPrice(priceId).price;
    },
    assetPrice2() {
      const priceId = this.poolParams.asset2.priceId;

          return this.networksStore.getAssetPrice(priceId).price;
    },
    value1() {
      return getCostOfAssets(+(this.syncedAmount1 ?? 0), this.assetPrice1);
    },
    value2() {
      return getCostOfAssets(+(this.syncedAmount2 ?? 0), this.assetPrice2);
    },
    percentIsMax() {
      return this.percent === 100;
    },
    poolValueParams() {
      return {
            amount1: this.syncedAmount1,
            amount2: this.syncedAmount2,
            assetId1: this.assetId1,
            assetId2: this.assetId2,
            networkName: this.poolParams.network,
            isExchangeB: this.syncedIsExchangeB,
          };
    },
    syncedAmount1: {
      get() {
        return this.amount1;
      },
      set(value) {
        this.$emit('update:amount1', value);
      },
    },
    syncedAmount2: {
      get() {
        return this.amount2;
      },
      set(value) {
        this.$emit('update:amount2', value);
      },
    },
    syncedIsExchangeB: {
      get() {
        return this.isExchangeB;
      },
      set(value) {
        this.$emit('update:isExchangeB', value);
      },
    },
  },
  watch: {
    "transferableAmount1": 'watcherTransferable',
    "transferableAmount2": 'watcherTransferable',
    "percent": 'setMaxLiquidity',
    "syncedAmount1": 'watcherAmount1',
    "syncedAmount2": 'watcherAmount2',
  },
  methods: {
    watcherTransferable() {
      if (this.isPercentChanging) this.setMaxLiquidity();
    },
    setMaxLiquidity() {
      if (!this.isPercentChanging) return;

          const part = new FPNumber(this.percent).div(FPNumber.HUNDRED);

          const value1 = new FPNumber(this.transferableAmount1).mul(part).toString();
          const value2 = new FPNumber(this.transferableAmount2).mul(part).toString();

          this.syncedAmount1 = value1;
          this.syncedAmount2 = value2;
    },
    async watcherAmount1() {
      if (this.syncedIsExchangeB || this.isPercentChanging) return;

          if (this.isAddLiquidity) {
            if (this.poolParams.asset1.reserve === '0') return;

            this.syncedAmount2 = new FPNumber(this.syncedAmount1)
              .mul(new FPNumber(this.poolParams.asset2.reserve))
              .div(new FPNumber(this.poolParams.asset1.reserve))
              .toString();
          } else {
            this.syncedAmount2 = await getAmountPoolValue(this.poolValueParams);

            const percent = Math.round(
              new FPNumber(this.syncedAmount1).div(new FPNumber(this.transferableAmount1)).mul(FPNumber.HUNDRED).toNumber()
            );

            this.percent = Math.min(percent, 100);
          }
    },
    async watcherAmount2() {
      if (!this.syncedIsExchangeB || this.isPercentChanging) return;

          if (this.isAddLiquidity) {
            if (this.poolParams.asset2.reserve === '0') return;

            this.syncedAmount1 = new FPNumber(this.syncedAmount2)
              .mul(new FPNumber(this.poolParams.asset1.reserve))
              .div(new FPNumber(this.poolParams.asset2.reserve))
              .toString();
          } else {
            this.syncedAmount1 = await getAmountPoolValue(this.poolValueParams);

            const percent = Math.round(
              new FPNumber(this.syncedAmount2).div(new FPNumber(this.transferableAmount2)).mul(FPNumber.HUNDRED).toNumber()
            );

            this.percent = Math.min(percent, 100);
          }
    },
    updateAmount1(value: string) {
      const isOverValue = FPNumber.gt(new FPNumber(value), new FPNumber(this.transferableAmount1));

          if (this.isRemoveLiquidity && isOverValue) {
            this.isPercentChanging = true;

            this.setMax(this.syncedIsExchangeB);

            return;
          }

          this.syncedAmount1 = value;
          this.syncedIsExchangeB = false;
          this.isPercentChanging = false;
    },
    updateAmount2(value: string) {
      const isOverValue = FPNumber.gt(new FPNumber(value), new FPNumber(this.transferableAmount2));

          if (this.isRemoveLiquidity && isOverValue) {
            this.isPercentChanging = true;

            this.setMax(this.syncedIsExchangeB);

            return;
          }

          this.syncedAmount2 = value;
          this.syncedIsExchangeB = true;
          this.isPercentChanging = false;
    },
    calcTransferableSendMinusFee(isExchangeB: boolean) {
      const currency = isExchangeB ? this.currency2 : this.currency1;

          return calcTransferableSendMinusFee(currency, this.poolParams.network, this.fee);
    },
    setMax(isExchangeB: boolean) {
      if (this.isRemoveLiquidity) this.updatePercent(100);
          else {
            this.syncedIsExchangeB = isExchangeB;
            this.isPercentChanging = false;

            if (isExchangeB) this.syncedAmount2 = this.calcTransferableSendMinusFee(isExchangeB);
            else this.syncedAmount1 = this.calcTransferableSendMinusFee(isExchangeB);
          }
    },
    updatePercent(percent = 100) {
      this.percent = percent;
          this.isPercentChanging = true;
          this.syncedIsExchangeB = false;
    },
  },
});
</script>

<style lang="scss" scoped>
.input-to {
  margin: 7px 0 14px;
}

.plus-icon {
  border-radius: 50%;
  background-color: rgb(29, 29, 29);
  width: 46px;
  height: 46px;
  display: flex;
  justify-content: center;
  align-items: center;
  margin: -46px auto 0;
  border: $secondary-border;
  opacity: 1;
  position: relative;
  top: -92px;
  cursor: pointer;

  .img {
    height: 20px;
    width: 20px;
  }
}

.slider-info {
  display: flex;
  justify-content: space-between;
  padding: 0 5px;

  .slider-value {
    font-size: 1.5em;
    font-weight: 700;
    text-align: left;
    color: $pink-color;
  }
}

.percent-slider {
  width: 503px;
  margin: auto;
}
</style>
