<template>
  <div>
    <SelectInput
      text="assets.sendButtonText"
      :totalAmount="transferableAmount1"
      :value="value1"
      :asset="asset1"
      :assetId="assetId1"
      :amount="amount1Model"
      :isRotate="false"
      :showIcon="false"
      :showOriginValue="isExchangeBModel"
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
      :amount="amount2Model"
      :isRotate="false"
      :showIcon="false"
      :showOriginValue="!isExchangeBModel"
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

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import type { PoolParams } from '@/stores';
import type { TokenGroup } from '@/extension/background/extension-base/src/background/types/types';
import { FPNumber } from '@/lib/fpNumber';
import { calcTransferableSendMinusFee } from '@/helpers/currencies';

import { getCostOfAssets } from '@/helpers/transfers';
import { getAmountPoolValue } from '@/extension/messaging';
import { useNetworksStore } from '@/stores/networks';

const props = defineProps<{
  amount1: string;
  amount2: string;
  isExchangeB: boolean;
  poolParams: PoolParams;
  currency1: TokenGroup;
  currency2: TokenGroup;
  fee: string;
  extrinsicType: 'addLiquidity' | 'removeLiquidity' | '';
}>();

const emit = defineEmits<{
  'update:amount1': [value: string];
  'update:amount2': [value: string];
  'update:isExchangeB': [value: boolean];
}>();

const networksStore = useNetworksStore();
const percent = ref(0);
const isPercentChanging = ref(false);

const amount1Model = computed({
  get: () => props.amount1,
  set: (value: string) => emit('update:amount1', value),
});

const amount2Model = computed({
  get: () => props.amount2,
  set: (value: string) => emit('update:amount2', value),
});

const isExchangeBModel = computed({
  get: () => props.isExchangeB,
  set: (value: boolean) => emit('update:isExchangeB', value),
});

const isRemoveLiquidity = computed(() => props.extrinsicType === 'removeLiquidity');
const isAddLiquidity = computed(() => props.extrinsicType === 'addLiquidity');

const transferableAmount1 = computed(() =>
  isRemoveLiquidity.value ? props.poolParams.asset1.tokenBalance : props.poolParams.asset1.transferableAmount
);

const transferableAmount2 = computed(() =>
  isRemoveLiquidity.value ? props.poolParams.asset2.tokenBalance : props.poolParams.asset2.transferableAmount
);

const assetId1 = computed(() => props.poolParams.asset1.id);
const assetId2 = computed(() => props.poolParams.asset2.id);
const asset1 = computed(() => props.poolParams.asset1.name);
const asset2 = computed(() => props.poolParams.asset2.name);

const assetPrice1 = computed(() => {
  const priceId = props.poolParams.asset1.priceId;

  return networksStore.getAssetPrice(priceId).price;
});

const assetPrice2 = computed(() => {
  const priceId = props.poolParams.asset2.priceId;

  return networksStore.getAssetPrice(priceId).price;
});

const value1 = computed(() => getCostOfAssets(+amount1Model.value || 0, assetPrice1.value));
const value2 = computed(() => getCostOfAssets(+amount2Model.value || 0, assetPrice2.value));

const percentIsMax = computed(() => percent.value === 100);

const poolValueParams = computed(() => ({
  amount1: amount1Model.value,
  amount2: amount2Model.value,
  assetId1: assetId1.value,
  assetId2: assetId2.value,
  networkName: props.poolParams.network,
  isExchangeB: isExchangeBModel.value,
}));

watch(
  () => [transferableAmount1.value, transferableAmount2.value],
  () => {
    if (isPercentChanging.value) setMaxLiquidity();
  }
);

watch(
  () => percent.value,
  () => {
    if (!isPercentChanging.value) return;

    setMaxLiquidity();
  }
);

watch(
  () => amount1Model.value,
  async () => {
    if (isExchangeBModel.value || isPercentChanging.value) return;

    if (isAddLiquidity.value) {
      if (props.poolParams.asset1.reserve === '0') return;

      const result = new FPNumber(amount1Model.value)
        .mul(new FPNumber(props.poolParams.asset2.reserve))
        .div(new FPNumber(props.poolParams.asset1.reserve))
        .toString();

      amount2Model.value = result;
    } else {
      amount2Model.value = await getAmountPoolValue(poolValueParams.value);

      const calculatedPercent = Math.round(
        new FPNumber(amount1Model.value).div(new FPNumber(transferableAmount1.value)).mul(FPNumber.HUNDRED).toNumber()
      );

      percent.value = Math.min(calculatedPercent, 100);
    }
  }
);

watch(
  () => amount2Model.value,
  async () => {
    if (!isExchangeBModel.value || isPercentChanging.value) return;

    if (isAddLiquidity.value) {
      if (props.poolParams.asset2.reserve === '0') return;

      const result = new FPNumber(amount2Model.value)
        .mul(new FPNumber(props.poolParams.asset1.reserve))
        .div(new FPNumber(props.poolParams.asset2.reserve))
        .toString();

      amount1Model.value = result;
    } else {
      amount1Model.value = await getAmountPoolValue(poolValueParams.value);

      const calculatedPercent = Math.round(
        new FPNumber(amount2Model.value).div(new FPNumber(transferableAmount2.value)).mul(FPNumber.HUNDRED).toNumber()
      );

      percent.value = Math.min(calculatedPercent, 100);
    }
  }
);

function setMaxLiquidity() {
  if (!isPercentChanging.value) return;

  const part = new FPNumber(percent.value).div(FPNumber.HUNDRED);

  const value1Result = new FPNumber(transferableAmount1.value).mul(part).toString();
  const value2Result = new FPNumber(transferableAmount2.value).mul(part).toString();

  amount1Model.value = value1Result;
  amount2Model.value = value2Result;
}

function updateAmount1(value: string) {
  const isOverValue = FPNumber.gt(new FPNumber(value), new FPNumber(transferableAmount1.value));

  if (isRemoveLiquidity.value && isOverValue) {
    isPercentChanging.value = true;

    setMax(isExchangeBModel.value);

    return;
  }

  amount1Model.value = value;
  isExchangeBModel.value = false;
  isPercentChanging.value = false;
}

function updateAmount2(value: string) {
  const isOverValue = FPNumber.gt(new FPNumber(value), new FPNumber(transferableAmount2.value));

  if (isRemoveLiquidity.value && isOverValue) {
    isPercentChanging.value = true;

    setMax(isExchangeBModel.value);

    return;
  }

  amount2Model.value = value;
  isExchangeBModel.value = true;
  isPercentChanging.value = false;
}

function getTransferableMinusFee(isExchangeB: boolean) {
  const currency = isExchangeB ? props.currency2 : props.currency1;

  return calcTransferableSendMinusFee(currency, props.poolParams.network, props.fee);
}

function setMax(isExchangeB: boolean) {
  if (isRemoveLiquidity.value) {
    updatePercent(100);
  } else {
    isExchangeBModel.value = isExchangeB;
    isPercentChanging.value = false;

    if (isExchangeB) amount2Model.value = getTransferableMinusFee(isExchangeB);
    else amount1Model.value = getTransferableMinusFee(isExchangeB);
  }
}

function updatePercent(newPercent = 100) {
  percent.value = newPercent;
  isPercentChanging.value = true;
  isExchangeBModel.value = false;
}
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
