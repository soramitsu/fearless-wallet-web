<template>
  <div class="history">
    <HistoryItem
      v-for="(historyItem, index) in history"
      :key="historyItem.timestamp + index"
      :history="historyItem"
      :stakingAssetId="stakingAssetId"
      :rewardedAssetId="rewardedAssetId"
      :network="network"
      @openHistoryDetailsForm="handleOpenHistoryDetailsForm"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { HistoryElement, NetworkName } from '@/interfaces';
import HistoryItem from '@/screens/staking/myStake/HistoryItem.vue';
import { useStakingStore } from '@/stores/staking';

const props = defineProps<{
  network: NetworkName;
  stakingAssetId: string;
  rewardedAssetId: string;
}>();

const stakingStore = useStakingStore();

const stakingNetwork = computed(() => stakingStore.getStakingNetwork(props.network));

const emit = defineEmits<{
  openHistoryDetailsForm: [payload: unknown[]];
}>();

const historyResult = computed(() =>
  stakingStore.getStakingHistory(
    props.network,
    props.stakingAssetId,
    stakingNetwork.value.stashAddress,
    stakingNetwork.value.payeeAddress
  )
);

const history = computed<HistoryElement[]>(() => (historyResult.value.entries as HistoryElement[]) ?? []);

const handleOpenHistoryDetailsForm = (...args: unknown[]) => emit('openHistoryDetailsForm', args);
</script>
