<template>
  <AboveForm
    :fullScreen="true"
    :showBackIcon="showBackIcon"
    :header="header"
    @handlerBack="handlerBack"
    @closeHandler="closeForm"
  >
    <div class="pending-rewards">
      <div>
        <ContentForm v-if="step === 1" :height="380" :isStaticHeight="true" :bottomRightCorner="true">
          <Loader v-if="showLoader" />

          <div v-show="!showLoader" class="form-layout">
            <Scroll>
              <div class="descriptions" data-testid="validatorsPayoutRewards">
                {{ $t('staking.validatorsPayoutRewards') }}
              </div>

              <ValidatorItem
                v-for="validator in myRewards"
                :key="validator.address"
                :validator="validator"
                :rewardedCurrency="rewardedCurrency"
                @openValidatorInfo="handleOpenValidatorInfo"
              />
            </Scroll>
          </div>
        </ContentForm>

        <div v-else-if="step === 2">
          <FInput
            :value="selectedAccountName"
            placeholder="accounts.account"
            data-testid="account"
            size="big"
            :readonly="true"
          />

          <SelectInput
            class="amount-input"
            text="assets.amount"
            :value="summaryRewardsValue"
            :asset="rewardedAssetName"
            :assetId="rewardedAssetId"
            :amount="summaryRewards"
            :showBalance="false"
            :readonly="true"
          />

          <FInput
            :value="payeeName"
            :readonly="true"
            placeholder="staking.setPayee"
            data-testid="setPayee"
            size="big"
          />
        </div>

        <InfoRow
          text="assets.networkFee"
          :value="`${fee} ${stakingAssetName}`"
          :price="feeValueString"
          borderType="default"
          icon="info"
          :iconClasses="['network-fee']"
        />

        <Tooltip text="staking.stakingFee" target=".network-fee" placement="right" />
      </div>

      <FButton
        width="100%"
        size="big"
        fontSize="big"
        data-testid="confirmBtn"
        :disabled="disabledBtn"
        :text="btnText"
        @click="confirm"
      />
    </div>

    <WarningPopup v-if="showWarningPopup" :handlerAccept="handlerAccept" :handlerClose="closeWarningPopup" />

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      :currency="stakingCurrency"
      :amount="summaryRewards"
      :value="summaryRewardsValue"
      :fee="feeValue"
      :feeValue="feeValue"
      :payout="summaryRewards"
      :firstIcon="stakingAssetId"
      :tx="tx"
      extrinsicType="payoutRewards"
      @close="confirmationPasswordPopupClose"
    />
  </AboveForm>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import type { PayoutRewards, RewardsResponse } from '@extension-base/services/staking-service/types';
import type { NetworkParams } from '@/stores';
import type { TokenGroup } from '@extension-base/background/types/types';
import { FPNumber } from '@/lib/fpNumber';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import { getCostOfAssets } from '@/helpers/transfers';
import ValidatorItem from '@/screens/staking/myStake/rewards/ValidatorItem.vue';
import WarningPopup from '@/screens/staking/myStake/rewards/WarningPopup.vue';
import { getPayoutsFee, fetchBalance, getRewards } from '@/extension/messaging';
import { isValidAmountAsset } from '@/helpers/currencies';
import { useStakingStore } from '@/stores/staking';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { WalletEcosystem } from '@/interfaces';

type PendingRewardFormProps = {
  stakingCurrency: TokenGroup;
  rewardedCurrency: TokenGroup;
  stakingNetwork: NetworkParams;
};

const props = defineProps<PendingRewardFormProps>();
const emit = defineEmits<{
  closeForm: [];
  openValidatorInfo: [validator: unknown];
}>();

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const stakingStore = useStakingStore();

const showConfirmationPasswordPopup = ref(false);
const showWarningPopup = ref(false);
const step = ref(1);
const fee = ref('');
const stashBalance = ref('0');
const showLoader = ref(false);
const rewards = ref<RewardsResponse>({ validators: [], payouts: [], sum: '0' });

const network = computed(() => props.stakingNetwork.network);
const selectedAccountName = computed(() => accountsStore.selectedWallet.name);

