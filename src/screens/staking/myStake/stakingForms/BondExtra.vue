<template>
  <div class="bond-extra-form">
    <InfoRow
      class="info-fee"
      text="assets.networkFee"
      borderType="default"
      icon="info"
      :value="`${fee} ${asset}`"
      :price="valueString"
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

type BondExtraProps = {
  stakingCurrency: TokenGroup;
  fee: string;
};

const props = defineProps<BondExtraProps>();

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const { n } = useI18n();

const asset = computed(() => props.stakingCurrency.symbol);
const stakingAssetPrice = computed(() => networksStore.getAssetPrice(props.stakingCurrency?.priceId ?? '').price);
const valueString = computed(() => {
  const value = Number(props.fee) * stakingAssetPrice.value;

  return `${accountsStore.fiatSymbol}${n(value, 'price')}`;
});
</script>

<style lang="scss" scoped>
.bond-extra-form {
  .info-fee {
    margin-top: 10px;
  }

  .disclaimer {
    display: flex;
    align-items: center;
    font-size: 0.875em;
    color: $default-white;
    margin-bottom: 10px;

    &:last-child {
      margin-bottom: none;
    }
  }

  .img {
    margin-right: 10px;
    height: 30px;
    width: 30px;
  }
}
</style>
