<template>
  <div class="history-item">
    <NetworkLogo :name="token" />

    <div class="column">
      <div class="first-row">
        <div>{{ formattedId }}</div>
        <div>{{ value }} {{ tokenToUpperCase }}</div>
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
import { format, isToday, isThisYear, secondsToMilliseconds } from 'date-fns';
import { Getter } from 'vuex-class';
import NetworkLogo from '@/components/NetworkLogo.vue';
import { firstCharToUp } from '@/util/helpers';
import { HistoryNode, TransferType, TransactionType as TTransaction } from '@/interfaces/history';
import { formattedNumber } from '@/util/numbers';
import { Currencies } from '@/interfaces/currencies';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

@Component({
  components: { NetworkLogo },
})
export default class HistoryItem extends Vue {
  @Prop(Object) historyItem!: HistoryNode;
  @Prop(String) token!: string;
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;

  get date() {
    const date = new Date(secondsToMilliseconds(+this.historyItem.timestamp));

    if (isToday(date)) {
      return format(date, 'HH:mm');
    } else if (isThisYear(date)) {
      return format(date, 'dd MMMM HH:mm');
    }

    return format(date, 'dd MMMM yyyy HH:mm');
  }

  get tokenToUpperCase() {
    return this.token.toUpperCase();
  }

  get type() {
    const { reward, transfer } = this.historyItem;

    return transfer !== null ? TTransaction.transfer : reward !== null ? TTransaction.reward : TTransaction.extrinsic;
  }

  get signTransfer() {
    if (this.type === TTransaction.transfer) {
      const splitId = this.historyItem.id.split('-');
      const typeTransaction = splitId[splitId.length - 1];

      return typeTransaction === 'to' ? '+' : '-';
    }

    return '';
  }

  get currentCurrency() {
    return this.currencies.find(({ token }) => token === this.token);
  }

  get value() {
    if (!this.currentCurrency) return '';

    if (this.type === TTransaction.transfer) {
      const { amount } = this.historyItem[this.type];
      const value = +this.currentCurrency.getHumanValue(amount);

      return `${this.signTransfer}${formattedNumber(value, 4)}`;
    }

    if (this.type === TTransaction.reward) {
      const { amount } = this.historyItem[this.type];
      const value = +this.currentCurrency.getHumanValue(amount);

      return `+${formattedNumber(value, 4)}`;
    }

    // extrinsic
    const { fee } = this.historyItem[this.type];
    const value = +this.currentCurrency.getHumanValue(fee);

    return `-${formattedNumber(value, 4)}`;
  }

  get formattedId() {
    if (this.type === TTransaction.transfer) {
      const { to } = this.historyItem[this.type];

      return this.cut(to);
    }

    if (this.type === TTransaction.reward) {
      const { validator } = this.historyItem[this.type];

      return this.cut(validator);
    }

    // extrinsic
    const { module } = this.historyItem[this.type];

    return firstCharToUp(module);
  }

  get typeFormatted() {
    if (this.type === TTransaction.transfer) {
      return this.signTransfer === '+' ? TransferType.incoming : TransferType.outgoing;
    }

    if (this.type === TTransaction.extrinsic) {
      const { call } = this.historyItem[this.type];

      return `${firstCharToUp(call)}${call === 'transfer' ? ' fee' : ''}`;
    }

    // reward
    return firstCharToUp(this.type);
  }

  cut(value: string) {
    return `${value.slice(0, 7)}...${value.slice(-8)}`;
  }
}
</script>

<style lang="scss" scoped>
.history-item {
  display: flex;
  margin: 11px 16px 0 16px;
  padding-bottom: $default-padding;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);

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
    }
  }
}
</style>
