<template>
  <div>
    <InfoRow v-if="showAdditionalInfo" text="assets.market" :value="marketType" />

    <InfoRow v-if="showAdditionalInfo" text="assets.slippage" :value="`${slippage}%`" />

    <InfoRow text="pools.strategicBonus" :value="apr" icon="info" :iconClasses="['strategic-bonus']" />

    <InfoRow text="pools.rewardsPayout" :value="rewardAsset" />

    <Tooltip text="pools.strategicBonusDescription" target=".strategic-bonus" placement="right" />

    <InfoRow v-if="showAdditionalInfo" text="pools.yourPoolShare" :value="yourShare" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { PoolParams } from '@/store';
import type { MarketType } from '@/interfaces';

@Component({
  components: {},
})
export default class PoolDescription extends Vue {
  @Prop({ type: Object }) poolParams!: PoolParams;
  @Prop(Boolean) showAdditionalInfo!: boolean;
  @Prop(String) marketType!: MarketType;
  @Prop(Number) slippage!: number;

  get apr() {
    return `${this.poolParams.apr}%`;
  }

  get rewardAsset() {
    return this.poolParams.rewardAsset;
  }

  get yourShare() {
    return this.poolParams.yourShare;
  }
}
</script>
