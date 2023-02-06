<template>
  <div>
    <ContentForm class="direction-form">
      <div class="direction">
        <div class="column left-column">
          <div class="amount">1 {{ sendAssetUP }}</div>
          <div class="price">{{ fiatSymbol }}1</div>
        </div>

        <div class="hr"></div>

        <div class="chevron-right">
          <Icon icon="chevron-right-pink" class="img" />
        </div>

        <div class="column right-column">
          <div class="amount">1 {{ receiveAssetUP }}</div>
          <div class="price">{{ fiatSymbol }}1</div>
        </div>
      </div>
    </ContentForm>

    <ContentForm>
      <div class="row">
        Market

        <div class="value">
          {{ marketTypeUP }}
        </div>
      </div>

      <div class="row">
        Slippage

        <div class="value">
          {{ slippage }}
        </div>
      </div>

      <div class="row">
        Price Impact

        <div class="value">
          {{ priceImpact }}
        </div>
      </div>

      <div class="row">
        Min received

        <div class="value">
          <div>{{ minReceivedAmount }} {{ receiveAssetUP }}</div>
          <div class="price">{{ fiatSymbol }} {{ minReceivedPrice }}</div>
        </div>
      </div>

      <div class="row">
        Liquidity Provider Fee

        <div class="value">
          <div>{{ liquidityProviderFee }}</div>
          <div class="price">{{ fiatSymbol }} {{ liquidityProviderFeePrice }}</div>
        </div>
      </div>

      <div class="row">
        Network fee

        <div class="value">
          <div>{{ fee }}</div>
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

@Component
export default class SwapPreview extends Vue {
  priceImpact = '-';
  liquidityProviderFee = '-';
  liquidityProviderFeePrice = '-';

  @Prop({ default: '' }) marketType!: string;
  @Prop({ default: '' }) slippage!: string;
  @Prop({ default: '' }) minReceivedAmount!: string;
  @Prop({ default: '' }) minReceivedPrice!: string;
  @Prop({ default: '' }) fee!: string;
  @Prop({ default: '' }) feePrice!: string;
  @Prop({ default: '' }) sendAssetUP!: string;
  @Prop({ default: '' }) receiveAssetUP!: string;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;

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
