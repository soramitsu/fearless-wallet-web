<template>
  <div>
    <FSelect
      v-if="showMarketType"
      :value="syncedMarketType"
      :options="optionsSubstrateKeyPair"
      :disabled="false"
      placeholder="assets.market"
      size="big"
      class="row"
      @change="updateSyncedMarketType"
    />

    <ValidatedInput
      :value="slippagePercent"
      placeholder="assets.slippageTolerance"
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

<script lang="ts">
import { Component, Vue, Prop, PropSync } from 'vue-property-decorator';
import { MarketType } from '@/interfaces';

@Component
export default class PolkaswapSettings extends Vue {
  readonly optionsSubstrateKeyPair = [
    { label: MarketType.SMART, value: MarketType.SMART },
    { label: MarketType.TBC, value: MarketType.TBC },
  ];

  readonly slippageValues = [
    { label: '0.1%', value: 0.1, warningText: 'assets.transactionMayFail' },
    { label: '0.5%', value: 0.5 },
    { label: '1%', value: 1 },
    { label: '2%', value: 2 },
    { label: '3%', value: 3 },
    { label: '4%', value: 4 },
    { label: '5%', value: 5, warningText: 'assets.transactionFrontrun' },
  ];

  @Prop({ default: '' }) text!: string;
  @PropSync('temporaryMarketType', { type: String }) syncedMarketType!: string;
  @PropSync('temporarySlippage', { type: Number }) syncedSlippage!: number;

  get showMarketType() {
    return this.syncedMarketType !== undefined;
  }

  get slippagePercent() {
    return `${this.syncedSlippage} %`;
  }

  get isErrorSlippageInput() {
    return this.slippageValues
      .filter(({ warningText }) => warningText)
      .map(({ value }) => value)
      .includes(this.syncedSlippage);
  }

  get warningMessage() {
    const { warningText } = this.slippageValues.find(({ value }) => value === this.syncedSlippage)!;

    return this.$t(warningText!, { value: this.syncedSlippage });
  }

  setSlippage(value: number) {
    this.syncedSlippage = value;
  }

  updateSyncedMarketType(value: string) {
    this.syncedMarketType = value;
  }

  getSlippageClasses(value: number) {
    return [
      'slippage-value',
      {
        'selected-value': value === this.syncedSlippage,
      },
    ];
  }
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
    font-size: 12px;
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
  font-size: 12px;
  color: $gray-color;
  width: 370px;
  margin: 0 auto;
}
</style>
