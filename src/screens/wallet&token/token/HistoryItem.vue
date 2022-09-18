<template>
  <div class="history-item">
    <NetworkLogo :name="token" />

    <div class="column">
      <div class="first-row">
        <div>{{ hash }}</div>
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
import type { HistoryNode } from '@/interfaces/history';
import NetworkLogo from '@/components/NetworkLogo.vue';
import { getHash, getType, getTypeFormatted, getFormattedDate, getHistoryValue } from '@/util/historyHelpers';

@Component({
  components: { NetworkLogo },
})
export default class HistoryItem extends Vue {
  @Prop(Object) historyNode!: HistoryNode;
  @Prop(String) token!: string;

  get date() {
    return getFormattedDate(this.historyNode);
  }

  get tokenToUpperCase() {
    return this.token.toUpperCase();
  }

  get type() {
    return getType(this.historyNode);
  }

  get value() {
    return getHistoryValue(this.historyNode, this.token);
  }

  get hash() {
    return getHash(this.historyNode);
  }

  get typeFormatted() {
    return getTypeFormatted(this.historyNode);
  }
}
</script>

<style lang="scss" scoped>
.history-item {
  display: flex;
  margin: 0 16px;
  padding: $default-padding 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);

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
