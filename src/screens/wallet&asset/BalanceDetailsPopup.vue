<template>
  <Popup headerText="assets.lockedDetails" :showBorder="true" @handlerClose="handleClose" sizeWidth="big">
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

<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { getBalanceNetworkName } from '@extension-base/api/evm/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { AssetPrice, NetworkName } from '@/interfaces';
import { ALL_NETWORKS } from '@/consts/networks';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { findBalanceByNetwork } from '@/helpers';

const props = defineProps<{
  network: string;
  currency: TokenGroup;
  assetPrice: AssetPrice;
}>();

const emit = defineEmits<{
  closePopup: [];
}>();

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const { n } = useI18n();

const assetNameUpper = computed(() => props.currency.symbol.toUpperCase());

const balancesList = computed(() => {
  if (!props.currency.balances) return [];

  if (props.network === ALL_NETWORKS) {
    return props.currency.balances;
  }

  const match = findBalanceByNetwork(props.currency.balances, props.network as NetworkName);

  return match ? [match] : [];
});

const detailsBalance = computed(() => {
  const initial = { reserved: 0, locked: 0, frozen: 0, transferable: 0, total: 0 };
  const { reserved, locked, frozen, transferable, total } = balancesList.value.reduce((prev, curr) => {
    const networkName = getBalanceNetworkName(curr);
    const network = networksStore.getNetwork(networkName);

    if (!network?.active) return prev;

    return {
      reserved: prev.reserved + Number(curr.reserved ?? 0),
      locked: prev.locked + Number(curr.locked ?? 0),
      frozen: prev.frozen + Number(curr.frozen ?? 0),
      transferable: prev.transferable + Number(curr.transferable ?? 0),
      total: prev.total + Number(curr.total ?? 0),
    };
  }, initial);

  const price = Number(props.assetPrice.price ?? 0);

  return [
    { name: 'reserved', value: reserved, fiat: reserved * price },
    { name: 'frozen', value: frozen, fiat: frozen * price },
    { name: 'transferable', value: transferable, fiat: transferable * price },
    { name: 'totalLocked', value: locked, fiat: locked * price },
    { name: 'total', value: total, fiat: total * price },
  ];
});

const prepFiatValue = (fiat: number) => `${accountsStore.fiatSymbol}${n(fiat, 'price')} `;
const getFiatValueVisible = (value: number) => value !== 0;
const handleClose = () => emit('closePopup');
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
