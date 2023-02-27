<template>
  <Corners size="big" :isSelected="inputIsFocused">
    <div :class="selectClasses">
      <div class="column left-column">
        <div class="header">{{ $t(text).toUpperCase() }}</div>

        <input
          v-model="syncedAmount"
          placeholder="0.00"
          type="number"
          @focus="setFocusValue(true)"
          @blur="setFocusValue(false)"
        />

        <div class="price">{{ fiatSymbol }}{{ valueCut }}</div>
      </div>

      <div class="column right-column">
        <Corners class="corners-button" @click.native="$emit('toggleSelectAssetPopupVisibility')">
          <button class="select-button">
            <template v-if="asset !== ''">
              <ExternalLogo class="asset-icon" :name="asset" :width="32" />

              <div class="asset">{{ asset.toUpperCase() }}</div>
            </template>

            <div v-else class="select-label">Select</div>

            <Rotate :isActive="syncedIsRotate" class="rotate-asset">
              <SIcon name="chevron-bottom-16" />
            </Rotate>
          </button>
        </Corners>

        <div class="balance">
          Balance:
          <div class="balance-value" @click="setMax">{{ balance }}</div>
        </div>
      </div>
    </div>
  </Corners>
</template>

<script lang="ts">
import { Component, Vue, Prop, PropSync } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { formattedPrice } from '@/helpers/numbers';

@Component
export default class SwapSelectInput extends Vue {
  inputIsFocused = false;

  @Prop({ default: '' }) text!: string;
  @Prop({ default: '' }) asset!: string;
  @Prop({ default: '' }) value!: string;
  @Prop({ default: '' }) balance!: string;
  @PropSync('amount', { type: String }) syncedAmount!: string;
  @PropSync('isRotate', { type: Boolean }) syncedIsRotate!: boolean;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;

  get valueCut() {
    return formattedPrice(+this.value);
  }

  get selectClasses() {
    return [
      'select',
      {
        'select-focused': this.inputIsFocused,
      },
    ];
  }

  setFocusValue(value: boolean) {
    this.inputIsFocused = value;
  }

  setMax() {
    this.$emit('setMax');
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

    .balance {
      display: flex;
      font-size: 12px;
      user-select: none;
      max-width: 250px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;

      .balance-value {
        cursor: pointer;
        color: $pink-lavender-color;
      }
    }
  }
}
</style>
