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
import { defineComponent } from 'vue';

import { type TonEvent, type SoraHistoryElement, TransactionType } from '@/interfaces';
import { getType, getSignTransfer, getHistoryValue, getHumanTransferFee } from '@/helpers/history';
import { cut, getFormattedDate, setClipboard } from '@/helpers';
import BaseApi from '@/util/BaseApi';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

export default defineComponent({ name: 'HistoryDetailsForm' ,
  props: {
    assetId: String,
    historyType: String,
    historyElement: Object,
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
    };
  },
  computed: {
    historyElementSoraType() {
      return this.historyElement as unknown as SoraHistoryElement;
    },
    historyElementTonType() {
      return this.historyElement as unknown as TonEvent;
    },
    showTargetAmount() {
      return this.isSora && this.historyElementSoraType.method === 'swap';
    },
    networkProps() {
      return this.networksStore.getNetwork(this.selectedNetwork);
    },
    address() {
      if (BaseApi.isEthereumNetwork(this.selectedNetwork)) return this.accountsStore.selectedWallet.ethereumAddress;

          return BaseApi.encodeAddress(this.accountsStore.selectedWallet.address, this.networkProps.addressPrefix);
    },
    selectedNetworkJson() {
      return this.networksStore.networks.find(
            (network) => network.name.toLowerCase() === this.selectedNetwork.toLowerCase()
          );
    },
    explorerType() {
      return this.selectedNetworkJson?.externalApi?.explorers?.[0]?.type;
    },
    haveExplorers() {
      return this.explorerUrl !== '';
    },
    explorerUrl() {
      return this.networkProps?.externalApi?.explorers?.[0].url ?? '';
    },
    buttonText() {
      const explorerType =
            this.explorerType === 'etherscan'
              ? 'accounts.etherscan'
              : this.explorerType === 'tonviewer'
              ? 'accounts.tonviewer'
              : 'accounts.subscan';

          return this.$t(explorerType);
    },
    showFee() {
      if (this.isSora) return this.historyElementSoraType.method !== 'rewarded';

          if (this.isTon) return this.signTransfer === '-';

          return this.isTransfer && this.signTransfer === '-';
    },
    isTransfer() {
      return this.type === 'transfer' || this.isTon;
    },
    isReward() {
      return this.type === 'reward';
    },
    isSora() {
      return this.type === 'sora';
    },
    isTon() {
      return this.type === TransactionType.ton;
    },
    showAmount() {
      if (this.isSora || this.isTon) return true;

          return this.isTransfer;
    },
    statusIsSuccess() {
      if (this.isSora) return this.historyElementSoraType.execution.success;

          const { success } = this.historyElement!;

          return success ?? true;
    },
    validator() {
      return this.historyElement.reward?.validator;
    },
    displayValidator() {
      if (!this.validator) return 'no validator info';

          return cut(this.validator, 10);
    },
    era() {
      return this.historyElement.reward?.era;
    },
    statusClasses() {
      return ['item-value', this.statusIsSuccess ? 'status-success' : 'status-reject'];
    },
    statusText() {
      return this.statusIsSuccess ? 'Completed' : 'Reject';
    },
    fromAddress() {
      if (this.isTon) return this.historyElementTonType?.from;

          return this.historyElement.transfer?.from;
    },
    displayFromAddress() {
      return cut(this.fromAddress, 10);
    },
    toAddress() {
      if (this.isTon) return this.historyElementTonType?.to;

          return this.historyElement.transfer?.to;
    },
    displayToAddress() {
      return cut(this.toAddress, 10);
    },
    moduleType() {
      if (this.isSora) return this.historyElementSoraType.module;

          return this.historyElement!.module;
    },
    method() {
      if (this.isSora) return this.historyElementSoraType.method;

          if (this.isTon) return this.historyElementTonType.method;

          return this.historyElement?.method;
    },
    transferFee() {
      const fees = getHumanTransferFee(this.historyElement, this.selectedNetwork);

          return this.$n(fees, 'decimalPrecise');
    },
    date() {
      return getFormattedDate(this.historyElement.timestamp);
    },
    value() {
      const { value, signTransfer } = getHistoryValue(
            this.historyElement,
            this.assetId,
            this.selectedNetwork,
            this.address
          );

          return `${signTransfer}${this.$n(value, 'decimalPrecise')}`;
    },
    targetValue() {
      const { targetValue } = getHistoryValue(this.historyElement, this.assetId, this.selectedNetwork, this.address);

          return this.$n(targetValue!, 'decimalPrecise');
    },
    type() {
      return getType(this.historyElement, this.selectedNetwork);
    },
    signTransfer() {
      return getSignTransfer(this.historyElement, this.address, this.selectedNetwork);
    },
    extrinsicHash() {
      return this.historyElement.extrinsicHash;
    },
    displayExtrinsicHash() {
      return cut(this.extrinsicHash);
    },
    blockHash() {
      return this.historyElement.blockHash;
    },
    displayBlockHash() {
      return cut(this.blockHash);
    },
    selectedNetwork() {
      // TODO Переделать на одинаковое название параметра
          return this.$route.params.network ?? this.$route.params.selectedNetwork;
    },
  },
  methods: {
    copy(value?: string) {
      if (!value) return;

          setClipboard(value);
    },
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
    },
  },
});
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
