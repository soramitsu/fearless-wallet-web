<template>
  <div>
    <ContentForm class="direction-form">
      <div class="direction">
        <div class="column left-column">
          <div class="amount">{{ sendAmountCut }} {{ sendAssetUP }}</div>
          <div class="price">{{ fiatSymbol }} {{ sendValueCut }}</div>
        </div>

        <div class="hr"></div>

        <div class="chevron-right">
          <Icon icon="chevron-right-pink" class="img" />
        </div>

        <div class="column right-column">
          <div class="amount">{{ receiveAmountCut }} {{ receiveAssetUP }}</div>
          <div class="price">{{ fiatSymbol }} {{ receiveValueCut }}</div>
        </div>
      </div>
    </ContentForm>

    <ContentForm>
      <div class="row">
        {{ $t('asset.market') }}

        <div class="value">
          {{ marketTypeUP }}
        </div>
      </div>

      <div class="row">
        {{ $t('asset.Slippage') }}

        <div class="value">
          {{ slippage }}
        </div>
      </div>

      <div class="row">
        {{ $t('asset.priceImpact') }}

        <div class="value">-</div>
      </div>

      <div class="row">
        {{ $t(minMaxLabel) }}

        <div class="value">
          <div>{{ minMaxAmount }} {{ minMaxAssetName }}</div>
          <div class="price">{{ fiatSymbol }} {{ minMaxAmountPrice }}</div>
        </div>
      </div>

      <div class="row">
        {{ $t('asset.liquidityProvideFeer') }}

        <div class="value">
          <div>{{ providerFeeCut }} {{ soraMainAsset }}</div>

          <!-- Бесполезная информация, в полькасвопе не показывается, обсудить -->
          <!-- <div class="price">{{ fiatSymbol }} {{ liquidityProviderFeePrice }}</div> -->
        </div>
      </div>

      <div class="row">
        {{ $t('asset.networkFee') }}

        <div class="value">
          <div>{{ fee }} {{ soraMainAsset }}</div>
          <div class="price">{{ fiatSymbol }} {{ feePrice }}</div>
        </div>
      </div>
    </ContentForm>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { firstCharToUp } from '@/helpers/common';
import { formattedCountAsset, formattedPrice } from '@/helpers/numbers';
import { soraUtilityAsset } from '@/consts/currencies';

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
    return soraUtilityAsset;
  }

  get minMaxAssetName() {
    return this.isExchangeB ? this.sendAssetUP : this.receiveAssetUP;
  }

  get sendAmountCut() {
    return formattedCountAsset(+this.sendAmount);
  }

  get receiveAmountCut() {
    return formattedCountAsset(+this.receiveAmount);
  }

  get providerFeeCut() {
    return formattedCountAsset(+this.providerFee);
  }

  get sendValueCut() {
    return formattedPrice(+this.sendValue);
  }

  get receiveValueCut() {
    return formattedPrice(+this.receiveValue);
  }

  get minMaxLabel() {
    return this.isExchangeB ? 'asset.maxSales' : 'asset.minReceived';
  }

  get marketTypeUP() {
    return firstCharToUp(this.marketType);
  }
}
</script>

<style lang="scss" scoped>
.direction-form {
  margin-bottom: 16px !important;

  .direction {
    padding: 24px 16px;
    display: flex;
    justify-content: space-between;
    height: 95px;

    .column {
      display: flex;
      flex-direction: column;
      width: 245px;

      .amount {
        font-weight: 800;
        font-size: 22px;
        color: white;
        margin-bottom: 5px;

        .price {
          font-size: 12px;
          color: $gray-color;
        }
      }
    }

    .left-column {
      text-align: left;
    }

    .right-column {
      text-align: right;
    }

    .hr {
      height: 95px;
      margin: -24px auto 0;
      width: 1px;
      border-left: 2px solid $secondary-background-color;
    }
  }
}

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
}

.chevron-right {
  border-radius: 50%;
  background-color: rgb(29, 29, 29);
  width: 46px;
  height: 46px;
  display: flex;
  justify-content: center;
  align-items: center;
  margin: -46px auto 0;
  border: 1px solid $secondary-background-color;
  opacity: 1;
  position: absolute;
  top: 70px;
  left: 241px;
  cursor: pointer;
}

.img {
  height: 20px;
  width: 20px;
  margin-left: 4px;
}
</style>
