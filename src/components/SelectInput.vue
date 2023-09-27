<template>
  <Corners size="big" :isSelected="isSelected">
    <div :class="selectClasses">
      <div class="column left-column">
        <div class="header">{{ header }}</div>

        <input
          v-model="amountInternal"
          placeholder="0.00"
          :readonly="readonly"
          @focus="setFocusValue(true)"
          @blur="setFocusValue(false)"
          @keypress="IsNumber"
        />

        <div class="price">{{ fiatSymbol }}{{ valueCut }}</div>
      </div>

      <div class="column right-column">
        <Corners class="corners-button" @click.native="click">
          <button :class="selectButtonClasses">
            <template v-if="asset !== ''">
              <ExternalLogo class="asset-icon" :name="assetIcon" :width="32" />

              <div class="asset">{{ asset.toUpperCase() }}</div>
            </template>

            <div v-else class="select-label">Select</div>

            <Rotate :isActive="syncedIsRotate" class="rotate-asset">
              <SIcon name="chevron-bottom-16" />
            </Rotate>
          </button>
        </Corners>

        <div v-if="showBalance" class="balance">
          {{ $t('assets.balance') }}

          <div :class="balanceValueClasses" @click="setMax">&nbsp;{{ $n(totalAmount, 'decimal') }}</div>
        </div>
      </div>
    </div>
  </Corners>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { FPNumber } from '@sora-substrate/util';
import type { TokenBalance } from '@extension-base/background/types/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

@Component
export default class SelectInput extends Vue {
  inputIsFocused = false;

  @Prop({ default: '' }) text!: string;
  @Prop({ default: '' }) asset!: string;
  @Prop({ default: '' }) assetId!: string;
  @Prop({ default: '' }) value!: string;
  @Prop({ default: 0 }) totalAmount!: number;
  @Prop({ default: true }) showBalance!: boolean;
  @Prop({ default: false }) readonly!: boolean;
  @PropSync('amount', { type: String }) syncedAmount!: string;
  @PropSync('isRotate', { type: Boolean }) syncedIsRotate!: boolean;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];

  get isSelected() {
    return this.inputIsFocused && !this.readonly;
  }

  get amountInternal() {
    if (this.syncedAmount === '') return '';

    if (this.syncedAmount.endsWith('0')) return this.syncedAmount;

    const localString = FPNumber.fromCodecValue(this.syncedAmount || 0, 0).toLocaleString();

    if (this.syncedAmount.endsWith('.')) return `${localString}.`;

    if (localString === 'NaN') return this.syncedAmount;

    return localString;
  }

  set amountInternal(_value: string) {
    const value = _value.replaceAll(',', '').replaceAll(' ', '');

    if (value.length < this.syncedAmount.length) {
      this.syncedAmount = value;

      return;
    }

    if (FPNumber.fromCodecValue(value || 0, 0).toLocaleString() !== 'NaN') {
      const string = FPNumber.fromCodecValue(value || 0, 0).toString();

      if (value.endsWith('0') && value.includes('.')) {
        const zeros = value.match(/[0]*$/)!;

        this.syncedAmount = `${string}.${zeros}`;

        return;
      }

      if (value.endsWith('.')) {
        this.syncedAmount = this.syncedAmount = `${string}.`;

        return;
      }

      this.syncedAmount = string;
    }
  }

  get header() {
    return this.$t(this.text);
  }

  get assetIcon() {
    return this.balances.find(
      ({ assetId, balances }) => assetId === this.assetId || balances.some((el) => el.id === this.assetId)
    )?.icon;
  }

  get valueCut() {
    return this.$n(+this.value, 'price');
  }

  get balanceValueClasses() {
    return [
      'balance-value',
      {
        'balance-value-readonly': this.readonly,
      },
    ];
  }

  get selectButtonClasses() {
    return [
      'select-button',
      {
        'select-button-readonly': this.readonly,
      },
    ];
  }

  get selectClasses() {
    return [
      'select',
      {
        'select-focused': this.inputIsFocused && !this.readonly,
      },
    ];
  }

  IsNumber(event: KeyboardEvent) {
    if (!/\d/.test(event.key) && event.key !== '.') return event.preventDefault();
  }

  setFocusValue(value: boolean) {
    this.inputIsFocused = value;

    if (!value) this.syncedAmount = FPNumber.fromCodecValue(this.syncedAmount || 0, 0).toString();
  }

  setMax() {
    if (this.readonly) return;

    this.$emit('setMax');
  }

  click() {
    if (this.readonly) return;

    this.$emit('togglePopupVisibility');
  }
}
</script>

<style lang="scss" scoped>
.select-focused {
  border: 1px solid #7700ee !important;
}

.select {
  padding: 16px;
  width: 100%;
  height: 96px;
  background-color: $secondary-background-color;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;
  border: 1px solid $secondary-background-color;
  display: flex;
  justify-content: space-between;
  color: $gray-color;

  .column {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    max-width: 250px;
  }

  .left-column {
    text-align: left;

    .header {
      font-weight: 700;
      font-size: 12px;
      text-transform: uppercase;
    }

    .price {
      font-size: 12px;
    }

    input {
      margin: 5px 0;
      background: none;
      border: none;
      outline: none;
      color: white;
      width: 250px;
      font-weight: 700;
      font-size: 20px;
    }

    // hide arrows
    /* Chrome, Safari, Edge, Opera */
    input::-webkit-outer-spin-button,
    input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    /* Firefox */
    input[type='number'] {
      -moz-appearance: textfield;
    }
  }

  .select-label {
    color: $gray-color;
  }

  .right-column {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: center;

    .corners-button {
      width: fit-content;
    }

    .select-button {
      display: flex;
      justify-content: center;
      align-items: center;
      clip-path: $medium-clip-path-left-top-and-right-bottom;
      height: 42px;
      min-width: 122px;
      background-color: $secondary-background-color;
      color: white;
      border: 1px solid $default-background-color;
      border-radius: 4px;
      cursor: pointer;

      .asset-icon {
        height: 24px !important;
        width: 24px !important;
      }

      .asset {
        margin-left: 5px;
      }

      .rotate-asset {
        margin-left: 5px;
      }

      .s-icon-chevron-bottom-16 {
        color: $gray-color;
      }
    }

    .select-button-readonly {
      cursor: default;
      opacity: 0.5;
    }

    .balance {
      display: flex;
      font-size: 12px;
      user-select: none;
      max-width: 250px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-top: 5px;

      .balance-value {
        cursor: pointer;
        color: $pink-lavender-color;
      }

      .balance-value-readonly {
        cursor: default;
      }
    }
  }
}
</style>
