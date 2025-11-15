<template>
  <div>
    <InfoRow v-if="showAdditionalInfo && marketType" text="assets.market" :value="marketType" />

    <InfoRow v-if="showAdditionalInfo && isActivityForm" text="assets.slippage" :value="`${slippage}%`" />

    <InfoRow text="pools.rewardsPayout" :value="rewardAsset" iconValue="polkaswap" />

    <InfoRow v-if="showAdditionalInfo" text="pools.yourPoolShare" :value="yourShare" />

    <template v-if="showAdditionalInfo && isActivityForm">
      <Tooltip text="assets.networkFeeSora" target=".network-fee" placement="right" />

      <InfoRow
        text="assets.networkFee"
        :value="fee ? `${fee} ${soraMainAsset}` : undefined"
        :price="`${accountsStore.fiatSymbol} ${feePrice}`"
        icon="info"
        :iconClasses="['network-fee']"
      />
    </template>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PoolParams } from '@/stores';
import type { MarketType } from '@/interfaces';
import { getShareOfPool } from '@/extension/messaging';
import { getXORCurrency } from '@/helpers/currencies';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{
  poolParams: PoolParams;
  showAdditionalInfo: boolean;
  slippage: number;
  isExchangeB: boolean;
  marketType?: MarketType;
  amount1: string;
  amount2: string;
  fee: string;
  extrinsicType: 'addLiquidity' | 'removeLiquidity' | '';
}>();

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const { n } = useI18n();

const estimatedYourShare = ref('');
const previousPoolParams = ref<PoolParams | null>(null);

const currencyXOR = computed(() => getXORCurrency(accountsStore.balances));
const soraMainAsset = computed(() => currencyXOR.value?.symbol ?? '');

const feePrice = computed(() => {
  const feeValue = Number(props.fee ?? 0);
  const price = networksStore.getAssetPrice(currencyXOR.value?.priceId ?? '').price;
  const balance = price * feeValue;

  return n(balance, 'price');
});

const rewardAsset = computed(() => props.poolParams?.rewardAsset);
const yourShare = computed(() => `${n(+estimatedYourShare.value || 0, 'decimalPrecise')}%`);
const isActivityForm = computed(() => props.extrinsicType !== '');

async function fetchShare() {
  if (!props.poolParams) return;

  const share = await getShareOfPool({
    amount1: props.amount1,
    amount2: props.amount2,
    assetId1: props.poolParams.asset1.id,
    assetId2: props.poolParams.asset2.id,
    networkName: props.poolParams.network,
    type: props.extrinsicType || 'addLiquidity',
    isExchangeB: props.isExchangeB,
  });

  estimatedYourShare.value = share ?? '';
}

watch(
  () => [props.amount1, props.amount2, props.isExchangeB, props.extrinsicType],
  () => {
    if (!props.poolParams) return;
    void fetchShare();
  }
);

watch(
  () => props.poolParams,
  (newVal) => {
    if (!newVal) return;

    const prev = previousPoolParams.value;

    if (
      prev?.asset1.id === newVal.asset1.id &&
      prev?.asset2.id === newVal.asset2.id &&
      prev?.network === newVal.network
    ) {
      return;
    }

    previousPoolParams.value = newVal;
    void fetchShare();
  },
  { immediate: true }
);
</script>
