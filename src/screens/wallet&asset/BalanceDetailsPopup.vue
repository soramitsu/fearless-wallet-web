<template>
  <Popup headerText="asset.balanceDetails" :showBorder="true" :handlerClose="closePopup" sizeWidth="big">
    <div class="content">
      <div v-for="{ name, value, fiat } in balances" :key="name" class="balance-row">
        <div class="label">{{ name }}</div>

        <div class="count">
          <div class="value">{{ formattedNumber(value) }} {{ assetNameUpper }}</div>

          <div v-if="getFiatValueVisible(fiat)" class="fiat-value">
            {{ fiatSymbol }}
            {{ formattedPrice(fiat) }}
          </div>
        </div>
      </div>
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type CurrencyController from '@/controllers/currencyController';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store';
import { formattedNumber, formattedPrice } from '@/helpers/numbers';

@Component
export default class BalanceDetailsPopup extends Vue {
  @Prop(String) network!: string;
  @Prop(Object) currency!: CurrencyController;
  @Prop(Function) closePopup!: VoidFunction;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;

  get assetNameUpper() {
    return this.currency.displayName.toUpperCase();
  }

  get balances() {
    const balances = this.currency.getBalanceInNetwork(this.selectedWallet, this.network);

    return Object.entries(balances).map(([name, { value, fiat }]) => ({
      name,
      value,
      fiat,
    }));
  }

  get showFiatValue() {
    return this.currency.price !== 0;
  }

  getFiatValueVisible(value: string) {
    return value !== '0';
  }

  formattedPrice(value: number) {
    return formattedPrice(value);
  }

  formattedNumber(value: number) {
    return formattedNumber(value, {
      decimalsValue: 4,
      returnOriginNumber: false,
      removeTrailingZeros: true,
    });
  }
}
</script>

<style lang="scss" scoped>
.content {
  .balance-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid $default-background-color;
    margin: 0 16px;
    color: $default-white;
    min-height: 57px;

    &:last-child {
      border-bottom: none;
    }

    .label {
      text-transform: capitalize;
      margin: auto 0;
    }

    .count {
      display: flex;
      flex-direction: column;
      justify-content: center;
      text-align: right;
      max-width: 215px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;

      .value {
        font-weight: 600;
        line-height: 20px;
      }

      .fiat-value {
        font-size: 12px;
        line-height: 20px;
        color: $grayish-white;
      }
    }
  }
}
</style>
