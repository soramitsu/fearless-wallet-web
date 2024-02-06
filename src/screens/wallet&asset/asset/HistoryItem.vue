<template>
  <div class="history-item">
    <ExternalLogo :name="token.icon" />

    <div class="column">
      <div class="first-row">
        <div data-testid="hash">{{ hash }}</div>

        <div data-testid="valueHistory">{{ value }} {{ assetToUpperCase }}</div>
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
import { Getter } from 'vuex-class';
import type { HistoryElement, NetworkName } from '@/interfaces';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { GetNetwork, SelectedWallet } from '@/store';
import { getType, getTypeFormatted, getHistoryValue, getSignTransfer } from '@/helpers/history';
import { getFormattedDate, cut, isSora } from '@/helpers';
import { type SoraHistoryElement, TransactionType } from '@/interfaces/history';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

@Component
export default class HistoryItem extends Vue {
  @Prop(Object) historyElement!: HistoryElement;
  @Prop(Object) token!: TokenGroup;
  @Prop(String) network!: NetworkName;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;

  get signTransfer() {
    return getSignTransfer(this.historyElement, this.address, this.network);
  }

  get address() {
    if (BaseApi.isEthereumNetwork(this.network.toLowerCase())) return this.selectedWallet.ethereumAddress;

    const network = this.getNetwork(this.network);

    return BaseApi.encodeAddress(this.selectedWallet.address, network.addressPrefix);
  }

  get asset() {
    return this.token.symbol;
  }

  get isSora() {
    return isSora(this.network);
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
    return this.getNetwork(this.network);
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
      const element = this.historyElement as SoraHistoryElement;

      return this.$t(`history.${element.method}`);
    }

    const { transfer, reward, extrinsic } = this.historyElement;

    if (this.type === TransactionType.transfer) {
      const value = this.typeFormatted === 'incomingTransfer' ? transfer!.from : transfer!.to;

      return cut(value);
    }

    if (this.type === TransactionType.reward) return cut(reward!.validator);

    // extrinsic
    return cut(extrinsic!.hash);
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
