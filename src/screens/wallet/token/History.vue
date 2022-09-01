<template>
  <div :class="classes">
    <template>
      <HistoryItem v-for="history in filteredHistory" :key="history.id" :historyItem="history" :token="token" />
    </template>

    <div v-if="isEmptyHistory">Will appear here history</div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import HistoryItem from './HistoryItem.vue';
import type { FilterHistory } from '@/interfaces/common';
import { HistoryNode } from '@/interfaces/history';

@Component({
  components: { HistoryItem },
})
export default class History extends Vue {
  @Prop(Array) history!: HistoryNode[];
  @Prop(String) token!: string;
  @Prop(String) filterHistoryValue!: FilterHistory;

  get isEmptyHistory() {
    return this.filteredHistory.length === 0;
  }

  get classes() {
    return [
      'history',
      {
        'empty-history': this.isEmptyHistory,
      },
    ];
  }

  get filteredHistory() {
    if (this.filterHistoryValue === 'all') return this.history;

    const field = this.filterHistoryValue as 'transfer' | 'reward' | 'extrinsic';
    const filteredHistory = this.history.filter((historyItem) => historyItem[field] !== null);

    return filteredHistory;
  }
}
</script>

<style lang="scss" scoped>
.history {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.empty-history {
  align-items: center;
  justify-content: center;
  margin-top: -26px;
}
</style>
