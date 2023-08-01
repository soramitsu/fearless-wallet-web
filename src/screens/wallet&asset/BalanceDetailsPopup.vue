<template>
  <Popup headerText="assets.lockedDetails" :showBorder="true" :handlerClose="closePopup" sizeWidth="big">
    <div class="content">
      <div v-for="{ name, value, fiat } in detailsBalance" :key="name" class="balance-row">
        <div class="label">{{ $t(`assets.${name}`) }}</div>

        <div class="count">
          <div class="value">{{ $n(value, 'decimalPrecise') }} {{ assetNameUpper }}</div>

          <div v-if="getFiatValueVisible(fiat)" class="fiat-value">
            {{ fiatSymbol }}
            {{ $n(fiat, 'price') }}
          </div>
        </div>
      </div>
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GetAssetPrice, SelectedWallet } from '@/store';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { AssetPrice } from '@/interfaces';

@Component
export default class LockedDetailsPopup extends Vue {
  @Prop(String) network!: string;
  @Prop(Object) currency!: TokenBalance;
  @Prop(Object) assetPrice!: AssetPrice;
  @Prop(Function) closePopup!: VoidFunction;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getAssetPrice) getTokenPrice!: GetAssetPrice;

  get selectedNetwork() {
    return this.$route.params.network;
  }

  get assetNameUpper() {
    return this.currency.symbol.toUpperCase();
  }

  get detailsBalance() {
    const { transferable, total, reserved, locked, frozen } = this.currency.balances.find(
      ({ name }) => name.toLowerCase() === this.selectedNetwork.toLowerCase()
    )!;

    return [
      { name: 'reserved', value: +reserved!, fiat: +reserved! * +this.assetPrice.price },
      { name: 'locked', value: +locked!, fiat: +locked! * +this.assetPrice.price },
      { name: 'frozen', value: +frozen!, fiat: +frozen! * +this.assetPrice.price },
      { name: 'transferable', value: +transferable!, fiat: +transferable! * +this.assetPrice.price },
      { name: 'total', value: +total!, fiat: +total! * +this.assetPrice.price },
    ];
  }

  get showFiatValue() {
    return this.fiatPrice !== 0;
  }

  get fiatPrice() {
    return this.getTokenPrice(this.currency.priceId ?? '').price ?? 0;
  }

  getFiatValueVisible(value: number) {
    return value.toString() !== '0';
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
