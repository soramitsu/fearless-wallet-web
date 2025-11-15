<template>
  <AboveForm
    :fullScreen="true"
    :showBackIcon="showBackIcon"
    :header="header"
    @handlerBack="handlerBack"
    @closeHandler="closeForm"
  >
    <div class="staking-management">
      <Scroll>
        <EditAddressBook
          v-if="showEditAddressBook"
          :network="network"
          :_address="newAddress"
          @toggleEditBook="toggleEditBook"
        />

        <HistoryBook
          v-else-if="showHistoryBook"
          :network="network"
          :assetId="stakingAssetId"
          @toggleHistoryBookVisibility="toggleHistoryBookVisibility"
          @setRecipient="setRecipient"
          @toggleEditBook="toggleEditBook"
        />

        <div v-else-if="showMyWallets">
          <WalletInfo
            v-for="({ name, address, ethereumAddress, isMobile }, index) in acountsEcosystem"
            :key="name + index"
            :name="name"
            :isSelected="getStatusWallet(address, ethereumAddress)"
            :isMobile="isMobile"
            :address="address"
            :showMenu="false"
            class="wallet"
            @setWallet="setWallet(address, ethereumAddress)"
          />
        </div>

        <template v-else>
          <div v-if="showWalletName" class="controller-description row" data-testid="controllerDescription">
            {{ $t('staking.separateAccountController') }}
          </div>

          <FInput
            v-if="showWalletName"
            :value="accountName"
            placeholder="accounts.account"
            size="big"
            data-testid="accountName"
            :readonly="true"
          />

          <SelectInput
            v-if="showAmountInput"
            class="amount-input"
            text="assets.amount"
            data-testid="inputAmount"
            :totalAmount="totalAmount"
            :value="amountValue"
            :asset="stakingAssetName"
            :assetId="stakingAssetId"
            :amount="amount"
            :showIcon="false"
            :readonly="isRedeem"
            @update:amount="updateAmount"
            @setMax="setMax"
          />

          <BondExtra v-if="isBondExtra" :stakingCurrency="stakingCurrency" :fee="fee" />

          <Unbond v-else-if="isUnbond" :stakingCurrency="stakingCurrency" :stakingNetwork="stakingNetwork" :fee="fee" />

          <WithdrawUnbonded v-else-if="isRedeem" :stakingCurrency="stakingCurrency" :fee="fee" />

          <Rebond v-else-if="isRebond" :stakingCurrency="stakingCurrency" :fee="fee" :amount="amount" />

          <ControllerAccount
            v-else-if="isControllerAccount"
            :step="step"
            :fee="fee"
            :network="network"
            :stakingNetwork="stakingNetwork"
            :stakingCurrency="stakingCurrency"
            :controllerAddress="controllerAddress"
            :isValidController="isValidController"
            @update:controllerAddress="updateControllerAddress"
          >
            <div class="activity-buttons">
              <BadgeButton text="assets.history" data-testid="historyBtn" @click="toggleHistoryBookVisibility" />

              <BadgeButton text="common.paste" data-testid="pasteBtn" @click="paste" />

              <BadgeButton
                v-if="showMyWalletsButton"
                text="assets.myWallets"
                data-testid="myWalletsBtn"
                @click="toggleMyWalletsVisibility"
              />
            </div>
          </ControllerAccount>

          <Payee
            v-else-if="isPayee"
            :step="step"
            :fee="fee"
            :network="network"
            :stakingNetwork="stakingNetwork"
            :stakingCurrency="stakingCurrency"
            :payoutAddress="payoutAddress"
            @update:payoutAddress="setPayoutAddress"
          >
            <div class="activity-buttons">
              <BadgeButton text="assets.history" data-testid="historyBtn" @click="toggleHistoryBookVisibility" />

              <BadgeButton text="common.paste" data-testid="pasteBtn" @click="paste" />

              <BadgeButton
                v-if="showMyWalletsButton"
                text="assets.myWallets"
                data-testid="myWalletsBtn"
                @click="toggleMyWalletsVisibility"
              />
            </div>
          </Payee>
        </template>
      </Scroll>

      <FButton
        v-if="showBtn"
        width="100%"
        size="big"
        fontSize="big"
        data-testid="confirmBtn"
        :text="btnText"
        :disabled="confirmBtnDisabled"
        @click="confirm"
      />
    </div>

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      :currency="stakingCurrency"
      :amount="amount"
      :value="amountValue"
      :fee="fee"
      :feeValue="feeValue"
      :firstIcon="stakingAssetId"
      :extrinsicType="type"
      :tx="tx"
      @close="confirmationPasswordPopupClose"
    />
  </AboveForm>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, toRefs, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkParams } from '@/stores';
