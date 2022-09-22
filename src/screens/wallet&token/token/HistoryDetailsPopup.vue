<template>
  <AboveForm header="Details" :blur="true" :closeHandler="handlerClose">
    <div class="details">
      <div class="descriptions">
        <div v-if="isExtrinsic" class="item">
          Extrinsic Hash

          <div class="item-value item-icon">
            {{ displayHash }}

            <img src="@/assets/copy.svg" class="copy" @click="copy(hash)" />
          </div>
        </div>

        <template v-if="isTransfer">
          <div class="item">
            From

            <div class="item-value item-icon">
              <Identicon class="identicon" :size="24" theme="polkadot" :value="fromAddress" />

              {{ displayFromAddress }}

              <img src="@/assets/copy.svg" class="copy" @click="copy(fromAddress)" />
            </div>
          </div>
          <div class="item">
            To

            <div class="item-value item-icon">
              <Identicon class="identicon" :size="24" theme="polkadot" :value="toAddress" />

              {{ displayToAddress }}

              <img src="@/assets/copy.svg" class="copy" @click="copy(toAddress)" />
            </div>
          </div>
        </template>

        <div v-if="isReward" class="item">
          Validator

          <div class="item-value">
            <Identicon class="identicon" :size="24" theme="polkadot" :value="validator" />

            {{ validator }}
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

      <Button size="big" text="View in Subscan" @click="openSubscan" />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Identicon from '@polkadot/vue-identicon';
import { Getter } from 'vuex-class';
import type { HistoryNode } from '@/interfaces/history';
import type { SelectedWallet } from '@/store/accounts/types';
import AboveForm from '@/components/AboveForm.vue';
import Button from '@/components/Button.vue';
import {
  cut,
  getType,
  getSignTransfer,
  getHistoryValue,
  getFormattedDate,
  getHumanTransferFee,
} from '@/helpers/history';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import BaseApi from '@/util/BaseApi';

@Component({
  components: {
    Button,
    AboveForm,
    Identicon,
  },
})
export default class SelectNetworkButton extends Vue {
  @Prop(String) tokenId!: string;
  @Prop(Object) historyNode!: HistoryNode;
  @Prop(Function) handlerClose!: VoidFunction;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get isTransfer() {
    return this.type === 'transfer';
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
      const { success } = this.historyNode.transfer;

      return success;
    }

    if (this.isExtrinsic) {
      const { success } = this.historyNode.extrinsic;

      return success;
    }

    return true;
  }

  get validator() {
    return this.historyNode.reward.validator;
  }

  get era() {
    return this.historyNode.reward.era;
  }

  get statusClasses() {
    return ['item-value', this.statusIsSuccess ? 'status-success' : 'status-reject'];
  }

  get statusText() {
    if (this.isTransfer) {
      const { success } = this.historyNode.transfer;

      return success ? 'Completed' : 'Reject';
    }

    if (this.isExtrinsic) {
      const { success } = this.historyNode.extrinsic;

      return success ? 'Completed' : 'Reject';
    }

    return '';
  }

  get fromAddress() {
    return this.historyNode.transfer.from;
  }

  get displayFromAddress() {
    return cut(this.fromAddress, 10);
  }

  get toAddress() {
    return this.historyNode.transfer.to;
  }

  get displayToAddress() {
    return cut(this.toAddress, 10);
  }

  get moduleType() {
    return this.historyNode.extrinsic.module;
  }

  get call() {
    return this.historyNode.extrinsic.call;
  }

  get transferFee() {
    return getHumanTransferFee(this.historyNode, this.tokenId);
  }

  get date() {
    return getFormattedDate(this.historyNode);
  }

  get value() {
    return getHistoryValue(this.historyNode, this.tokenId);
  }

  get type() {
    return getType(this.historyNode);
  }

  get signTransfer() {
    return getSignTransfer(this.historyNode);
  }

  get hash() {
    return this.historyNode.extrinsic.hash;
  }

  get displayHash() {
    return cut(this.hash);
  }

  get selectedNetwork() {
    return this.$route.params.network;
  }

  get addressByNetwork() {
    return BaseApi.formatAddress(this.selectedWallet, this.selectedNetwork);
  }

  copy(value: string) {
    navigator.clipboard.writeText(value);
  }

  openSubscan() {
    const url = this.isExtrinsic
      ? `https://${this.selectedNetwork}.subscan.io/extrinsic/${this.hash}`
      : `https://${this.selectedNetwork}.subscan.io/account/${this.addressByNetwork}`;

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
      color: rgba(255, 255, 255, 0.75);
      border-bottom: 1px solid $default-background-color;
      padding: $default-padding 0;
      display: flex;
      justify-content: space-between;
      height: 55px;

      .item-value {
        font-weight: 600;
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      .item-icon {
        flex-direction: row;

        .copy {
          margin-left: 10px;
          filter: invert(0.35);

          &:hover {
            cursor: pointer;
            filter: invert(0.25);
          }
        }
      }

      .status-success {
        color: #00ee77;
      }

      .status-reject {
        color: #ed0e0e;
      }

      .identicon {
        margin-right: 10px;
      }
    }
  }
}
</style>
