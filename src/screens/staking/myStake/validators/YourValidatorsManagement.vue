<template>
  <AboveForm
    :fullScreen="true"
    :showBackIcon="showBackIcon"
    :header="header"
    @handlerBack="handlerBack"
    @closeHandler="closeForm"
  >
    <div class="your-validators">
      <ValidatorInfo
        v-if="showValidatorInfo"
        :validator="selectedValidator"
        :stakingNetwork="stakingNetwork"
        :stakingCurrency="stakingCurrency"
      />

      <YourValidators v-else-if="step === 1" :stakingNetwork="stakingNetwork" @openValidatorInfo="openValidatorInfo" />

      <div v-else-if="step === 6">
        <FInput
          :value="selectedAccountName"
          placeholder="accounts.account"
          size="big"
          data-testid="accountName"
          :readonly="true"
        />

        <InfoRow
          text="staking.selectedValidators"
          data-testid="selectedValidators"
          :value="`${selectedValidatorsLength} (${$t('common.max')} ${maxNominations})`"
          borderType="default"
        />

        <InfoRow
          text="assets.networkFee"
          data-testid="networkFee"
          :value="`${fee} ${stakingAssetName}`"
          :price="feeValueString"
          borderType="default"
          icon="info"
          :iconClasses="['network-fee']"
        />

        <Tooltip text="staking.stakingFee" target=".network-fee" placement="right" />
      </div>

      <SelectionValidatorsForm
        v-else
        :step="step"
        :validators="validators"
        :maxNominations="maxNominations"
        :stakingCurrency="stakingCurrency"
        :stakingNetwork="stakingNetwork"
        :selectedValidator="selectedValidator"
        @openValidatorList="openValidatorList"
        @updateSelectedValidators="updateSelectedValidators"
        @openValidatorInfo="openValidatorInfo"
      />

      <FButton
        v-if="showConfirmButton"
        size="big"
        fontSize="big"
        width="100%"
        data-testId="confirmBtn"
        :text="buttontext"
        :disabled="confirmBtnDisabled"
        @click="openSelectionValidatorsForm"
      />

      <ConfirmationPasswordPopup
        v-if="showConfirmationPasswordPopup"
        :currency="stakingCurrency"
        :firstIcon="stakingAssetId"
        :tx="tx"
        :fee="fee"
        :feeValue="feeValue"
        extrinsicType="nominate"
        @close="confirmationPasswordPopupClose"
      />
    </div>
  </AboveForm>
</template>

<script lang="ts" setup>
import { computed, reactive, ref, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FWValidatorInfoFull, RequestNominate } from '@extension-base/services/staking-service/types';
import type { NetworkParams } from '@/stores';
import type { TokenGroup } from '@extension-base/background/types/types';
import { type SelectionValidator, WalletEcosystem } from '@/interfaces';
import SelectionValidatorsForm from '@/screens/staking/myStake/validators/SelectionValidatorsForm.vue';
import YourValidators from '@/screens/staking/myStake/validators/YourValidators.vue';
import ValidatorInfo from '@/screens/staking/myStake/validators/ValidatorInfo.vue';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import { fetchBalance, getNominateNetworkFee } from '@/extension/messaging';
import { getCostOfAssets } from '@/helpers/transfers';
import { isValidAmountAsset } from '@/helpers/currencies';
import { useStakingStore } from '@/stores/staking';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{
  stakingNetwork: NetworkParams;
  stakingCurrency: TokenGroup;
}>();

const emit = defineEmits<{
  (_event: 'closeForm'): void;
}>();

const networksStore = useNetworksStore();
const stakingStore = useStakingStore();
const accountsStore = useAccountsStore();
const { n } = useI18n();

const state = reactive<Record<string, SelectionValidator>>({});
const showConfirmationPasswordPopup = ref(false);
const step = ref(1);
const isSuggested = ref(false);
const selectedValidator = ref<FWValidatorInfoFull | null>(null);
const fee = ref('0');
const stashBalance = ref('0');

const selectedAccountName = computed(() => accountsStore.selectedWallet.name);
const network = computed(() => props.stakingNetwork.network);
const stakingAssetName = computed(() => props.stakingCurrency.symbol);
const stakingAssetId = computed(() => props.stakingCurrency.groupId);
const stakingAssetPrice = computed(() => {
  const priceId = props.stakingCurrency?.priceId ?? '';

  return networksStore.getAssetPrice(priceId).price;
});

const feeValue = computed(() => getCostOfAssets(fee.value, stakingAssetPrice.value).toString());
const feeValueString = computed(() => `${accountsStore.fiatSymbol}${n(+feeValue.value, 'price')}`);

