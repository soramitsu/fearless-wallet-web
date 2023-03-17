<template>
  <div>
    <div class="row">
      {{ $t('assets.market') }}

      <div class="value">
        {{ marketTypeUP }}
      </div>
    </div>

    <div class="row">
      {{ $t('assets.Slippage') }}

      <div class="value">{{ slippage }}%</div>
    </div>

    <div class="row">
      <div class="label">
        {{ $t(minMaxLabel) }}

        <Icon icon="info" class="icon-info min-max" />
      </div>

      <div class="value">
        <div>{{ minMaxAmount }}</div>
        <div class="price">{{ minMaxAmountPrice }}</div>
      </div>
    </div>

    <div class="row">
      <div class="label">
        {{ $t('assets.liquidityProvideFee') }}

        <Icon icon="info" class="icon-info provider-fee" />
      </div>

      <div class="value">{{ providerFeeCut }} {{ soraMainAsset }}</div>
    </div>

    <div class="row">
      <div class="label">
        {{ $t('assets.networkFee') }}

        <Icon icon="info" class="icon-info network-fee" />
      </div>

      <div v-if="fee" class="value">
        <div>{{ fee }} {{ soraMainAsset }}</div>

        <div class="price">{{ fiatSymbol }} {{ feePrice }}</div>
      </div>
      <div v-else>-</div>
    </div>

    <Tooltip text="assets.minMaxReceiveInfo" target=".min-max" placement="right" />
    <Tooltip text="assets.liquidityProvideFeeInfo" target=".provider-fee" placement="right" />
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
export default class SwapPreview extends Vue {
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
  @Prop(Boolean) isExchangeB!: boolean;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;

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

<style lang="scss" scoped>
.row {
  margin: 0 16px;
  height: 55px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid $secondary-background-color;

  .value {
    text-align: right;

    .price {
      color: $gray-color;
    }
  }

  &:last-child {
    border: none;
  }

  .label {
    display: flex;

    .icon-info {
      margin-left: 13px;
      width: 18px;
      height: 18px;
      color: $grayish-white;
      cursor: pointer;

      &:hover {
        color: $default-white;
      }
    }
  }
}
</style>
