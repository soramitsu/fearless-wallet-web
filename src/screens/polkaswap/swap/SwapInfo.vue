<template>
  <div>
    <InfoRow text="assets.market" :value="marketTypeUP" />

    <InfoRow text="assets.slippage" :value="`${slippage}%`" />

    <template v-if="showSwapInfo">
      <InfoRow text="assets.route" :value="route" />

      <InfoRow
        :text="minMaxLabel"
        :value="minMaxAmount"
        :price="minMaxAmountPrice"
        icon="info"
        :iconClasses="['min-max']"
      />

      <InfoRow
        text="assets.liquidityProvideFee"
        :value="`${providerFeeCut} ${soraMainAsset}`"
        icon="info"
        :iconClasses="['provider-fee']"
      />

      <Tooltip text="assets.minMaxReceiveInfo" target=".min-max" placement="right" />
      <Tooltip text="assets.liquidityProvideFeeInfo" target=".provider-fee" placement="right" />
    </template>

    <InfoRow
      text="assets.networkFee"
      :value="fee ? `${fee} ${soraMainAsset}` : undefined"
      :price="`${fiatSymbol} ${feePrice}`"
      icon="info"
      :iconClasses="['network-fee']"
    />

    <Tooltip text="assets.networkFeeInfo" target=".network-fee" placement="right" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { firstCharToUp } from '@/helpers/common';
import { SORA_UTILITY_ASSET } from '@/consts/networks';

@Component
export default class SwapInfo extends Vue {
  @Prop({ default: '' }) marketType!: string;
  @Prop({ default: '' }) slippage!: string;
  @Prop({ default: '' }) sendAmount!: string;
  @Prop({ default: '' }) receiveAmount!: string;
  @Prop({ default: '' }) sendValue!: string;
  @Prop({ default: '' }) receiveValue!: string;
  @Prop({ default: '' }) minMaxAmount!: string;
  @Prop({ default: '' }) minMaxAmountPrice!: string;
  @Prop({ default: '' }) fee!: string;
  @Prop({ default: '' }) feePrice!: string;
  @Prop({ default: '' }) providerFee!: string;
  @Prop({ default: '' }) sendAssetUP!: string;
  @Prop({ default: '' }) receiveAssetUP!: string;
  @Prop({ default: '' }) route!: string;
  @Prop({ default: true }) showSwapInfo!: boolean;
  @Prop(Boolean) isExchangeB!: boolean;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;

  get soraMainAsset() {
    return SORA_UTILITY_ASSET.toUpperCase();
  }

  get sendAmountCut() {
    return `${this.$n(+this.sendAmount, 'decimal')} ${this.sendAssetUP}`;
  }

  get receiveAmountCut() {
    return `${this.$n(+this.receiveAmount, 'decimal')} ${this.receiveAssetUP}`;
  }

  get providerFeeCut() {
    return this.$n(+this.providerFee, 'decimal');
  }

  get sendValueCut() {
    return `${this.fiatSymbol} ${this.$n(+this.sendValue, 'price')}`;
  }

  get receiveValueCut() {
    return `${this.fiatSymbol} ${this.$n(+this.receiveValue, 'price')}`;
  }

  get minMaxLabel() {
    return this.isExchangeB ? 'assets.maxSales' : 'assets.minReceived';
  }

  get marketTypeUP() {
    return firstCharToUp(this.marketType);
  }
}
</script>
