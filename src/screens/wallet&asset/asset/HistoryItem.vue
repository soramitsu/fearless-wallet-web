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

<script lang="ts">
import { defineComponent } from 'vue';

import type { TonEvent } from '@/interfaces';
import { getType, getTypeFormatted, getHistoryValue, getSignTransfer, TransferType } from '@/helpers/history';
import { getFormattedDate, cut, isSora, isTonNetwork } from '@/helpers';
import { type SoraHistoryElement, TransactionType } from '@/interfaces/history';
import BaseApi from '@/util/BaseApi';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'HistoryItem' ,
  props: {
    historyElement: Object,
    token: Object,
    network: String,
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
    };
  },
  computed: {
    signTransfer() {
      return getSignTransfer(this.historyElement, this.address, this.network);
    },
    address() {
      if (BaseApi.isEthereumNetwork(this.network.toLowerCase())) return this.accountsStore.selectedWallet.ethereumAddress;

          const network = this.networksStore.getNetwork(this.network);

          return BaseApi.encodeAddress(this.accountsStore.selectedWallet.address, network.addressPrefix);
    },
    asset() {
      return this.token.symbol;
    },
    isSora() {
      return isSora(this.network);
    },
    isTon() {
      return isTonNetwork(this.network);
    },
    success() {
      return this.historyElement.success;
    },
    valueClasses() {
      return {
            reject: !this.success,
          };
    },
    date() {
      return getFormattedDate(this.historyElement.timestamp);
    },
    assetToUpperCase() {
      return this.asset.toUpperCase();
    },
    type() {
      return getType(this.historyElement);
    },
    networkJson() {
      return this.networksStore.getNetwork(this.network);
    },
    networkHistoryType() {
      return this.networkJson.externalApi?.history?.type;
    },
    value() {
      const values = getHistoryValue(this.historyElement, this.token.groupId, this.network, this.address, true);

          if (!values) return 0;

          return `${values.signTransfer}${this.$n(values.value, 'decimalPrecise')}`;
    },
    addressHistory() {
      if (this.isSora) {
            const element = this.historyElement as unknown as SoraHistoryElement;

            return this.$t(`history.${element.method}`);
          }

          if (this.isTon) {
            const element = this.historyElement as unknown as TonEvent;
            const value = this.typeFormatted === TransferType.Incoming ? element!.from : element!.to;

            return cut(value);
          }

          const { transfer, reward } = this.historyElement;

          if (this.type === TransactionType.transfer) {
            const value = this.typeFormatted === TransferType.Incoming ? transfer!.from : transfer!.to;

            return cut(value);
          }

          // reward
          return cut(reward!.validator);
    },
    typeFormatted() {
      return getTypeFormatted(this.historyElement, this.address, this.network);
    },
    typeHistory() {
      if (this.typeFormatted === TransferType.Incoming || this.typeFormatted === TransferType.Outgoing)
            return this.$t(`history.${this.typeFormatted}`);

          return this.typeFormatted;
    },
  },
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
