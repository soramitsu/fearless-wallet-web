<template>
  <div class="controller-account">
    <template v-if="step === 1">
      <InfoRow
        text="accounts.account"
        borderType="default"
        data-testid="accountName"
        :value="accountNameCut"
        :price="addressCut"
        :hideLastBorder="false"
      />

      <InfoRow
        text="staking.payoutAccount"
        borderType="default"
        data-testid="infoPayoutAccount"
        :value="payeeCut"
        :hideLastBorder="false"
      />
    </template>

    <template v-else>
      <InputWithIcon
        :value="addressCut"
        icon="close"
        placeholder="staking.payoutAccount"
        class="payout-account"
        data-testid="inputAddress"
        @click="setPayoutAddress"
      />

      <slot></slot>

      <Hint text="staking.defaultPayout" iconName="notification" class="hint row" />
    </template>

    <InfoRow
      v-show="step !== 1"
      class="info-fee"
      text="assets.networkFee"
      borderType="default"
      icon="info"
      data-testid="assetsNetworkFee"
      :value="`${fee} ${asset}`"
      :price="valueString"
      :hideLastBorder="false"
      :iconClasses="['staking-fee']"
    />

    <Tooltip text="staking.stakingFee" target=".staking-fee" placement="right" data-testid="stakingFee" />
  </div>
</template>

<script lang="ts" setup>
import { computed, toRefs } from 'vue';
import { useI18n } from 'vue-i18n';
import type { NetworkParams } from '@/stores';
import type { TokenGroup } from '@extension-base/background/types/types';
import { cut } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

type PayeeProps = {
  step: number;
  fee: string;
  stakingCurrency: TokenGroup;
  stakingNetwork: NetworkParams;
  payoutAddress: string;
};

const props = withDefaults(defineProps<PayeeProps>(), {
  payoutAddress: '',
});

const emit = defineEmits<{
  'update:payoutAddress': [value: string];
}>();

const { step, fee, stakingCurrency, stakingNetwork, payoutAddress } = toRefs(props);

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const { n } = useI18n();

const payeeName = computed(() => stakingNetwork.value.payeeName);
const payeeCut = computed(() => cut(payeeName.value));
const asset = computed(() => stakingCurrency.value.symbol);
const addressCut = computed(() => cut(payoutAddress.value));
const accountNameCut = computed(() => cut(accountsStore.selectedWallet.name));
const stakingAssetPrice = computed(() => networksStore.getAssetPrice(stakingCurrency.value?.priceId ?? '').price);
const valueString = computed(() => {
  const value = Number(fee.value) * stakingAssetPrice.value;

  return `${accountsStore.fiatSymbol}${n(value, 'price')}`;
});

const setPayoutAddress = (value = '') => {
  emit('update:payoutAddress', value);
};
</script>

<style lang="scss" scoped>
.controller-account {
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  .info-fee {
    margin-top: 10px;
    margin-bottom: 20px;
  }

  .payout-account {
    margin-top: 10px;
  }

  .hint {
    margin: 15px 0;
  }

  .row {
    margin-left: 15px;
  }
}
</style>
