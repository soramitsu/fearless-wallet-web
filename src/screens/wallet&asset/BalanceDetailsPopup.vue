<template>
  <Popup headerText="assets.lockedDetails" :showBorder="true" @handlerClose="$emit('closePopup')" sizeWidth="big">
    <div class="content">
      <div v-for="{ name, value, fiat } in detailsBalance" :key="name" class="balance-row" data-testid="balanceRow">
        <div class="label" data-testid="labelBalanceDetails">{{ $t(`assets.${name}`) }}</div>

        <div class="count">
          <div class="value" data-testid="valueBalanceDetails">
            {{ $n(value, 'decimalPrecise') }} {{ assetNameUpper }}
          </div>

          <div v-if="getFiatValueVisible(fiat)" class="fiat-value" data-testid="fiatValue">
            {{ prepFiatValue(fiat) }}
          </div>
        </div>
      </div>
    </div>
  </Popup>
</template>

<script lang="ts">
import { defineComponent } from 'vue';




import { ALL_NETWORKS } from '@/consts/networks';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'LockedDetailsPopup' ,
  props: {
    network: String,
    currency: Object,
    assetPrice: Object,
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
    };
  },
  computed: {
    assetNameUpper() {
      return this.currency.symbol.toUpperCase();
    },
    detailsBalance() {
      if (this.currency.balances === undefined)
            return [
              { name: 'reserved', value: 0, fiat: 0 },
              { name: 'frozen', value: 0, fiat: 0 },
              { name: 'transferable', value: 0, fiat: 0 },
              { name: 'totalLocked', value: 0, fiat: 0 },
              { name: 'total', value: 0, fiat: 0 },
            ];

          const balances =
            this.network === ALL_NETWORKS
              ? this.currency.balances
              : [this.currency.balances.find(({ name }) => name.toLowerCase() === this.network.toLowerCase())!];

          const { frozen, locked, reserved, total, transferable } = balances.reduce(
            (prev, curr) => {
              const network = this.networksStore.getNetwork(curr.name);

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
            { name: 'frozen', value: frozen, fiat: frozen * +this.assetPrice.price },
            { name: 'transferable', value: transferable, fiat: transferable * +this.assetPrice.price },
            { name: 'totalLocked', value: locked, fiat: locked * +this.assetPrice.price },
            { name: 'total', value: total, fiat: total * +this.assetPrice.price },
          ];
    },
    showFiatValue() {
      return this.fiatPrice !== 0;
    },
    fiatPrice() {
      return this.networksStore.getAssetPrice(this.currency.priceId ?? '').price ?? 0;
    },
  },
  methods: {
    prepFiatValue(fiat: number) {
      return `${this.accountsStore.fiatSymbol}${this.$n(fiat, 'price')} `;
    },
    getFiatValueVisible(value: number) {
      return value.toString() !== '0';
    },
  },
});
</script>

<style lang="scss" scoped>
.content {
  .balance-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: $default-border;
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
      max-width: 250px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;

      .value {
        font-weight: 600;
        line-height: 20px;
      }

      .fiat-value {
        font-size: 0.75rem;
        line-height: 20px;
        color: $grayish-white;
      }
    }
  }
}
</style>
