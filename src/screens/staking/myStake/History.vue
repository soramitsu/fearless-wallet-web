<template>
  <div class="history">
    <HistoryItem
      v-for="historyItem in history"
      :key="historyItem.timestamp + historyItem.method"
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
import { Getter } from 'vuex-class';
import HistoryItem from '@/screens/staking/myStake/HistoryItem.vue';
import { GettersTypes as StakingGettersTypes } from '@/store/staking/getters';
import { type GetStakingHistory, type GetStakingNetwork } from '@/store';
import { type SoraHistoryElement, type NetworkName } from '@/interfaces';

@Component({
  components: { HistoryItem },
})
export default class History extends Vue {
  @Prop({ type: String }) network!: NetworkName;
  @Prop({ type: String }) stakingAssetId!: string;
  @Prop({ type: String }) rewardedAssetId!: string;
  @Getter(StakingGettersTypes.getStakingNetwork) getStakingNetwork!: GetStakingNetwork;
  @Getter(StakingGettersTypes.getStakingHistory) getStakingHistory!: GetStakingHistory;

  get history() {
    return this.getStakingHistory(
      this.network,
      this.stakingAssetId,
      this.stakingNetwork.stashAddress,
      this.stakingNetwork.payeeAddress
    ) as SoraHistoryElement[];
  }

  get stakingNetwork() {
    return this.getStakingNetwork(this.network);
  }
}
</script>
