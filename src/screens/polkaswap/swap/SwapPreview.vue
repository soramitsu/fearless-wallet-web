<template>
  <div>
    <DirectionContentForm
      :asset1="sendAssetUP"
      :asset2="receiveAssetUP"
      :amount1="sendAmount"
      :amount2="receiveAmount"
      :value1="sendValue"
      :value2="receiveValue"
    />

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
        :sendAssetUP="sendAssetUP"
        :receiveAssetUP="receiveAssetUP"
        :isExchangeB="isExchangeB"
        :route="route"
      />
    </ContentForm>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import SwapInfo from '@/screens/polkaswap/swap/SwapInfo.vue';

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
  @Prop({ default: '' }) sendAssetUP!: string;
  @Prop({ default: '' }) receiveAssetUP!: string;
  @Prop({ default: '' }) route!: string;
  @Prop(Boolean) isExchangeB!: boolean;
}
</script>
