<template>
  <div>
    <DirectionContentForm
      :asset1="sendAssetUP"
      :asset2="receiveAssetUP"
      :amount1="sendAmount"
      :amount2="receiveAmount"
      :value1="sendPriceUnavailable ? null : sendValue"
      :value2="receivePriceUnavailable ? null : receiveValue"
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
import { defineComponent } from 'vue';

import SwapInfo from '@/screens/polkaswap/swap/SwapInfo.vue';

export default defineComponent({ name: 'SwapPreview',
  components: { SwapInfo },
  props: {
    marketType: { default: '' },
    slippage: { default: '' },
    sendAmount: { default: '' },
    receiveAmount: { default: '' },
    sendValue: { default: '' },
    receiveValue: { default: '' },
    // An asset without a trusted price has no fiat value: the review says "Price unavailable" for it.
    sendPriceUnavailable: Boolean,
    receivePriceUnavailable: Boolean,
    minMaxAmount: { default: '' },
    minMaxAmountPrice: { default: '' },
    fee: { default: '' },
    feePrice: { default: '' },
    sendAssetUP: { default: '' },
    receiveAssetUP: { default: '' },
    route: { default: '' },
    isExchangeB: Boolean,
  },
});
</script>
