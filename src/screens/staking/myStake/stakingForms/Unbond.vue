<template>
  <div class="unbond-form">
    <InfoRow
      class="info-fee"
      text="assets.networkFee"
      borderType="default"
      icon="info"
      :value="`${fee} ${asset}`"
      :price="valueString"
      :iconClasses="['network-fee']"
    />

    <InfoRow class="unbond-period" text="staking.unstakingPeriod" borderType="default" :value="period" />

    <div class="disclaimer" data-testid="unstakingDisclaimers1">
      <Icon icon="wallet-2" class="img" />

      {{ $t('staking.unstakingDisclaimers1') }}
    </div>

    <div class="disclaimer" data-testid="unstakingDisclaimers2">
      <Icon icon="logout" class="img" />

      {{ $t('staking.unstakingDisclaimers2') }}
    </div>

    <Tooltip text="staking.stakingFee" target=".network-fee" placement="right" />
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { NetworkParams } from '@/stores';
import type { TokenGroup } from '@extension-base/background/types/types';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

type UnbondProps = {
  stakingCurrency: TokenGroup;
  stakingNetwork: NetworkParams;
  fee: string;
};

const props = defineProps<UnbondProps>();

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const { n, t } = useI18n();

const asset = computed(() => props.stakingNetwork.asset);
const stakingAssetPrice = computed(() => networksStore.getAssetPrice(props.stakingCurrency?.priceId ?? '').price);
const valueString = computed(() => {
  const value = Number(props.fee) * stakingAssetPrice.value;

  return `${accountsStore.fiatSymbol}${n(value, 'price')}`;
});
const period = computed(() => `${props.stakingNetwork.unbondPeriod} ${t('common.days')}`);
</script>

<style lang="scss" scoped>
.unbond-form {
  .info-fee {
    margin-top: 10px;
  }

  .unbond-period {
    margin-bottom: 20px;
  }

  .disclaimer {
    display: flex;
    align-items: center;
    font-size: 0.875em;
    color: $default-white;
    margin: 0 0 10px 16px;

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
