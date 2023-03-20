<template>
  <div>
    <ContentForm class="direction-form">
      <div class="direction">
        <div class="column left-column">
          <div class="amount">{{ sendAmountCut }}</div>
          <div class="price">{{ sendValueCut }}</div>
        </div>

        <div class="hr"></div>

        <div class="chevron-right">
          <Icon icon="chevron-right" class="img" />
        </div>

        <div class="column right-column">
          <div class="amount">{{ receiveAmountCut }}</div>
          <div class="price">{{ receiveValueCut }}</div>
        </div>
      </div>
    </ContentForm>

    <ContentForm>
      <SwapInfo
        :marketType="marketType"
        :slippage="slippage"
        :sendAmount="sendAmount"
        :receiveAmount="receiveAmount"
        :sendValue="sendValue"
        :receiveValue="receiveValue"
        :minMaxAmount="minMaxAmount"
        :minMaxAmountPrice="minMaxAmountPrice"
        :fee="fee"
        :feePrice="feePrice"
        :providerFee="providerFee"
        :sendAssetUP="sendAssetUP"
        :receiveAssetUP="receiveAssetUP"
        :isExchangeB="isExchangeB"
      />
    </ContentForm>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import SwapInfo from '@/screens/wallet&asset/swap/SwapInfo.vue';

@Component({
  components: { SwapInfo },
})
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

  get sendAmountCut() {
    return `${this.$n(+this.sendAmount, 'decimal')} ${this.sendAssetUP}`;
  }

  get receiveAmountCut() {
    return `${this.$n(+this.receiveAmount, 'decimal')} ${this.receiveAssetUP}`;
  }

  get sendValueCut() {
    return `${this.fiatSymbol} ${this.$n(+this.sendValue, 'price')}`;
  }

  get receiveValueCut() {
    return `${this.fiatSymbol} ${this.$n(+this.receiveValue, 'price')}`;
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
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;

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
  color: #ee0077;
}
</style>
