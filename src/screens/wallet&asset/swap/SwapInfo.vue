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
      {{ $t(minMaxLabel) }}

      <div class="value">
        <div>{{ minMaxAmount }}</div>
        <div class="price">{{ minMaxAmountPrice }}</div>
      </div>
    </div>

    <div class="row">
      {{ $t('assets.liquidityProvideFeer') }}

      <div class="value">
        <div>{{ providerFeeCut }} {{ soraMainAsset }}</div>

        <!-- Бесполезная информация, в полькасвопе не показывается, обсудить -->
        <!-- <div class="price">{{ fiatSymbol }} {{ liquidityProviderFeePrice }}</div> -->
      </div>
    </div>

    <div class="row">
      {{ $t('assets.networkFee') }}

      <div v-if="fee" class="value">
        <div>{{ fee }} {{ soraMainAsset }}</div>

        <div class="price">{{ fiatSymbol }} {{ feePrice }}</div>
      </div>
      <div v-else>-</div>
    </div>
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
}
</style>
