<template>
  <AboveForm header="Details" :blur="true" @closeHandler="$emit('handlerClose')">
    <div class="details">
      <div class="descriptions">
        <div v-if="isExtrinsic" class="item">
          Extrinsic Hash

          <div class="item-value item-icon">
            {{ displayHash }}

            <Icon icon="copy" className="copy" @click="copy(hash)" />
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

        <div v-if="isTransfer" class="item">
          Amount

          <div class="item-value">{{ value }}</div>
        </div>

        <template v-if="isExtrinsic">
          <div class="item">
            Module

            <div class="item-value">{{ moduleType }}</div>
          </div>

          <div class="item">
            Call

            <div class="item-value">{{ call }}</div>
          </div>
        </template>

        <div v-if="showTransferFee" class="item">
          Transfer fee

          <div class="item-value">{{ transferFee }}</div>
        </div>
      </div>

      <FButton size="big" :text="buttonText" @click="openExplorer" />
    </div>

    <Tooltip text="common.copied" target=".copy" placement="bottom" trigger="click" />
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { NetworkJson } from '@extension-base/types';
import type { HistoryElement } from '@/interfaces/history';
import type { SelectedWallet, GetNetwork } from '@/store';
import { getType, getSignTransfer, getHistoryValue, getHumanTransferFee } from '@/helpers/history';
import { getFormattedDate, cut } from '@/helpers';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

@Component({})
export default class HistoryDetailsForm extends Vue {
  @Prop(String) assetId!: string;

  @Prop(String) historyType!: string;
  @Prop(Object) historyElement!: HistoryElement;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.allNetworks) allNetworks!: NetworkJson[];
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;

  get isTransfer() {
    return this.type === 'transfer';
  }

  get address() {
    if (BaseApi.isEthereumNetwork(this.selectedNetwork)) return this.selectedWallet.ethereumAddress;
    const network = this.getNetwork(this.selectedNetwork);

    return BaseApi.encodeAddress(this.selectedWallet.address, network.addressPrefix);
  }

  get getNetworkByAsset() {
    return this.allNetworks.find((network) => network.assets.some((asset) => asset.id === this.assetId));
  }

  get explorerType() {
    return this.getNetworkByAsset?.externalApi?.history?.type;
  }

  get explorerUrl() {
    if (this.getNetworkByAsset?.externalApi?.explorers) return this.getNetworkByAsset?.externalApi?.explorers[0].url;

    return '';
  }

  get buttonText() {
    return this.$t(this.explorerType === 'etherscan' ? 'accounts.etherscan' : 'accounts.subscan');
  }

  get isExtrinsic() {
    return this.type === 'extrinsic';
  }

  get isReward() {
    return this.type === 'reward';
  }

  get showTransferFee() {
    return this.isTransfer && this.signTransfer === '-';
  }

  get statusIsSuccess() {
    if (this.isTransfer) {
      const { success } = this.historyElement.transfer!;

      return success;
    }

    if (this.isExtrinsic) {
      const { success } = this.historyElement.extrinsic!;

      return success;
    }

    return true;
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
    if (this.isTransfer) {
      const { success } = this.historyElement.transfer!;

      return success ? 'Completed' : 'Reject';
    }

    if (this.isExtrinsic) {
      const { success } = this.historyElement.extrinsic!;

      return success ? 'Completed' : 'Reject';
    }

    //reward
    return 'Completed';
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
    return this.historyElement.extrinsic!.module;
  }

  get call() {
    return this.historyElement.extrinsic!.call;
  }

  get transferFee() {
    const fees = getHumanTransferFee(this.historyElement, this.assetId, this.selectedNetwork);

    if (!fees) return '';

    return this.$n(+fees, 'decimalPrecise');
  }

  get date() {
    return getFormattedDate(this.historyElement.timestamp);
  }

  get value() {
    const { value } = getHistoryValue(this.historyElement, this.assetId, this.selectedNetwork, this.address);

    return this.$n(value, 'decimalPrecise');
  }

  get type() {
    return getType(this.historyElement);
  }

  get signTransfer() {
    return getSignTransfer(this.historyElement, this.address);
  }

  get hash() {
    return this.historyElement.extrinsic!.hash;
  }

  get displayHash() {
    return cut(this.hash);
  }

  get selectedNetwork() {
    return this.$route.params.selectedNetwork;
  }

  copy(value?: string) {
    if (!value) return;

    navigator.clipboard.writeText(value);
  }

  openExplorer() {
    const addressByNetwork = BaseApi.formatAddress(this.selectedWallet, this.selectedNetwork);

    if (this.explorerType === 'etherscan') {
      if (this.explorerUrl) {
        const url = this.explorerUrl
          .replace('{type}', 'tx')
          .replace('{value}', this.historyElement?.transfer?.hash ?? '');

        window.open(url);
      }

      return;
    }

    const url = this.isExtrinsic
      ? `https://${this.selectedNetwork}.subscan.io/extrinsic/${this.hash}`
      : `https://${this.selectedNetwork}.subscan.io/account/${addressByNetwork}`;

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
