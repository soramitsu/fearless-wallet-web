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
import { defineComponent } from 'vue';

import HistoryItem from '@/screens/staking/myStake/HistoryItem.vue';
import { type SoraHistoryElement } from '@/interfaces';
import { useStakingStore } from '@/stores/staking';

export default defineComponent({ name: 'History',
  components: { HistoryItem },
  props: {
    network: { type: String },
    stakingAssetId: { type: String },
    rewardedAssetId: { type: String },
  },
  data() {
    return {
      stakingStore: useStakingStore(),
    };
  },
  computed: {
    history() {
      return this.stakingStore.getStakingHistory(
            this.network,
            this.stakingAssetId,
            this.stakingNetwork.stashAddress,
            this.stakingNetwork.payeeAddress
          ) as SoraHistoryElement[];
    },
    stakingNetwork() {
      return this.stakingStore.getStakingNetwork(this.network);
    },
  },
});
</script>
