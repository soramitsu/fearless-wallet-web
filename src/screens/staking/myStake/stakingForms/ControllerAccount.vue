<template>
  <div class="controller-account">
    <template v-if="step === 1">
      <InfoRow
        text="staking.stashAccount"
        data-testid="stashAccount"
        borderType="default"
        :value="accountName"
        :hideLastBorder="false"
      />

      <InfoRow
        text="staking.setController"
        data-testid="controllerAccount"
        borderType="default"
        :value="controllerCut"
        :hideLastBorder="false"
      />
    </template>

    <template v-else>
      <Hint text="staking.stashBond" iconName="notification" class="hint row" />

      <InputWithIcon
        :value="addressCut"
        icon="close"
        placeholder="staking.setController"
        data-testid="controllerAccountInput"
        @click="setControllerAddress"
      />

      <Alert
        v-if="!isValidController"
        message="staking.alreadyControlling"
        sizeText="small"
        class="already-controlling"
      />

      <slot></slot>

      <Hint text="staking.controllerUnbond" iconName="notification" class="hint row" />
    </template>

    <InfoRow
      v-show="step !== 1"
      class="info-fee"
      text="assets.networkFee"
      borderType="default"
      icon="info"
      data-testid="networkFee"
      :value="`${fee} ${asset}`"
      :price="valueString"
      :hideLastBorder="false"
      :iconClasses="['network-fee']"
    />

    <Tooltip text="staking.stakingFee" target=".network-fee" placement="right" />
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

type ControllerAccountProps = {
  step: number;
  fee: string;
  stakingCurrency: TokenGroup;
  stakingNetwork: NetworkParams;
  isValidController: boolean;
  controllerAddress: string;
};

const props = withDefaults(defineProps<ControllerAccountProps>(), {
  controllerAddress: '',
});

const emit = defineEmits<{
  'update:controllerAddress': [value: string];
}>();

const { step, fee, stakingCurrency, stakingNetwork, isValidController, controllerAddress } = toRefs(props);

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const { n } = useI18n();

const controllerName = computed(() => stakingNetwork.value.controllerName);
const controllerCut = computed(() => cut(controllerName.value));
const asset = computed(() => stakingCurrency.value.symbol);
const addressCut = computed(() => cut(controllerAddress.value));
const accountName = computed(() => cut(stakingNetwork.value.stashName));
const stakingAssetPrice = computed(() => networksStore.getAssetPrice(stakingCurrency.value?.priceId ?? '').price);
const valueString = computed(() => {
  const value = Number(fee.value) * stakingAssetPrice.value;

  return `${accountsStore.fiatSymbol}${n(value, 'price')}`;
});

const setControllerAddress = (value = '') => {
  emit('update:controllerAddress', value);
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

  .hint {
    margin: 15px 0;
  }

  .row {
    margin-left: 15px;
  }

  .already-controlling {
    margin: 10px 0;
  }
}
</style>
