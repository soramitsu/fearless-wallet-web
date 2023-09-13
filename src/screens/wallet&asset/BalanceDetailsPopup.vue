<template>
  <Popup headerText="assets.lockedDetails" :showBorder="true" @handlerClose="$emit('closePopup')" sizeWidth="big">
    <div class="content">
      <div v-for="{ name, value, fiat } in detailsBalance" :key="name" class="balance-row">
        <div class="label">{{ $t(`assets.${name}`) }}</div>

        <div class="count">
          <div class="value">{{ $n(value, 'decimalPrecise') }} {{ assetNameUpper }}</div>

          <div v-if="getFiatValueVisible(fiat)" class="fiat-value">
            {{ prepFiatValue(fiat) }}
          </div>
        </div>
      </div>
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { TokenBalance } from '@extension-base/background/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GetAssetPrice, GetNetwork, SelectedWallet } from '@/store';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { AssetPrice } from '@/interfaces';
import { ALL_NETWORKS } from '@/consts/networks';

@Component
export default class LockedDetailsPopup extends Vue {
  @Prop(String) network!: string;
  @Prop(Object) currency!: TokenBalance;
  @Prop(Object) assetPrice!: AssetPrice;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getAssetPrice) getTokenPrice!: GetAssetPrice;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;

  get assetNameUpper() {
    return this.currency.symbol.toUpperCase();
  }

  get detailsBalance() {
    const balances =
      this.network === ALL_NETWORKS
        ? this.currency.balances
        : [this.currency.balances.find(({ name }) => name.toLowerCase() === this.network.toLowerCase())!];

    const { frozen, locked, reserved, total, transferable } = balances.reduce(
      (prev, curr) => {
        const network = this.getNetwork(curr.name);

        if (!network.active) return prev;

        const frozen = (prev.frozen += curr.frozen ? +curr.frozen : 0);
        const locked = (prev.locked += curr.locked ? +curr.locked : 0);
        const reserved = (prev.reserved += curr.reserved ? +curr.reserved : 0);
        const transferable = (prev.transferable += curr.transferable ? +curr.transferable : 0);
        const total = (prev.total += curr.total ? +curr.total : 0);

        return {
          reserved,
          locked,
          frozen,
          transferable,
          total,
        };
      },
      { reserved: 0, locked: 0, frozen: 0, transferable: 0, total: 0 }
    );

    return [
      { name: 'reserved', value: reserved, fiat: reserved * +this.assetPrice.price },
      { name: 'locked', value: locked, fiat: locked * +this.assetPrice.price },
      { name: 'frozen', value: frozen, fiat: frozen * +this.assetPrice.price },
      { name: 'transferable', value: transferable, fiat: transferable * +this.assetPrice.price },
      { name: 'total', value: total, fiat: total * +this.assetPrice.price },
    ];
  }

  get showFiatValue() {
    return this.fiatPrice !== 0;
  }

  get fiatPrice() {
    return this.getTokenPrice(this.currency.priceId ?? '').price ?? 0;
  }

  prepFiatValue(fiat: number) {
    return `${this.fiatSymbol}${this.$n(fiat, 'price')} `;
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
@/extension/background/extension-base/src/background/types
