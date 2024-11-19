<template>
  <div class="history-item">
    <ExternalLogo :name="token.icon" />

    <div class="column">
      <div class="first-row">
        <div data-testid="hash">{{ hash }}</div>

        <div :class="valueClasses" data-testid="valueHistory">{{ value }} {{ assetToUpperCase }}</div>
      </div>

      <div class="second-row">
        <div data-testid="tModule">{{ tModule }}</div>

        <div data-testid="date">{{ date }}</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

import type { HistoryElement, NetworkName } from '@/interfaces';
import type { TokenGroup } from '@extension-base/background/types/types';

import { getType, getTypeFormatted, getHistoryValue, getSignTransfer } from '@/helpers/history';
import { getFormattedDate, cut, isSora } from '@/helpers';
import { type SoraHistoryElement, TransactionType } from '@/interfaces/history';

import BaseApi from '@/util/BaseApi';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

@Component
export default class HistoryItem extends Vue {
  networksStore = useNetworksStore();
  accountsStore = useAccountsStore();

  @Prop(Object) historyElement!: HistoryElement;
  @Prop(Object) token!: TokenGroup;
  @Prop(String) network!: NetworkName;

  get signTransfer() {
    return getSignTransfer(this.historyElement, this.address, this.network);
  }

  get address() {
    if (BaseApi.isEthereumNetwork(this.network.toLowerCase())) return this.accountsStore.selectedWallet.ethereumAddress;

    const network = this.networksStore.getNetwork(this.network);

    return BaseApi.encodeAddress(this.accountsStore.selectedWallet.address, network.addressPrefix);
  }

  get asset() {
    return this.token.symbol;
  }

  get isSora() {
    return isSora(this.network);
  }

  get success() {
    return this.historyElement.success;
  }

  get valueClasses() {
    return {
      reject: !this.success,
    };
  }

  get date() {
    return getFormattedDate(this.historyElement.timestamp);
  }

  get assetToUpperCase() {
    return this.asset.toUpperCase();
  }

  get type() {
    return getType(this.historyElement);
  }

  get networkJson() {
    return this.networksStore.getNetwork(this.network);
  }

  get networkHistoryType() {
    return this.networkJson.externalApi?.history?.type;
  }

  get value() {
    const values = getHistoryValue(this.historyElement, this.token.groupId, this.network, this.address, true);

    if (!values) return 0;

    return `${values.signTransfer}${this.$n(values.value, 'decimalPrecise')}`;
  }

  get hash() {
    if (this.isSora) {
      const element = this.historyElement as unknown as SoraHistoryElement;

      return this.$t(`history.${element.method}`);
    }

    const { transfer, reward } = this.historyElement;

    if (this.type === TransactionType.transfer) {
      const value = this.typeFormatted === 'incomingTransfer' ? transfer!.from : transfer!.to;

      return cut(value);
    }

    // reward
    return cut(reward!.validator);
  }

  get typeFormatted() {
    return getTypeFormatted(this.historyElement, this.address, this.network);
  }

  get tModule() {
    if (this.typeFormatted === 'incomingTransfer' || this.typeFormatted === 'outgoingTransfer')
      return this.$t(this.typeFormatted);

    return this.typeFormatted;
  }
}
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
      font-size: 14px;
      margin-top: 2px;
    }
  }
}
</style>
