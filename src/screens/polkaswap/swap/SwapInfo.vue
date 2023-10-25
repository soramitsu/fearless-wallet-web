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

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n-composable';
import { firstCharToUp } from '@/helpers';
import { SORA_UTILITY_ASSET } from '@/consts/sora';
import { useStore } from '@/store';

type Props = {
  marketType?: string;
  slippage?: string;
  sendAmount?: string;
  receiveAmount?: string;
  sendValue?: string;
  receiveValue?: string;
  minMaxAmount?: string;
  minMaxAmountPrice?: string;
  fee?: string;
  feePrice?: string;
  providerFee?: string;
  sendAssetUP?: string;
  receiveAssetUP?: string;
  route?: string;
  showSwapInfo?: boolean;
  isExchangeB?: boolean;
};
const props = withDefaults(defineProps<Props>(), {
  marketType: '',
  slippage: '',
  sendAmount: '',
  receiveAmount: '',
  sendValue: '',
  receiveValue: '',
  minMaxAmount: '',
  minMaxAmountPrice: '',
  fee: '',
  feePrice: '',
  providerFee: '',
  sendAssetUP: '',
  receiveAssetUP: '',
  route: '',
  showSwapInfo: true,
});
const store = useStore();
const { n } = useI18n();

const fiatSymbol = ref<string>(store.getters.fiatSymbol);
const soraMainAsset = SORA_UTILITY_ASSET.toUpperCase();

const providerFeeCut = computed(() => n(+props.providerFee, 'decimal'));
const minMaxLabel = computed(() => (props.isExchangeB ? 'assets.maxSales' : 'assets.minReceived'));
const marketTypeUP = computed(() => firstCharToUp(props.marketType));
</script>
