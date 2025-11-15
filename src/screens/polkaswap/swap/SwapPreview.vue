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

<script lang="ts" setup>
import SwapInfo from '@/screens/polkaswap/swap/SwapInfo.vue';

defineProps<{
  marketType: string;
  slippage: string;
  sendAmount: string;
  receiveAmount: string;
  sendValue: string;
  receiveValue: string;
  minMaxAmount: string;
  minMaxAmountPrice: string;
  fee: string;
  feePrice: string;
  sendAssetUP: string;
  receiveAssetUP: string;
  route: string;
  isExchangeB: boolean;
}>();
</script>
