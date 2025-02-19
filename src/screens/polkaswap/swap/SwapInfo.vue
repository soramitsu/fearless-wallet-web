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

      <Tooltip text="assets.minMaxReceiveInfo" target=".min-max" placement="right" />
    </template>

    <InfoRow
      text="assets.networkFee"
      :value="fee ? `${fee} ${soraMainAsset}` : undefined"
      :price="`${accountsStore.fiatSymbol} ${feePrice}`"
      icon="info"
      :isLoading="isLoadingFee"
      :iconClasses="['network-fee']"
    />

    <Tooltip text="assets.networkFeeSora" target=".network-fee" placement="right" />
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { firstCharToUp } from '@/helpers';
import { SORA_UTILITY_ASSET } from '@/consts/sora';
import { useAccountsStore } from '@/stores/accounts';

type Props = {
  marketType?: string;
  slippage?: number;
  sendAmount?: string;
  receiveAmount?: string;
  sendValue?: string;
  receiveValue?: string;
  minMaxAmount?: string;
  minMaxAmountPrice?: string;
  fee?: string;
  feePrice?: string;
  sendAssetUP?: string;
  receiveAssetUP?: string;
  route?: string;
  showSwapInfo?: boolean;
  isExchangeB?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
  marketType: '',
  slippage: 0,
  sendAmount: '',
  receiveAmount: '',
  sendValue: '',
  receiveValue: '',
  minMaxAmount: '',
  minMaxAmountPrice: '',
  fee: '',
  feePrice: '',
  sendAssetUP: '',
  receiveAssetUP: '',
  route: '',
  showSwapInfo: true,
});

const accountsStore = useAccountsStore();

const soraMainAsset = SORA_UTILITY_ASSET.toUpperCase();

const minMaxLabel = computed(() => (props.isExchangeB ? 'assets.maxSales' : 'assets.minReceived'));
const marketTypeUP = computed(() => firstCharToUp(props.marketType));
const isLoadingFee = computed(() => props.fee === '');
</script>
