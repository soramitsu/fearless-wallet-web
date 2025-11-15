<template>
  <div>
    <FSelect
      v-if="showMarketType"
      :value="syncedMarketType"
      :options="optionsSubstrateKeyPair"
      placeholder="assets.market"
      size="big"
      class="row"
      @change="updateSyncedMarketType"
    />

    <ValidatedInput
      :value="slippagePercent"
      placeholder="assets.slippageTolerance"
      data-testid="slippagePercent"
      class="row"
      :errorDescriptions="warningMessage"
      :isError="isErrorSlippageInput"
      :readonly="true"
    />

    <div class="slippage-values row">
      <div
        v-for="{ label, value } in slippageValues"
        :key="value"
        :class="getSlippageClasses(value)"
        data-testid="slippageValue"
        @click="setSlippage(value)"
      >
        {{ label }}
      </div>
    </div>

    <div class="slippage-warning" data-testid="slippageWarning">{{ $t('assets.slippageWarning') }}</div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MarketType } from '@/interfaces';

const props = defineProps<{
  text?: string;
  temporaryMarketType?: string;
  temporarySlippage: number;
}>();

const emit = defineEmits<{
  'update:temporaryMarketType': [value: string];
  'update:temporarySlippage': [value: number];
}>();

const { t } = useI18n();

const optionsSubstrateKeyPair = [
  { label: MarketType.SMART, value: MarketType.SMART },
  { label: MarketType.TBC, value: MarketType.TBC },
];

const slippageValues = [
  { label: '0.1%', value: 0.1, warningText: 'assets.transactionMayFail' },
  { label: '0.5%', value: 0.5 },
  { label: '1%', value: 1 },
  { label: '2%', value: 2 },
  { label: '3%', value: 3 },
  { label: '4%', value: 4 },
  { label: '5%', value: 5, warningText: 'assets.transactionFrontrun' },
];

const marketTypeModel = computed({
  get: () => props.temporaryMarketType,
  set: (value: string | undefined) => {
    if (value !== undefined) emit('update:temporaryMarketType', value);
  },
});

const slippageModel = computed({
  get: () => props.temporarySlippage,
  set: (value: number) => emit('update:temporarySlippage', value),
});

const showMarketType = computed(() => marketTypeModel.value !== undefined);

const slippagePercent = computed(() => `${slippageModel.value} %`);

const isErrorSlippageInput = computed(() =>
  slippageValues.filter(({ warningText }) => warningText).some(({ value }) => value === slippageModel.value)
);

const warningMessage = computed(() => {
  const { warningText } = slippageValues.find(({ value }) => value === slippageModel.value) ?? {};

  if (!warningText) return '';

  return t(warningText, { value: slippageModel.value });
});

function setSlippage(value: number) {
  slippageModel.value = value;
}

function updateSyncedMarketType(value: string) {
  marketTypeModel.value = value;
}

function getSlippageClasses(value: number) {
  return [
    'slippage-value',
    {
      'selected-value': value === slippageModel.value,
    },
  ];
}
</script>

<style lang="scss" scoped>
.row {
  margin-bottom: 16px !important;
}

.slippage-values {
  display: flex;

  .slippage-value {
    background: $secondary-background-color;
    border-radius: 30px;
    height: 30px;
    width: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 10px;
    font-weight: 700;
    font-size: 0.75rem;
    margin-right: 16px;
    cursor: pointer;
    user-select: none;

    &:hover {
      border: $default-border;
    }
  }

  .selected-value {
    background-color: $pink-purple-color;
  }
}

.slippage-warning {
  font-size: 0.75rem;
  color: $gray-color;
  width: 370px;
  margin: 0 auto;
}
</style>