import { type StakingOperation, type StakingOperationParams, WalletEcosystem } from '@/interfaces';
import WithdrawUnbonded from '@/screens/staking/myStake/stakingForms/WithdrawUnbonded.vue';
import Unbond from '@/screens/staking/myStake/stakingForms/Unbond.vue';
import Rebond from '@/screens/staking/myStake/stakingForms/Rebond.vue';
import BondExtra from '@/screens/staking/myStake/stakingForms/BondExtra.vue';
import ControllerAccount from '@/screens/staking/myStake/stakingForms/ControllerAccount.vue';
import Payee from '@/screens/staking/myStake/stakingForms/Payee.vue';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import { getCostOfAssets } from '@/helpers/transfers';
import { calcTransferableSendMinusFee, isValidAmountAsset } from '@/helpers/currencies';
import BaseApi from '@/util/BaseApi';
import { checkController, fetchBalance } from '@/extension/messaging';
import WalletInfo from '@/screens/main/WalletInfo.vue';
import EditAddressBook from '@/screens/wallet&asset/EditAddressBook.vue';
import HistoryBook from '@/screens/wallet&asset/HistoryBook.vue';
import { getClipboard } from '@/helpers';
import { useStakingStore } from '@/stores/staking';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{
  stakingCurrency: TokenGroup;
  rewardedCurrency: TokenGroup;
  stakingNetwork: NetworkParams;
  type: StakingOperation;
}>();

const emit = defineEmits<{
  closeForm: [];
}>();

const { stakingCurrency, stakingNetwork, type } = toRefs(props);

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const stakingStore = useStakingStore();
const { t } = useI18n();

const showConfirmationPasswordPopup = ref(false);
const showHistoryBook = ref(false);
const showMyWallets = ref(false);
const isValidController = ref(true);
const showEditAddressBook = ref(false);
const amount = ref('');
const stashBalance = ref('0');
const step = ref(1);
const controllerAddress = ref('');
const payoutAddress = ref('');
const newAddress = ref('');

const isBondExtra = computed(() => type.value === 'bondExtra');
const isUnbond = computed(() => type.value === 'unbond');
const isRedeem = computed(() => type.value === 'redeem');
const isRebond = computed(() => type.value === 'rebond');
const isControllerAccount = computed(() => type.value === 'setController');
const isPayee = computed(() => type.value === 'setPayee');

const network = computed(() => stakingNetwork.value.network);

const fee = computed(() => {
  const soraFees = networksStore.soraFees;

  if (!soraFees) return '';

  const {
    StakingBondExtra,
    StakingRebond,
    StakingUnbond,
    StakingSetController,
    StakingWithdrawUnbonded,
    StakingSetPayee,
  } = soraFees;

  if (isBondExtra.value) return StakingBondExtra;
  if (isUnbond.value) return StakingUnbond;
  if (isRebond.value) return StakingRebond;
  if (isRedeem.value) return StakingWithdrawUnbonded;
  if (isControllerAccount.value) return StakingSetController;
  if (isPayee.value) return StakingSetPayee;

  return '';
});

const showMyWalletsButton = computed(() => acountsEcosystem.value.length !== 0);
const showBtn = computed(() => !showHistoryBook.value && !showEditAddressBook.value && !showMyWallets.value);
const showBackIcon = computed(() => showMyWallets.value || showHistoryBook.value || showEditAddressBook.value);
const showAmountInput = computed(() => {
  if (isControllerAccount.value || isPayee.value) return false;

  return step.value === 1;
});

const header = computed(() => {
  if (showEditAddressBook.value) return 'assets.addContact';
  if (showHistoryBook.value) return 'assets.chooseFromHistory';
  if (showMyWallets.value) return 'assets.wallets';

  return `staking.${type.value}`;
});

const showWalletName = computed(() => {
  if (isControllerAccount.value || isPayee.value) return step.value === 2;

  return step.value === 1;
});

