<template>
  <div class="history">
    <HistoryItem
      v-for="(historyItem, index) in history"
      :key="historyItem.timestamp + index"
      :history="historyItem"
      :stakingAssetId="stakingAssetId"
      :rewardedAssetId="rewardedAssetId"
      :network="network"
      @openHistoryDetailsForm="$emit('openHistoryDetailsForm', ...arguments)"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import HistoryItem from '@/screens/staking/myStake/HistoryItem.vue';
import { type SoraHistoryElement, type NetworkName } from '@/interfaces';
import { useStakingStore } from '@/stores/staking';

@Component({
  components: { HistoryItem },
})
export default class History extends Vue {
  stakingStore = useStakingStore();

  @Prop({ type: String }) network!: NetworkName;
  @Prop({ type: String }) stakingAssetId!: string;
  @Prop({ type: String }) rewardedAssetId!: string;

  get history() {
    return this.stakingStore.getStakingHistory(
      this.network,
      this.stakingAssetId,
      this.stakingNetwork.stashAddress,
      this.stakingNetwork.payeeAddress
    ) as SoraHistoryElement[];
  }

  get stakingNetwork() {
    return this.stakingStore.getStakingNetwork(this.network);
  }
}
</script>
