<template>
  <AboveForm header="Details" :fullScreen="true" @closeHandler="$emit('handlerClose')">
    <div class="details">
      <div class="descriptions">
        <div v-if="!isSora && !!extrinsicHash" class="item" data-testid="extrinsicHashLabel">
          Extrinsic Hash

          <div class="item-value item-icon" data-testid="extrinsicHash">
            {{ displayExtrinsicHash }}

            <Icon icon="copy" className="copy" data-testid="copyBtn" @click="copy(extrinsicHash)" />
          </div>
        </div>

        <div v-if="!!blockHash" class="item" data-testid="extrinsicHashLabel">
          Block Hash

          <div class="item-value item-icon" data-testid="extrinsicHash">
            {{ displayBlockHash }}

            <Icon icon="copy" className="copy" data-testid="copyBtn" @click="copy(blockHash)" />
          </div>
        </div>

        <template v-if="isTransfer">
          <div class="item">
            From

            <div class="item-value item-icon">
              <Identicon :address="fromAddress" />

              {{ displayFromAddress }}

              <Icon icon="copy" className="copy" @click="copy(fromAddress)" />
            </div>
          </div>
          <div class="item">
            To

            <div class="item-value item-icon">
              <Identicon :address="toAddress" />

              {{ displayToAddress }}

              <Icon icon="copy" className="copy" @click="copy(toAddress)" />
            </div>
          </div>
        </template>

        <div v-if="isReward" class="item">
          Validator

          <div class="item-value item-icon">
            <Identicon :address="validator" />

            {{ displayValidator }}

            <Icon icon="copy" className="copy" @click="copy(validator)" />
          </div>
        </div>

        <div class="item">
          Status

          <div :class="statusClasses">{{ statusText }}</div>
        </div>

        <div class="item">
          Date

          <div class="item-value">{{ date }}</div>
        </div>

        <div v-if="isReward" class="item">
          Era

          <div class="item-value">{{ era }}</div>
        </div>

        <div class="item">
          Module

          <div class="item-value">{{ moduleType }}</div>
        </div>

        <div class="item">
          Method

          <div class="item-value">{{ method }}</div>
        </div>

        <div v-if="showAmount" class="item">
          Amount

          <div class="item-value">{{ value }}</div>
        </div>

        <div v-if="showTargetAmount" class="item">
          Target Amount

          <div class="item-value">{{ targetValue }}</div>
        </div>

        <div v-if="showFee" class="item">
          Transfer fee

          <div class="item-value">{{ transferFee }}</div>
        </div>
      </div>

      <FButton v-if="haveExplorers" size="big" :text="buttonText" @click="openExplorer" />
    </div>

    <Tooltip text="common.copied" target=".copy" placement="bottom" trigger="click" />
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

import { Getter } from 'vuex-class';
import type { NetworkJson } from '@extension-base/types';
import type { HistoryElement } from '@/interfaces/history';
import type { GetNetwork, SelectedWallet } from '@/store';
import { getType, getSignTransfer, getHistoryValue, getHumanTransferFee } from '@/helpers/history';
import { cut, getFormattedDate } from '@/helpers';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { type SoraHistoryElement } from '@/interfaces';

@Component({})
export default class HistoryDetailsForm extends Vue {
  @Prop(String) assetId!: string;

  @Prop(String) historyType!: string;
  @Prop(Object) historyElement!: HistoryElement;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJson[];
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;

  get showTargetAmount() {
    return this.isSora && (this.historyElement as unknown as SoraHistoryElement).method === 'swap';
  }

  get isTransfer() {
    return this.type === 'transfer';
  }

  get networkProps() {
    return this.getNetwork(this.selectedNetwork);
  }

  get address() {
    if (BaseApi.isEthereumNetwork(this.selectedNetwork)) return this.selectedWallet.ethereumAddress;

    return BaseApi.encodeAddress(this.selectedWallet.address, this.networkProps.addressPrefix);
  }

  get selectedNetworkJson() {
    return this.networks.find((network) => network.name.toLowerCase() === this.selectedNetwork.toLowerCase());
  }

  get explorerType() {
    return this.selectedNetworkJson?.externalApi?.history?.type;
  }

  get haveExplorers() {
    return this.explorerUrl !== '';
  }

  get explorerUrl() {
    return this.networkProps?.externalApi?.explorers?.[0].url ?? '';
  }

