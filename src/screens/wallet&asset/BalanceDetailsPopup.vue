<template>
  <Popup headerText="asset.balanceDetails" :showBorder="true" :handlerClose="closePopup" sizeWidth="big">
    <div class="content">
      <div class="balance-row">
        <div class="label">Frozen</div>

        <div class="count">
          <div class="value">{{ formattedNumber(balance.frozen.value) }}</div>
          <div v-if="getFiatValueVisible(balance.frozen.fiat)" class="fiat-value">
            {{ formattedPrice(balance.frozen.fiat) }}
          </div>
        </div>
      </div>

      <div class="balance-row">
        <div class="label">Locked</div>

        <div class="count">
          <div class="value">{{ formattedNumber(balance.locked.value) }}</div>
          <div v-if="getFiatValueVisible(balance.locked.fiat)" class="fiat-value">
            {{ formattedPrice(balance.locked.fiat) }}
          </div>
        </div>
      </div>

      <div class="balance-row">
        <div class="label">Reserved</div>

        <div class="count">
          <div class="value">{{ formattedNumber(balance.reserved.value) }}</div>
          <div v-if="getFiatValueVisible(balance.reserved.fiat)" class="fiat-value">
            {{ formattedPrice(balance.reserved.fiat) }}
          </div>
        </div>
      </div>

      <div class="balance-row">
        <div class="label">Transferable</div>

        <div class="count">
          <div class="value">{{ formattedNumber(balance.transferable.value) }}</div>
          <div v-if="getFiatValueVisible(balance.transferable.fiat)" class="fiat-value">
            {{ formattedPrice(balance.transferable.fiat) }}
          </div>
        </div>
      </div>

      <div class="balance-row">
        <div class="label">Total</div>

        <div class="count">
          <div class="value">{{ formattedNumber(balance.total.value) }}</div>
          <div v-if="getFiatValueVisible(balance.total.fiat)" class="fiat-value">
            {{ formattedPrice(balance.total.fiat) }}
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
import { SelectedWallet } from '@/store/accounts/types';
import { formattedNumber, formattedPrice } from '@/helpers/numbers';

@Component({
  components: {},
})
export default class BalanceDetailsPopup extends Vue {
  readonly formattedNumberProps = {
    decimalsValue: 4,
    returnOriginNumber: false,
    removeTrailingZeros: true,
  };
  @Prop(String) network!: string;
  @Prop(Object) currency!: CurrencyController;
  @Prop(Function) closePopup!: VoidFunction;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get showFiatValue() {
    return this.currency.price !== 0;
  }

  get balance() {
    return this.currency.getBalanceInNetwork(this.selectedWallet, this.network);
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