const stakingAssetId = computed(() => props.stakingCurrency.groupId);
const rewardedAssetId = computed(() => props.rewardedCurrency.groupId);
const stakingAssetName = computed(() => props.stakingCurrency.symbol);
const rewardedAssetName = computed(() => props.rewardedCurrency.symbol);
const stakingAssetPrice = computed(() => networksStore.getAssetPrice(props.stakingCurrency.priceId ?? '').price);
const rewardedAssetPrice = computed(() => networksStore.getAssetPrice(props.rewardedCurrency.priceId ?? '').price);

const feeValue = computed(() => getCostOfAssets(fee.value, stakingAssetPrice.value).toString());
const summaryRewards = computed(() => rewards.value.sum);
const summaryRewardsValue = computed(() => getCostOfAssets(summaryRewards.value, rewardedAssetPrice.value).toString());

const myRewards = computed(() => rewards.value.validators);
const tx = computed<PayoutRewards>(() => ({
  payouts: rewards.value.payouts,
  from: accountsStore.selectedWallet.address,
  networkName: network.value,
}));

const feeValueString = computed(
  () => `${accountsStore.fiatSymbol}${Number(feeValue.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
);

const effectiveStakingCurrency = computed<TokenGroup>(() => {
  if (!props.stakingNetwork.isController) return props.stakingCurrency;

  return {
    ...props.stakingCurrency,
    balances: props.stakingCurrency.balances.map((item) => ({ ...item, transferable: stashBalance.value })),
  };
});

const isValidAmountAssetValue = computed(() =>
  isValidAmountAsset(effectiveStakingCurrency.value, network.value, fee.value ?? '0', '0')
);

const btnText = computed(() => {
  if (step.value === 1) return 'staking.payoutAll';

  if (!isValidAmountAssetValue.value) {
    return { text: 'assets.insufficientBalance', localeProps: { asset: stakingAssetName.value.toUpperCase() } };
  }

  return 'common.confirm';
});

const disabledBtn = computed(() => {
  if (step.value === 1) return myRewards.value.length === 0;

  return !isValidAmountAssetValue.value;
});

const showBackIcon = computed(() => step.value !== 1);

const header = computed(() => {
  if (step.value === 1) return 'staking.pendingRewards';
  if (step.value === 2) return 'common.confirmation';

  return '';
});

const getRewardsData = async () => {
  showLoader.value = true;

  rewards.value = await getRewards({
    address: props.stakingNetwork.stashAddress,
    network: network.value,
  });

  showLoader.value = false;
};

const getPayoutsFeeData = async () => {
  fee.value = await getPayoutsFee({ payouts: rewards.value.payouts, network: network.value });
};

onMounted(async () => {
  await getRewardsData();
  await getPayoutsFeeData();

  if (props.stakingNetwork.isController) {
    const balances = await fetchBalance({
      address: props.stakingNetwork.stashAddress,
      networks: [network.value],
      walletEcosystem: WalletEcosystem.Substrate,
    });

    stashBalance.value = balances[0]?.balance ?? '0';
  }
});

const closeForm = () => {
  emit('closeForm');
};

const confirmationPasswordPopupClose = (closeFormModal: boolean) => {
  showConfirmationPasswordPopup.value = false;

  if (closeFormModal) {
    stakingStore.getMyStakingInfo({ network: network.value });
    closeForm();
  }
};

const handlerBack = () => {
  step.value -= 1;
};

const handlerAccept = () => {
  step.value = 2;
  closeWarningPopup();
  showConfirmationPasswordPopup.value = true;
};

const closeWarningPopup = () => {
  showWarningPopup.value = false;
};

const confirm = () => {
  if (step.value === 2) {
    const rewardLessFee = FPNumber.lte(new FPNumber(summaryRewardsValue.value), new FPNumber(feeValue.value));

    if (rewardLessFee) showWarningPopup.value = true;
    else showConfirmationPasswordPopup.value = true;
  } else {
    step.value += 1;
  }
};
</script>

<style lang="scss" scoped>
.pending-rewards {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .descriptions {
    font-size: 0.875em;
    color: $default-white;
    text-align: left;
    margin-bottom: 5px;
  }

  .form-layout {
    height: 100%;
    padding: $default-padding;
  }

  .amount-input {
    margin: 10px 0;
  }
}
</style>
