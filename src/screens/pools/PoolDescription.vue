<template>
  <div>
    <InfoRow v-if="showAdditionalInfo && marketType" text="assets.market" :value="marketType" />

    <InfoRow v-if="showAdditionalInfo && !isMyPool" text="assets.slippage" :value="`${slippage}%`" />

    <InfoRow text="pools.rewardsPayout" :value="rewardAsset" />

    <InfoRow v-if="showAdditionalInfo" text="pools.yourPoolShare" :value="yourShare" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import type { PoolParams } from '@/store';
import type { MarketType } from '@/interfaces';
import { getShareOfPool } from '@/extension/messaging';

@Component({})
export default class PoolDescription extends Vue {
  estimatedYourShare = '';

  @Prop({ type: Object }) poolParams!: PoolParams;
  @Prop(Boolean) showAdditionalInfo!: boolean;
  @Prop(String) marketType?: MarketType;
  @Prop(Number) slippage!: number;
  @Prop(String) amount1!: string;
  @Prop(String) amount2!: string;
  @Prop(String) type!: 'add' | 'remove';

  get apr() {
    return `${this.poolParams?.apr}%`;
  }

  get rewardAsset() {
    return this.poolParams?.rewardAsset;
  }

  get yourShare() {
    const share = this.type ? this.estimatedYourShare : this.poolParams?.yourShare ?? 0;

    return `${this.$n(+share, 'decimalPrecise')}%`;
  }

  get isMyPool() {
    return this.poolParams.isMyPool;
  }

  @Watch('amount1')
  @Watch('amount2')
  async amountWatcher() {
    this.estimatedYourShare = await getShareOfPool({
      amount1: this.amount1,
      amount2: this.amount2,
      assetId1: this.poolParams.asset1.id,
      assetId2: this.poolParams.asset2.id,
      networkName: this.poolParams.network,
      type: this.type,
    });
  }
}
</script>
