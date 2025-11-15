<template>
  <div class="history-item" data-testid="historyItem" @click="openDetails">
    <div class="column left">
      <span class="name" data-testid="operationName">
        {{ operationName }}
      </span>

      <span class="date" data-testid="operationDate">
        {{ date }}
      </span>
    </div>

    <div class="column right">
      <div>
        <div class="amount" data-testid="operationAmount">{{ amount }} {{ symbol }}</div>

        <div class="value" data-testid="operationValue">{{ value }}</div>
      </div>

      <Icon icon="chevron-right" className="chevron" data-testid="operationDetails" @click="openDetails" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { HistoryElement } from '@/interfaces/history';
import type { NetworkName } from '@/interfaces';
import { getFormattedDate } from '@/helpers';
import { getHistoryValue, getTypeFormatted } from '@/helpers/history';
import BaseApi from '@/util/BaseApi';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{
  history: HistoryElement;
  stakingAssetId: string;
  rewardedAssetId: string;
  network: NetworkName;
}>();

const emit = defineEmits<{
  openHistoryDetailsForm: [history: HistoryElement];
}>();

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const { t, n } = useI18n();

const method = computed(() => props.history.method ?? props.history.type ?? '');

const currency = computed(() => accountsStore.balances.find(({ groupId }) => groupId === props.stakingAssetId));

const rewardedCurrency = computed(() =>
  accountsStore.balances.find(({ groupId }) => groupId === props.rewardedAssetId)
);

const stakingAssetPrice = computed(() => {
  const priceId = currency.value?.priceId ?? '';

  return networksStore.getAssetPrice(priceId).price;
});

const rewardedAssetPrice = computed(() => {
  const priceId = rewardedCurrency.value?.priceId ?? '';

  return networksStore.getAssetPrice(priceId).price;
});

const address = computed(() => {
  if (BaseApi.isEthereumNetwork(props.network.toLowerCase())) {
    return accountsStore.selectedWallet.ethereumAddress;
  }

  const network = networksStore.getNetwork(props.network);

  return BaseApi.encodeAddress(accountsStore.selectedWallet.address, network.addressPrefix);
});

const historyValue = computed(() =>
  getHistoryValue(props.history, props.stakingAssetId, props.network, address.value, true)
);

type AmountFormatKey = 'decimalPrecise' | 'decimalTiny';

const amountFormatKey = computed<AmountFormatKey>(() => {
  const absoluteValue = Math.abs(historyValue.value.value);

  if (absoluteValue > 0 && absoluteValue < 0.001) return 'decimalTiny';

  return 'decimalPrecise';
});

const amount = computed(
  () => `${historyValue.value.signTransfer}${n(historyValue.value.value, amountFormatKey.value)}`
);

const value = computed(() => {
  const price = isReward.value ? rewardedAssetPrice.value || stakingAssetPrice.value : stakingAssetPrice.value;
  const total = historyValue.value.value * price;

  return `${accountsStore.fiatSymbol}${n(total, 'price')}`;
});

const typeLabel = computed(() => getTypeFormatted(props.history, address.value, props.network));
const operationKey = computed(() => method.value || typeLabel.value || 'transfer');
const operationName = computed(() => {
  const key = `history.${operationKey.value}`;
  const translated = t(key);

  return translated === key ? typeLabel.value || operationKey.value : translated;
});
const date = computed(() => getFormattedDate(props.history.timestamp));

const isReward = computed(
  () => method.value === 'rewarded' || props.history.method === 'rewarded' || props.history.reward !== undefined
);

const symbol = computed(() => {
  if (isReward.value) return rewardedCurrency.value?.symbol ?? currency.value?.symbol ?? '';

  return currency.value?.symbol ?? '';
});

function openDetails() {
  emit('openHistoryDetailsForm', props.history);
}
</script>

<style lang="scss" scoped>
.history-item {
  display: flex;
  justify-content: space-between;
  border-bottom: $secondary-border;
  padding: 15px 0;
  cursor: pointer;

  &:last-child {
    border-bottom: none;
  }

  .column {
    display: flex;

    .name {
      font-size: 1em;
      color: $default-white;
    }

    .date {
      font-size: 0.75rem;
      color: $grayish-white-2;
      text-align: left;
      margin-top: 5px;
    }
  }

  .left {
    text-align: left;
    flex-direction: column;
  }

  .right {
    text-align: right;
    align-items: center;
    height: 38px;
    max-width: 325px;

    .chevron {
      width: 20px;
      height: 20px;
      margin-left: 10px;
      color: $gray-color;
    }

    .amount {
      color: $default-white;
      text-transform: uppercase;
    }

    .value {
      font-size: 0.75rem;
      color: $grayish-white-2;
      text-align: right;
      margin-top: 5px;
    }
  }
}
</style>
