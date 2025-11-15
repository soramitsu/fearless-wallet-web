<template>
  <div class="withdraw-unbonded-form">
    <InfoRow
      text="assets.networkFee"
      borderType="default"
      icon="info"
      :value="`${fee} ${asset}`"
      :price="feeValueString"
      :hideLastBorder="false"
      :iconClasses="['network-fee']"
    />

    <Tooltip text="staking.stakingFee" target=".network-fee" placement="right" />
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TokenGroup } from '@extension-base/background/types/types';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

type WithdrawUnbondedProps = {
  stakingCurrency: TokenGroup;
  fee: string;
};

const props = defineProps<WithdrawUnbondedProps>();

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const { n } = useI18n();

const asset = computed(() => props.stakingCurrency.symbol);
const stakingAssetPrice = computed(() => networksStore.getAssetPrice(props.stakingCurrency?.priceId ?? '').price);
const feeValueString = computed(() => {
  const value = Number(props.fee) * stakingAssetPrice.value;

  return `${accountsStore.fiatSymbol}${n(value, 'price')}`;
});
</script>

<style lang="scss" scoped>
.withdraw-unbonded-form {
  .info-fee {
    margin-top: 10px;
  }
}
</style>