const acountsEcosystem = computed(() => {
  if (isPayee.value || isControllerAccount.value) return accountsStore.allAcountsEcosystem;

  return accountsStore.acountsEcosystem;
});

const isValidControllerAddress = computed(() => {
  if (!controllerAddress.value) return false;

  return BaseApi.validateAddress(controllerAddress.value, network.value);
});

const isValidPayoutAddress = computed(() => {
  if (!payoutAddress.value) return false;

  return BaseApi.validateAddress(payoutAddress.value, network.value);
});

const stakingAssetId = computed(() => stakingCurrency.value?.groupId);
const stakingAssetName = computed(() => stakingCurrency.value?.symbol);

const totalAmount = computed(() => {
  if (isUnbond.value) return stakingNetwork.value.activeStake;
  if (isRebond.value) return stakingNetwork.value.unbond.sum;
  if (isRedeem.value) return stakingNetwork.value.redeemAmount;

  return stakingNetwork.value.transferableAmount;
});

const stakingAssetPrice = computed(() => {
  const priceId = stakingCurrency.value?.priceId ?? '';

  return networksStore.getAssetPrice(priceId).price;
});

const feeValue = computed(() => getCostOfAssets(fee.value, stakingAssetPrice.value).toString());
const amountValue = computed(() => getCostOfAssets(amount.value, stakingAssetPrice.value).toString());
const accountName = computed(() => accountsStore.selectedWallet.name);

const btnText = computed(() => {
  if (isControllerAccount.value || isPayee.value) {
    if (step.value === 1) return 'common.edit';

    if (
      (controllerAddress.value && !isValidControllerAddress.value) ||
      (payoutAddress.value && !isValidPayoutAddress.value)
    )
      return t('accounts.invalidAccountAddress');
  }

  if (!isValidAmountAssetValue.value)
    return { text: 'assets.insufficientBalance', localeProps: { asset: (stakingAssetName.value ?? '').toUpperCase() } };

  return 'common.confirm';
});

const currencyByOperation = computed<TokenGroup | null>(() => {
  if (!stakingCurrency.value) return null;

  if (isRebond.value) {
    return {
      ...stakingCurrency.value,
      balances: stakingCurrency.value.balances.map((item) => ({
        ...item,
        transferable: stakingNetwork.value.unbond.sum,
      })),
    };
  }

  if (isUnbond.value) {
    return {
      ...stakingCurrency.value,
      balances: stakingCurrency.value.balances.map((item) => ({
        ...item,
        transferable: stakingNetwork.value.activeStake,
      })),
    };
  }

  return stakingCurrency.value;
});

const effectiveStashCurrency = computed<TokenGroup | null>(() => {
  if (!stakingCurrency.value) return null;

  if (!stakingNetwork.value.isController) return stakingCurrency.value;

  return {
    ...stakingCurrency.value,
    balances: stakingCurrency.value.balances.map((item) => ({
      ...item,
      transferable: stashBalance.value,
    })),
  };
});

const isValidAmountAssetValue = computed(() => {
  if (!stakingCurrency.value) return false;

  const operationCurrency = currencyByOperation.value;

  if (!operationCurrency) return false;

  const amountToValidate = amount.value || '0';
  const isValid = isValidAmountAsset(operationCurrency, network.value, '0', amountToValidate);

  if (!isValid) return false;

  const stakingCurrencyForFee = effectiveStashCurrency.value ?? stakingCurrency.value;
  const amountForFee = isBondExtra.value ? amount.value : '0';

  return isValidAmountAsset(stakingCurrencyForFee, network.value, fee.value ?? '0', amountForFee);
});

const confirmBtnDisabled = computed(() => {
  if (isControllerAccount.value) {
    if (step.value === 2)
      return !isValidController.value || !isValidControllerAddress.value || !isValidAmountAssetValue.value;

    return false;
  }

  if (isPayee.value) {
    if (step.value === 1) return false;

    return !isValidPayoutAddress.value;
  }

  if (!amount.value || Number(amount.value) === 0) return true;

  return !isValidAmountAssetValue.value;
});

const tx = computed<StakingOperationParams>(() => ({
  amount: amount.value,
  from: accountsStore.selectedWallet.address,
  networkName: network.value,
  controllerAddress: controllerAddress.value,
  payee: payoutAddress.value,
}));

