<template>
  <FCorners size="big" :isSelected="isSelected">
    <div :class="selectClasses">
      <div class="column left-column">
        <div class="header" data-testid="headerSelectInput">{{ header }}</div>

        <input
          v-model="amountInternal"
          placeholder="0.00"
          :readonly="readonly"
          data-testid="amountInternal"
          @focus="setFocusValue(true)"
          @blur="setFocusValue(false)"
          @keypress="IsNumber"
        />

        <div class="price" data-testid="fiatAmount">{{ fiatSymbol }}{{ valueCut }}</div>
      </div>

      <div class="column right-column">
        <FCorners class="FCorners-button" @click.native="click">
          <button data-testid="selectBtn" :class="selectButtonClasses">
            <template v-if="asset !== ''">
              <ExternalLogo class="asset-icon" :name="assetIcon" :width="32" />

              <div class="asset" data-testid="asset">{{ asset.toUpperCase() }}</div>
            </template>

            <div v-else class="select-label">Select</div>

            <Rotate v-if="showIconRotate" :isActive="syncedIsRotate" class="rotate-asset">
              <SIcon name="chevron-bottom-16" data-testid="rotateAsset" />
            </Rotate>
          </button>
        </FCorners>

        <div v-if="showBalance" class="balance" data-testid="balance">
          {{ $t('assets.balance') }}

          <div :class="balanceValueClasses" data-testid="balanceValue" @click="setMax">
            &nbsp;{{ $n(+totalAmount, 'decimal') }}
          </div>
        </div>
      </div>
    </div>
  </FCorners>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { FPNumber } from '@sora-substrate/util';
import type { TokenGroup } from '@extension-base/background/types/types';
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
  @Prop({ default: true }) showIcon!: boolean;
  @Prop({ default: false }) showOriginValue!: boolean;
  @PropSync('amount', { type: String }) syncedAmount!: string;
  @PropSync('isRotate', { type: Boolean }) syncedIsRotate!: boolean;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenGroup[];

  get showIconRotate() {
    return this.showIcon && !this.readonly;
  }

  get isSelected() {
    return this.inputIsFocused && !this.readonly;
  }

  get amountInternal() {
    if (this.syncedAmount === '') return '';

    if (this.showOriginValue) return this.syncedAmount;

    if (this.syncedAmount.includes('.')) {
      const [wholePart, fractionalPart] = this.syncedAmount.split('.');
      const localString = FPNumber.fromCodecValue(wholePart || 0, 0).toLocaleString();

      if (this.syncedAmount.endsWith('.')) return `${localString}.`;

      if (localString === 'NaN') return this.syncedAmount;

      return `${localString}.${fractionalPart}`;
    }

    return FPNumber.fromCodecValue(this.syncedAmount || 0, 0).toLocaleString();
  }

  set amountInternal(_value: string) {
    const value = _value.replaceAll(',', '').replaceAll(' ', '');

    if (value.length < this.syncedAmount.length) {
      this.syncedAmount = value;

      return;
    }

    if (FPNumber.fromCodecValue(value || 0, 0).toLocaleString() !== 'NaN') {
      if (value.includes('.')) {
        const [wholePart, fractionalPart] = value.split('.');

        if (value.endsWith('.')) {
          this.syncedAmount = this.syncedAmount = `${wholePart}.`;

          return;
        }

        this.syncedAmount = `${wholePart}.${fractionalPart}`;

        return;
      }

      this.syncedAmount = value;
    }
  }

  get header() {
    return this.$t(this.text);
  }

  get tokenGroup() {
    return this.balances.find(({ groupId }) => groupId === this.assetId);
  }

  get assetIcon() {
    return this.tokenGroup?.icon;
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

    if (!value) {
      const [wholePart, fractionalPart] = this.syncedAmount.split('.');

      if (+fractionalPart === 0) this.syncedAmount = wholePart;
    }
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
  border: $secondary-border;
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
      font-size: 0.75em;
      text-transform: uppercase;
    }

    .price {
      font-size: 0.75em;
    }

    input {
      margin: 5px 0;
      background: none;
      border: none;
      outline: none;
      color: white;
      width: 250px;
      font-weight: 700;
      font-size: 1.25em;
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

    .FCorners-button {
      width: fit-content;
    }

    .select-button {
      display: flex;
      justify-content: center;
      align-items: center;
      clip-path: $medium-clip-path-left-top-and-right-bottom;
      height: 42px;
      min-width: 100px;
      background-color: $secondary-background-color;
      color: white;
      border: $default-border;
      border-radius: 4px;
      min-width: 122px;
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
      // opacity: 0.5;
    }

    .balance {
      display: flex;
      font-size: 0.75em;
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

.fw-web {
  .select {
    .left-column {
      input {
        width: 100%;
      }
    }
  }
}
</style>