const validators = computed(() => Object.values(state));
const selectedValidators = computed(() =>
  Object.values(state)
    .filter(({ isSelect }) => isSelect)
    .map(({ address }) => address)
);
const selectedValidatorsLength = computed(() => selectedValidators.value.length);

const showValidatorInfo = computed(() => selectedValidator.value !== null);
const showConfirmButton = computed(() => step.value !== 2 && !showValidatorInfo.value);

const effectiveStakingCurrency = computed<TokenGroup>(() => {
  if (!props.stakingNetwork.isController) return props.stakingCurrency;

  return {
    ...props.stakingCurrency,
    balances: props.stakingCurrency.balances.map((item) => ({ ...item, transferable: stashBalance.value })),
  };
});

const isValidAmountAssetValue = computed(() =>
  isValidAmountAsset(effectiveStakingCurrency.value, props.stakingNetwork.network, fee.value ?? '0', '0')
);

const fullMatchValidators = computed(() => {
  if (props.stakingNetwork.myValidators.length === 0) return false;

  return props.stakingNetwork.myValidators.every(({ address }) =>
    selectedValidators.value.some((_address) => address === _address)
  );
});

const confirmBtnDisabled = computed(() => {
  if (step.value === 4 || step.value === 5) {
    return selectedValidatorsLength.value === 0 || fullMatchValidators.value;
  }

  if (step.value === 6) return !isValidAmountAssetValue.value;

  return false;
});

const buttontext = computed(() => {
  if (step.value === 1) return 'common.edit';

  if (step.value === 4 || step.value === 5) {
    if (fullMatchValidators.value) return 'staking.validatorsAlreadyNominated';
  }

  if (step.value === 6 && !isValidAmountAssetValue.value) {
    return { text: 'assets.insufficientBalance', localeProps: { asset: stakingAssetName.value.toUpperCase() } };
  }

  return 'common.confirm';
});

const showBackIcon = computed(() => step.value !== 1 || showValidatorInfo.value);

const header = computed(() => {
  if (showValidatorInfo.value) return 'staking.validatorInfo';
  if (step.value === 1) return 'staking.yourValidators';
  if (step.value === 2) return 'staking.validators';
  if (step.value === 3) return 'common.warning';
  if (step.value === 4) return 'staking.recommended';
  if (step.value === 5) return 'staking.yourself';
  if (step.value === 6) return 'common.confirmation';

  return '';
});

const maxNominations = computed(() => {
  const max = props.stakingNetwork.maxNominations;

  return validators.value.length < max ? validators.value.length : max;
});

const selectedAccountAddress = computed(() => accountsStore.selectedWallet.address);

const tx = computed<RequestNominate>(() => ({
  from: selectedAccountAddress.value,
  networkName: network.value,
  validators: selectedValidators.value,
}));

watch(selectedValidators, async (validatorsAddresses) => {
  fee.value = await getNominateNetworkFee({ validators: validatorsAddresses, network: network.value });
});

onMounted(async () => {
  const isSlashed = false;
  const limitValidatorsIdentity = false;

  props.stakingNetwork.validators.forEach((info) => {
    state[info.address] = {
      ...info,
      isSlashed,
      limitValidatorsIdentity,
      isSelect: false,
    };
  });

  if (props.stakingNetwork.isController) {
    const balances = await fetchBalance({
      address: props.stakingNetwork.stashAddress,
      networks: [props.stakingNetwork.network],
      walletEcosystem: WalletEcosystem.Substrate,
    });

    stashBalance.value = balances[0]?.balance ?? '0';
  }
});

const closeForm = () => {
  emit('closeForm');
};

const confirmationPasswordPopupClose = (shouldCloseForm: boolean) => {
  showConfirmationPasswordPopup.value = false;

  if (shouldCloseForm) {
    stakingStore.getMyStakingInfo({ network: network.value });
    closeForm();
  }
};

const openValidatorList = (suggested = false) => {
  validators.value.forEach((validator, index) => {
    state[validator.address].isSelect = suggested && index < maxNominations.value;
  });

  isSuggested.value = suggested;
  step.value = suggested ? 3 : 5;
};

const updateSelectedValidators = (value: boolean, address: string) => {
  state[address].isSelect = value;
};

const openSelectionValidatorsForm = () => {
  if (step.value === 4) step.value += 1;

  if (step.value === 6) {
    showConfirmationPasswordPopup.value = true;
  } else {
    step.value += 1;
  }
};

const openValidatorInfo = (validator: FWValidatorInfoFull) => {
  selectedValidator.value = validator;
};

const handlerBack = () => {
  if (showValidatorInfo.value) {
    selectedValidator.value = null;

    return;
  }

  if (step.value === 6 && isSuggested.value) step.value -= 1;
  else if (step.value === 5) step.value -= 2;

  step.value -= 1;
};
</script>

<style lang="scss" scoped>
.your-validators {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
</style>
