<template>
  <div>
    <InfoRow v-if="showAdditionalInfo && marketType" text="assets.market" :value="marketType" />

    <InfoRow v-if="showAdditionalInfo && isActivityForm" text="assets.slippage" :value="`${slippage}%`" />

    <InfoRow text="pools.rewardsPayout" :value="rewardAsset" iconValue="polkaswap" />

    <InfoRow v-if="showAdditionalInfo" text="pools.yourPoolShare" :value="yourShare" />

    <template v-if="showAdditionalInfo && isActivityForm">
      <Tooltip text="assets.networkFeeSora" target=".network-fee" placement="right" />

      <InfoRow
        text="assets.networkFee"
        :value="fee ? `${fee} ${soraMainAsset}` : undefined"
        :price="`${fiatSymbol} ${feePrice}`"
        icon="info"
        :iconClasses="['network-fee']"
      />
    </template>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { GetAssetPrice, PoolParams } from '@/store';
import type { MarketType } from '@/interfaces';
import type { TokenGroup } from '@extension-base/background/types/types';
import { getShareOfPool } from '@/extension/messaging';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { getXORCurrency } from '@/helpers/currencies';

@Component({})
export default class PoolDescription extends Vue {
  estimatedYourShare = '';
  _poolParams: PoolParams | null = null;

  @Prop({ type: Object }) poolParams!: PoolParams;
  @Prop(Boolean) showAdditionalInfo!: boolean;
  @Prop(Number) slippage!: number;
  @Prop(Boolean) isExchangeB!: boolean;
  @Prop(String) marketType?: MarketType;
  @Prop(String) amount1!: string;
  @Prop(String) amount2!: string;
  @Prop(String) fee!: string;
  @Prop(String) extrinsicType!: 'addLiquidity' | 'removeLiquidity' | '';
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenGroup[];

  get soraMainAsset() {
    return this.currencyXOR.symbol;
  }

  get currencyXOR() {
    return getXORCurrency(this.balances);
  }

  get feePrice() {
    const fee = this.fee ?? 0;
    const balance = this.getAssetPrice(this.currencyXOR?.priceId ?? '').price * +fee;

    return this.$n(+balance, 'price');
  }

  get rewardAsset() {
    return this.poolParams?.rewardAsset;
  }

  get yourShare() {
    return `${this.$n(+this.estimatedYourShare, 'decimalPrecise')}%`;
  }

  get isMyPool() {
    return this.poolParams.isMyPool;
  }

  get isActivityForm() {
    return this.extrinsicType !== '';
  }

  @Watch('amount1')
  @Watch('amount2')
  async calculateShare() {
    if (!this.poolParams) return;

    this.estimatedYourShare = await this.getShareOfPool();
  }

  @Watch('poolParams')
  async calculateShare2() {
    if (!this.poolParams) return;

    if (
      this._poolParams?.asset1.id === this.poolParams.asset1.id &&
      this._poolParams?.asset2.id === this.poolParams.asset2.id &&
      this._poolParams?.network === this.poolParams.network
    )
      return;

    this.estimatedYourShare = await this.getShareOfPool();

    this._poolParams = this.poolParams;
  }

  created() {
    this.calculateShare();
  }

  async getShareOfPool() {
    return await getShareOfPool({
      amount1: this.amount1,
      amount2: this.amount2,
      assetId1: this.poolParams.asset1.id,
      assetId2: this.poolParams.asset2.id,
      networkName: this.poolParams.network,
      type: this.extrinsicType || 'addLiquidity',
      isExchangeB: this.isExchangeB,
    });
  }
}
</script>