watch(controllerAddress, async (value) => {
  if (!value) {
    isValidController.value = true;

    return;
  }

  isValidController.value = await checkController({ address: value });
});

onMounted(async () => {
  if (isRebond.value) {
    const unlocking = stakingNetwork.value.unbond.unlocking;
    const lastUnbond = unlocking[unlocking.length - 1]?.value ?? '0';

    amount.value = lastUnbond;
  } else if (isRedeem.value) {
    amount.value = stakingNetwork.value.redeemAmount;
  }

  if (stakingNetwork.value.isController) {
    const balances = await fetchBalance({
      address: stakingNetwork.value.stashAddress,
      networks: [stakingNetwork.value.network],
      walletEcosystem: WalletEcosystem.Substrate,
    });

    stashBalance.value = balances[0]?.balance ?? '0';
  }
});

const toggleEditBook = (address = '') => {
  showEditAddressBook.value = !showEditAddressBook.value;
  showHistoryBook.value = !showHistoryBook.value;
  newAddress.value = address;
};

const updateControllerAddress = (value: string) => {
  controllerAddress.value = value;
};

const handlerBack = () => {
  if (showHistoryBook.value) toggleHistoryBookVisibility();
  else if (showEditAddressBook.value) toggleEditBook();
  else if (showMyWallets.value) toggleMyWalletsVisibility();
};

const closeForm = () => {
  emit('closeForm');
};

const confirm = () => {
  if (isControllerAccount.value && step.value === 1) step.value += 1;
  else if (isPayee.value && step.value === 1) step.value += 1;
  else showConfirmationPasswordPopup.value = true;
};

const confirmationPasswordPopupClose = (closeFormModal: boolean) => {
  showConfirmationPasswordPopup.value = false;

  if (closeFormModal) {
    stakingStore.getMyStakingInfo({ network: network.value });
    closeForm();
  }
};

const updateAmount = (value: string) => {
  amount.value = value;
};

const calcTransferableSendMinusFeeValue = () => {
  return calcTransferableSendMinusFee(stakingCurrency.value, network.value, fee.value);
};

const setMax = () => {
  if (!stakingCurrency.value) return;

  if (isBondExtra.value) amount.value = calcTransferableSendMinusFeeValue();
  else if (isUnbond.value) amount.value = stakingNetwork.value.activeStake;
  else if (isRebond.value) amount.value = stakingNetwork.value.unbond.sum;
  else if (isRedeem.value) amount.value = stakingNetwork.value.redeemAmount;
};

const toggleHistoryBookVisibility = () => {
  showHistoryBook.value = !showHistoryBook.value;
};

const paste = () => {
  setRecipient(getClipboard());
};

const toggleMyWalletsVisibility = () => {
  showMyWallets.value = !showMyWallets.value;
};

const getStatusWallet = (address: string, ethereumAddress: string) => {
  const currentAddress = BaseApi.formatAddress({ address, ethereumAddress }, network.value);
  const currentRecipientAddress = BaseApi.formatAddress(
    { address: payoutAddress.value, ethereumAddress: payoutAddress.value },
    network.value
  );

  return currentAddress === currentRecipientAddress;
};

const setWallet = (address: string, ethereumAddress: string) => {
  const value = BaseApi.formatAddress({ address, ethereumAddress }, network.value);

  if (isPayee.value) payoutAddress.value = value;
  else if (isControllerAccount.value) controllerAddress.value = value;

  toggleMyWalletsVisibility();
};

const setPayoutAddress = (value = '') => {
  payoutAddress.value = value;
};

const setRecipient = (value = '') => {
  if (isControllerAccount.value) controllerAddress.value = value;
  else if (isPayee.value) payoutAddress.value = value;
};
</script>

<style lang="scss" scoped>
.staking-management {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .amount-input {
    margin-top: 10px;
  }

  .controller-description {
    font-size: 0.875em;
    text-align: left;
    color: $default-white;
    margin-bottom: 15px;
    margin-left: 15px;
  }

  .wallet {
    margin-bottom: 12px !important;
  }

  .activity-buttons {
    display: flex;
    user-select: none;
    margin-bottom: 15px;
  }
}
</style>
