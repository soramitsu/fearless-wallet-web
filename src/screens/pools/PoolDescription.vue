<template>
  <div>
    <InfoRow text="pools.strategicBonus" :value="apr" icon="info" :iconClasses="['strategic-bonus']" />

    <InfoRow text="pools.rewardsPayout" :value="rewardAsset" />

    <Tooltip text="pools.strategicBonusDescription" target=".strategic-bonus" placement="right" />

    <InfoRow v-if="showShare" text="pools.yourPoolShare" :value="yourShare" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { PoolParams } from '@/store';

@Component({
  components: {},
})
export default class PoolDescription extends Vue {
  @Prop({ type: Object }) poolParams!: PoolParams;
  @Prop(Boolean) showShare!: boolean;

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