  get buttonText() {
    return this.$t(this.explorerType === 'etherscan' ? 'accounts.etherscan' : 'accounts.subscan');
  }

  get isReward() {
    return this.type === 'reward';
  }

  get showFee() {
    if (this.isSora) return (this.historyElement as unknown as SoraHistoryElement).method !== 'rewarded';

    return this.isTransfer && this.signTransfer === '-';
  }

  get isSora() {
    return this.type === 'sora';
  }

  get showAmount() {
    if (this.isSora) return true;

    return this.isTransfer;
  }

  get statusIsSuccess() {
    if (this.isSora) return (this.historyElement as unknown as SoraHistoryElement).execution.success;

    const { success } = this.historyElement!;

    return success ?? true;
  }

  get validator() {
    return this.historyElement.reward?.validator;
  }

  get displayValidator() {
    if (!this.validator) return 'no validator info';

    return cut(this.validator, 10);
  }

  get era() {
    return this.historyElement.reward?.era;
  }

  get statusClasses() {
    return ['item-value', this.statusIsSuccess ? 'status-success' : 'status-reject'];
  }

  get statusText() {
    return this.statusIsSuccess ? 'Completed' : 'Reject';
  }

  get fromAddress() {
    return this.historyElement.transfer!.from;
  }

  get displayFromAddress() {
    return cut(this.fromAddress, 10);
  }

  get toAddress() {
    return this.historyElement.transfer!.to;
  }

  get displayToAddress() {
    return cut(this.toAddress, 10);
  }

  get moduleType() {
    if (this.isSora) return (this.historyElement as unknown as SoraHistoryElement).module;

    return this.historyElement!.module;
  }

  get method() {
    if (this.isSora) return (this.historyElement as unknown as SoraHistoryElement).method;

    return this.historyElement?.method;
  }

  get transferFee() {
    const fees = getHumanTransferFee(this.historyElement, this.selectedNetwork);

    return this.$n(fees, 'decimalPrecise');
  }

  get date() {
    return getFormattedDate(this.historyElement.timestamp);
  }

  get value() {
    const { value } = getHistoryValue(this.historyElement, this.assetId, this.selectedNetwork, this.address);

    return this.$n(value, 'decimalPrecise');
  }

  get targetValue() {
    const { targetValue } = getHistoryValue(this.historyElement, this.assetId, this.selectedNetwork, this.address);

    return this.$n(targetValue!, 'decimalPrecise');
  }

  get type() {
    return getType(this.historyElement, this.selectedNetwork);
  }

  get signTransfer() {
    return getSignTransfer(this.historyElement, this.address, this.selectedNetwork);
  }

  get extrinsicHash() {
    return this.historyElement.extrinsicHash;
  }

  get displayExtrinsicHash() {
    return cut(this.extrinsicHash);
  }

  get blockHash() {
    return this.historyElement.blockHash;
  }

  get displayBlockHash() {
    return cut(this.blockHash);
  }

  get selectedNetwork() {
    // TODO Переделать на одинаковое название параметра
    return this.$route.params.network ?? this.$route.params.selectedNetwork;
  }

  copy(value?: string) {
    if (!value) return;

    navigator.clipboard.writeText(value);
  }

  openExplorer() {
    if (this.explorerType === 'etherscan' || this.explorerType === 'oklink') {
      if (this.explorerUrl) {
        const url = this.explorerUrl.replace('{type}', 'tx').replace('{value}', this.historyElement?.blockHash ?? '');

        window.open(url);
      }

      return;
    }

    const url = this.explorerUrl
      .replace('{type}', 'extrinsic')
      .replace('{value}', this.historyElement?.blockHash ?? '');

    window.open(url);
  }
}
</script>

<style lang="scss" scoped>
.details {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .descriptions {
    padding: 0 $default-padding;

    .item {
      color: $default-white;
      border-bottom: $default-border;
      padding: $default-padding 0;
      display: flex;
      justify-content: space-between;
      height: 55px;

      .item-value {
        font-weight: 600;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }

      .item-icon {
        flex-direction: row;

        .copy {
          margin-left: 10px;
          filter: invert(0.35);
          width: 20px;
          height: 20px;

          &:hover {
            cursor: pointer;
            filter: invert(0.25);
          }
        }
      }

      .status-success {
        color: $success-color;
      }

      .status-reject {
        color: $reject-color;
      }

      .identicon {
        margin-right: 10px;
      }
    }
  }
}
</style>
