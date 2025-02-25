<template>
  <AboveForm header="Details" :fullScreen="true" @closeHandler="$emit('handlerClose')">
    <div class="details">
      <Scroll>
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
                <Identicon v-if="!isTon" :address="fromAddress" />

                {{ displayFromAddress }}

                <Icon icon="copy" className="copy" @click="copy(fromAddress)" />
              </div>
            </div>

            <div class="item">
              To

              <div class="item-value item-icon">
                <Identicon v-if="!isTon" :address="toAddress" />

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

          <div class="item" data-testid="statusLabel">
            Status

            <div :class="statusClasses" data-testid="statusValue">{{ statusText }}</div>
          </div>

          <div class="item" data-testid="dateLabel">
            Date

            <div class="item-value" data-testid="dateValue">{{ date }}</div>
          </div>

          <div v-if="isReward" class="item" data-testid="eraLabel">
            Era

            <div class="item-value" data-testid="eraValue">{{ era }}</div>
          </div>

          <div v-if="!!moduleType" class="item" data-testid="moduleLabel">
            Module

            <div class="item-value" data-testid="moduleValue">{{ moduleType }}</div>
          </div>

          <div v-if="!!method" class="item" data-testid="methodLabel">
            Method

            <div class="item-value" data-testid="methodValue">{{ method }}</div>
          </div>

          <div v-if="showAmount" class="item" data-testid="amountLabel">
            Amount

            <div class="item-value" data-testid="amountValue">{{ value }}</div>
          </div>

          <div v-if="showTargetAmount" class="item" data-testid="amountLabel">
            Target Amount

            <div class="item-value" data-testid="amountValue">{{ targetValue }}</div>
          </div>

          <div v-if="showFee" class="item" data-testid="feeLabel">
            Transfer fee

            <div class="item-value" data-testid="feeValue">{{ transferFee }}</div>
          </div>
        </div>
      </Scroll>

      <FButton v-if="haveExplorers" size="big" :text="buttonText" @click="openExplorer" />
    </div>

    <Tooltip text="common.copied" target=".copy" placement="bottom" trigger="click" />
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { type HistoryElement, type TonEvent, type SoraHistoryElement, TransactionType } from '@/interfaces';
import { getType, getSignTransfer, getHistoryValue, getHumanTransferFee } from '@/helpers/history';
import { cut, getFormattedDate, setClipboard } from '@/helpers';
import BaseApi from '@/util/BaseApi';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

@Component({})
export default class HistoryDetailsForm extends Vue {
  networksStore = useNetworksStore();
  accountsStore = useAccountsStore();

  @Prop(String) assetId!: string;
  @Prop(String) historyType!: string;
  @Prop(Object) historyElement!: HistoryElement;

  get historyElementSoraType() {
    return this.historyElement as unknown as SoraHistoryElement;
  }

  get historyElementTonType() {
    return this.historyElement as unknown as TonEvent;
  }

  get showTargetAmount() {
    return this.isSora && this.historyElementSoraType.method === 'swap';
  }

  get networkProps() {
    return this.networksStore.getNetwork(this.selectedNetwork);
  }

  get address() {
    if (BaseApi.isEthereumNetwork(this.selectedNetwork)) return this.accountsStore.selectedWallet.ethereumAddress;

    return BaseApi.encodeAddress(this.accountsStore.selectedWallet.address, this.networkProps.addressPrefix);
  }

  get selectedNetworkJson() {
    return this.networksStore.networks.find(
      (network) => network.name.toLowerCase() === this.selectedNetwork.toLowerCase()
    );
  }

  get explorerType() {
    return this.selectedNetworkJson?.externalApi?.explorers?.[0]?.type;
  }

  get haveExplorers() {
    return this.explorerUrl !== '';
  }

  get explorerUrl() {
    return this.networkProps?.externalApi?.explorers?.[0].url ?? '';
  }

  get buttonText() {
    const explorerType =
      this.explorerType === 'etherscan'
        ? 'accounts.etherscan'
        : this.explorerType === 'tonviewer'
        ? 'accounts.tonviewer'
        : 'accounts.subscan';

    return this.$t(explorerType);
  }

  get showFee() {
    if (this.isSora) return this.historyElementSoraType.method !== 'rewarded';

    if (this.isTon) return this.signTransfer === '-';

    return this.isTransfer && this.signTransfer === '-';
  }

  get isTransfer() {
    return this.type === 'transfer' || this.isTon;
  }

  get isReward() {
    return this.type === 'reward';
  }

  get isSora() {
    return this.type === 'sora';
  }

  get isTon() {
    return this.type === TransactionType.ton;
  }

  get showAmount() {
    if (this.isSora || this.isTon) return true;

    return this.isTransfer;
  }

  get statusIsSuccess() {
    if (this.isSora) return this.historyElementSoraType.execution.success;

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
    if (this.isTon) return this.historyElementTonType?.from;

    return this.historyElement.transfer?.from;
  }

  get displayFromAddress() {
    return cut(this.fromAddress, 10);
  }

  get toAddress() {
    if (this.isTon) return this.historyElementTonType?.to;

    return this.historyElement.transfer?.to;
  }

  get displayToAddress() {
    return cut(this.toAddress, 10);
  }

  get moduleType() {
    if (this.isSora) return this.historyElementSoraType.module;

    return this.historyElement!.module;
  }

  get method() {
    if (this.isSora) return this.historyElementSoraType.method;

    if (this.isTon) return this.historyElementTonType.method;

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
    const { value, signTransfer } = getHistoryValue(
      this.historyElement,
      this.assetId,
      this.selectedNetwork,
      this.address
    );

    return `${signTransfer}${this.$n(value, 'decimalPrecise')}`;
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

    setClipboard(value);
  }

  openExplorer() {
    if (this.explorerType === 'etherscan' || this.explorerType === 'oklink') {
      if (this.explorerUrl) {
        const url = this.explorerUrl.replace('{type}', 'tx').replace('{value}', this.historyElement?.blockHash ?? '');

        window.open(url);
      }

      return;
    }

    if (this.explorerType === 'tonviewer') {
      if (this.explorerUrl) {
        const url = this.explorerUrl
          .replace('{type}', 'transaction')
          .replace('{value}', this.historyElementTonType?.eventId ?? '');

        window.open(url);
      }

      return;
    }

    const url = this.explorerUrl
      .replace('{type}', 'extrinsic')
      .replace('{value}', this.historyElement?.extrinsicHash ?? '');

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
