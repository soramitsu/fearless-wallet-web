<template>
  <div>
    <Select
      v-model="syncedMarketType"
      :options="optionsSubstrateKeyPair"
      placeholder="asset.market"
      size="big"
      class="row"
    />

    <ValidatedInput
      v-model="slippagePercent"
      placeholder="asset.slippage"
      typeText="uppercase"
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
        @click="setSlippage(value)"
      >
        {{ label }}
      </div>
    </div>

    <div class="slippage-warning">{{ $t('asset.slippageWarning') }}</div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync } from 'vue-property-decorator';

@Component
export default class SwapSettings extends Vue {
  readonly optionsSubstrateKeyPair = [{ label: 'SMART', value: 'smart' }];
  readonly slippageValues = [
    { label: '0.1%', value: 0.1 },
    { label: '0.5%', value: 0.5 },
    { label: '1%', value: 1 },
    { label: '2%', value: 2 },
    { label: '3%', value: 3 },
    { label: '4%', value: 4 },
    { label: '5%', value: 5 },
  ];

  inputIsFocused = 'smart';

  @Prop({ default: '' }) text!: string;
  @PropSync('temporaryMarketType', { type: String }) syncedMarketType!: string;
  @PropSync('temporarySlippage', { type: Number }) syncedSlippage!: number;

  get slippagePercent() {
    return `${this.syncedSlippage} %`;
  }

  get isErrorSlippageInput() {
    return [0.1].includes(this.syncedSlippage); // [0.1, 0.5]
  }

  get warningMessage() {
    return this.$t('asset.transactionFrontrun', { value: this.syncedSlippage });
  }

  setSlippage(value: number) {
    this.syncedSlippage = value;
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
      border: 1px solid $default-background-color;
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

.transaction-warning {
  color: $error-color !important;
  font-size: 14px;
  margin-left: 16px;
}
</style>
