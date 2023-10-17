<template>
  <div class="history">
    <HistoryItem
      v-for="historyItem in history"
      :key="historyItem.timestamp + historyItem.method"
      :history="historyItem"
      :assetId="assetId"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import HistoryItem from '@/screens/staking/myStake/HistoryItem.vue';
import { GettersTypes as StakingGettersTypes } from '@/store/staking/getters';
import { GetStakingHistory } from '@/store';
import { NetworkName } from '@/interfaces';

@Component({
  components: { HistoryItem },
})
export default class History extends Vue {
  @Prop({ type: String }) network!: NetworkName;
  @Prop({ type: String }) assetId!: string;
  @Getter(StakingGettersTypes.getStakingHistory) getStakingNetwork!: GetStakingHistory;

  get history() {
    return this.getStakingNetwork(this.network, this.assetId);
  }
}
</script>
