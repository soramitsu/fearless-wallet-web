<template>
  <div class="history-item">
    <Logo size="mini" typeLogo="secondary" />

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
import { firstCharToUp } from '@/util/helpers';
import { HistoryNode } from '@/interfaces/history';
import Logo from '@/components/Logo.vue';
import CurrencyController from '@/controllers/currencyController';

@Component({
  components: {
    Logo,
  },
})
export default class HistoryItem extends Vue {
  @Prop(Object) historyItem!: HistoryNode;
  @Prop(String) token!: string;

  get date() {
    const date = new Date(+this.historyItem.timestamp);

    return `${date.toString().slice(0, 15)}`;
  }

  get tokenToUpperCase() {
    return this.token.toUpperCase();
  }

  get type() {
    const { reward, transfer } = this.historyItem;

    return transfer !== null ? 'transfer' : reward !== null ? 'reward' : 'extrinsic';
  }

  get value() {
    if (this.type === 'transfer') {
      const splitId = this.historyItem.id.split('-');
      const typeTransaction = splitId[splitId.length - 1];
      const { amount } = this.historyItem[this.type];

      const sign = typeTransaction === 'to' ? '+' : '-';

      return `${sign}${CurrencyController.getAroundValue(this.token, amount)}`;
    }

    if (this.type === 'reward') {
      const { amount } = this.historyItem[this.type];

      return `+${CurrencyController.getAroundValue(this.token, amount)}`;
    }

    const { fee } = this.historyItem[this.type];

    return `-${CurrencyController.getAroundValue(this.token, fee)}`;
  }

  get formattedId() {
    if (this.type === 'transfer') {
      const { to } = this.historyItem[this.type];

      return this.cut(to);
    }

    if (this.type === 'reward') {
      const { validator } = this.historyItem[this.type];

      return this.cut(validator);
    }

    const { hash } = this.historyItem[this.type];

    return this.cut(hash);
  }

  get typeFormatted() {
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
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);

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
