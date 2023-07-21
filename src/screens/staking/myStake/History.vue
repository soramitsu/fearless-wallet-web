<template>
  <div class="history">
    <HistoryItem
      v-for="{ name, amount, asset, timespan, assetId } in history"
      :key="timespan"
      :name="name"
      :amount="amount"
      :asset="asset"
      :timespan="timespan"
      :assetId="assetId"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import HistoryItem from '@/screens/staking/myStake/HistoryItem.vue';

type StakingHistory = {
  name: string;
  amount: string;
  asset: string;
  timespan: number;
  assetId: string;
};

@Component({
  components: { HistoryItem },
})
export default class History extends Vue {
  @Prop({ type: Array }) history!: StakingHistory[];
}
</script>
