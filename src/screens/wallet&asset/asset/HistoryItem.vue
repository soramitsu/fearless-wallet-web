<template>
  <div class="history-item">
    <ExternalLogo :name="token.icon" class="asset-icon" />

    <div class="column">
      <div class="first-row">
        <div data-testid="hash">{{ addressHistory }}</div>

        <div :class="valueClasses" data-testid="valueHistory">{{ value }} {{ assetToUpperCase }}</div>
      </div>

      <div class="second-row">
        <div data-testid="tModule">{{ typeHistory }}</div>

        <div data-testid="date">{{ date }}</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { HistoryElement, NetworkName, TonEvent } from '@/interfaces';
import type { TokenGroup } from '@extension-base/background/types/types';
import { getType, getTypeFormatted, getHistoryValue, TransferType } from '@/helpers/history';
import { getFormattedDate, cut, isSora, isTonNetwork } from '@/helpers';
import { type SoraHistoryElement, TransactionType } from '@/interfaces/history';
import BaseApi from '@/util/BaseApi';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{
  historyElement: HistoryElement;
  token: TokenGroup;
  network: NetworkName;
}>();

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const { t, n } = useI18n();

const address = computed(() => {
  if (BaseApi.isEthereumNetwork(props.network.toLowerCase())) return accountsStore.selectedWallet.ethereumAddress;

  const networkJson = networksStore.getNetwork(props.network);

  return BaseApi.encodeAddress(accountsStore.selectedWallet.address, networkJson.addressPrefix);
});

const asset = computed(() => props.token.symbol);

const isSoraNetwork = computed(() => isSora(props.network));
const isTon = computed(() => isTonNetwork(props.network));

const success = computed(() => props.historyElement.success);

const valueClasses = computed(() => ({
  reject: !success.value,
}));

const date = computed(() => getFormattedDate(props.historyElement.timestamp));

const assetToUpperCase = computed(() => asset.value.toUpperCase());

const type = computed(() => getType(props.historyElement));

const value = computed(() => {
  const values = getHistoryValue(props.historyElement, props.token.groupId, props.network, address.value, true);

  if (!values) return 0;

  return `${values.signTransfer}${n(values.value, 'decimalPrecise')}`;
});

const typeFormatted = computed(() => getTypeFormatted(props.historyElement, address.value, props.network));

const addressHistory = computed(() => {
  if (isSoraNetwork.value) {
    const element = props.historyElement as unknown as SoraHistoryElement;

    return t(`history.${element.method}`);
  }

  if (isTon.value) {
    const element = props.historyElement as unknown as TonEvent;
    const valueTon = typeFormatted.value === TransferType.Incoming ? element!.from : element!.to;

    return cut(valueTon);
  }

  const { transfer, reward } = props.historyElement;

  if (type.value === TransactionType.transfer) {
    const valueTransfer = typeFormatted.value === TransferType.Incoming ? transfer!.from : transfer!.to;

    return cut(valueTransfer);
  }

  return cut(reward!.validator);
});

const typeHistory = computed(() => {
  if (typeFormatted.value === TransferType.Incoming || typeFormatted.value === TransferType.Outgoing) {
    return t(`history.${typeFormatted.value}`);
  }

  return typeFormatted.value;
});
</script>

<style lang="scss" scoped>
.history-item {
  display: flex;
  margin: 0 16px;
  padding: $default-padding 0;
  border-bottom: $default-border;

  &:hover {
    cursor: pointer;
  }

  &:last-child {
    border: none;
  }

  .reject {
    color: $reject-color;
  }

  .asset-icon {
    border-radius: 50%;
  }

  .column {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    width: 100%;
    margin-left: 13px;

    .first-row {
      display: flex;
      justify-content: space-between;
      font-weight: 600;
    }

    .second-row {
      display: flex;
      justify-content: space-between;
      color: rgba(255, 255, 255, 0.64);
      font-size: 0.875em;
      margin-top: 2px;
    }
  }
}
</style>
