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

        <div class="price" data-testid="fiatAmount">{{ accountsStore.fiatSymbol }}{{ valueCut }}</div>
      </div>

      <div class="column right-column">
        <FCorners class="FCorners-button" @click="click">
          <button data-testid="selectBtn" :class="selectButtonClasses">
            <template v-if="asset !== ''">
              <ExternalLogo class="asset-icon" :name="assetIcon" :width="32" />

              <div class="asset" data-testid="asset">{{ asset.toUpperCase() }}</div>
            </template>

            <div v-else class="select-label">Select</div>

            <Rotate v-if="showIconRotate" :isActive="syncedIsRotate" class="rotate-asset">
              <Icon icon="down" data-testid="rotateAsset" />
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
import { defineComponent } from 'vue';

import { FPNumber } from '@sora-substrate/util';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'SelectInput' ,
  props: {
    text: { default: '' },
    asset: { default: '' },
    assetId: { default: '' },
    value: { default: '' },
    totalAmount: { default: 0 },
    showBalance: { default: true },
    readonly: { default: false },
    showIcon: { default: true },
    showOriginValue: { default: false },
    amount: { type: String },
    isRotate: { type: Boolean },
  },
  data() {
    return {
      accountsStore: useAccountsStore(),
      inputIsFocused: false,
    };
  },
  computed: {
    showIconRotate() {
      return this.showIcon && !this.readonly;
    },
    isSelected() {
      return this.inputIsFocused && !this.readonly;
    },
    amountInternal: {
      get() {
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
      },
      set(_value: string) {
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
      },
    },
    header() {
      return this.$t(this.text);
    },
    tokenGroup() {
      return this.accountsStore.balances.find(({ groupId }) => groupId === this.assetId);
    },
    assetIcon() {
      return this.tokenGroup?.icon;
    },
    valueCut() {
      return this.$n(+this.value, 'price');
    },
    balanceValueClasses() {
      return [
            'balance-value',
            {
              'balance-value-readonly': this.readonly,
            },
          ];
    },
    selectButtonClasses() {
      return [
            'select-button',
            {
              'select-button-readonly': this.readonly,
            },
          ];
    },
    selectClasses() {
      return [
            'select',
            {
              'select-focused': this.inputIsFocused && !this.readonly,
            },
          ];
    },
    syncedAmount: {
      get() {
        return this.amount;
      },
      set(value) {
        this.$emit('update:amount', value);
      },
    },
    syncedIsRotate: {
      get() {
        return this.isRotate;
      },
      set(value) {
        this.$emit('update:isRotate', value);
      },
    },
  },
  methods: {
    IsNumber(event: KeyboardEvent) {
      if (!/\d/.test(event.key) && event.key !== '.') return event.preventDefault();
    },
    setFocusValue(value: boolean) {
      this.inputIsFocused = value;

          if (!value) {
            const [wholePart, fractionalPart] = this.syncedAmount.split('.');

            if (+fractionalPart === 0) this.syncedAmount = wholePart;
          }
    },
    setMax() {
      if (this.readonly) return;

          this.$emit('setMax');
    },
    click() {
      if (this.readonly) return;

          this.$emit('togglePopupVisibility');
    },
  },
});
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
      font-size: 0.75rem;
      text-transform: uppercase;
    }

    .price {
      font-size: 0.75rem;
    }

    input {
      margin: 5px 0;
      background: none;
      border: none;
      outline: none;
      color: white;
      width: 250px;
      font-weight: 700;
      font-size: 1.25rem;
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
        border-radius: 50%;
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
      font-size: 0.75rem;
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
