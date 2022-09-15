<template>
  <AboveForm header="Details" :blur="true" :closeHandler="handlerClose">
    <div class="details">
      <div v-if="isTransfer || isExtrinsic" class="item">
        Extrinsic Hash

        <div class="item-value">{{ hash }}</div>
      </div>

      <template v-if="isTransfer">
        <div class="item">
          From

          <div class="item-value item-icon">
            <Identicon class="identicon" :size="24" theme="polkadot" :value="fromAddress" />

            {{ displayFromAddress }}
          </div>
        </div>
        <div class="item">
          To

          <div class="item-value item-icon">
            <Identicon class="identicon" :size="24" theme="polkadot" :value="toAddress" />

            {{ displayToAddress }}
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

      <div v-if="isTransfer || isExtrinsic" class="item">
        Transfer fee

        <div class="item-value">{{ transferFee }}</div>
      </div>
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Identicon from '@polkadot/vue-identicon';
import type { HistoryNode } from '@/interfaces/history';
import AboveForm from '@/components/AboveForm.vue';
import {
  cut,
  getHash,
  getType,
  getCall,
  getModule,
  getToAddress,
  getFromAddress,
  getSignTransfer,
  getHistoryValue,
  getFormattedDate,
  getHumanTransferFee,
} from '@/util/historyHelpers';

@Component({
  components: {
    AboveForm,
    Identicon,
  },
})
export default class SelectNetworkButton extends Vue {
  @Prop({ default: false }) allNetworks!: boolean;
  @Prop(String) token!: string;
  @Prop(Object) historyNode!: HistoryNode;
  @Prop(Function) handlerClose!: VoidFunction;

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
    return getFromAddress(this.historyNode);
  }

  get displayFromAddress() {
    return cut(this.fromAddress, 10);
  }

  get toAddress() {
    return getToAddress(this.historyNode);
  }

  get displayToAddress() {
    return cut(this.toAddress, 10);
  }

  get moduleType() {
    return getModule(this.historyNode);
  }

  get call() {
    return getCall(this.historyNode);
  }

  get transferFee() {
    return getHumanTransferFee(this.historyNode, this.token);
  }

  get date() {
    return getFormattedDate(this.historyNode);
  }

  get value() {
    return getHistoryValue(this.historyNode, this.token);
  }

  get type() {
    return getType(this.historyNode);
  }

  get signTransfer() {
    return getSignTransfer(this.historyNode);
  }

  get hash() {
    return getHash(this.historyNode);
  }
}
</script>

<style lang="scss" scoped>
.details {
  padding: 0 $default-padding;

  .item {
    color: rgba(255, 255, 255, 0.75);
    border-bottom: 1px solid $default-background-color;
    padding: $default-padding 0;
    display: flex;
    justify-content: space-between;

    .item-value {
      font-weight: 600;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .item-icon {
      flex-direction: row;
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
</style>
