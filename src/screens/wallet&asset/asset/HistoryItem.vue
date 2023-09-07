<template>
  <div class="history-item">
    <ExternalLogo :name="token.icon" />

    <div class="column">
      <div class="first-row">
        <div>{{ hash }}</div>

        <div>{{ value }} {{ assetToUpperCase }}</div>
      </div>

      <div class="second-row">
        <div>{{ typeFormatted }}</div>

        <div>{{ date }}</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { HistoryElement, NetworkName } from '@/interfaces';
import type { TokenBalance } from '@extension-base/background/types/types';
import { getType, getTypeFormatted, getHistoryValue, getSignTransfer } from '@/helpers/history';
import { getFormattedDate, cut } from '@/helpers';
import { TransactionType } from '@/interfaces/history';

@Component
export default class HistoryItem extends Vue {
  @Prop(Object) historyElement!: HistoryElement;
  @Prop(Object) token!: TokenBalance;
  @Prop(String) network!: NetworkName;

  get signTransfer() {
    return getSignTransfer(this.historyElement);
  }

  get asset() {
    return this.token.symbol;
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

  get value() {
    const values = getHistoryValue(this.historyElement, this.token.assetId, this.network);

    if (!values) return 0;

    return `${values.signTransfer}${this.$n(values.value, 'decimalPrecise')}`;
  }

  get hash() {
    const { transfer, reward, extrinsic } = this.historyElement;

    if (this.type === TransactionType.transfer) {
      const value = this.typeFormatted === 'Incoming' ? transfer!.from : transfer!.to;

      return cut(value);
    }

    if (this.type === TransactionType.reward) {
      return cut(reward!.validator);
    }

    // extrinsic
    return cut(extrinsic!.hash);
  }

  get typeFormatted() {
    return getTypeFormatted(this.historyElement);
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
