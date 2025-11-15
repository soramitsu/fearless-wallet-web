<template>
  <AboveForm
    :fullScreen="true"
    :showBackIcon="showBackIcon"
    :header="header"
    @handlerBack="handlerBack"
    @closeHandler="closeForm"
  >
    <Scroll>
      <div class="bond-form">
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
          @setRecipient="setPayoutAddress"
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

        <div v-else>
          <template v-if="step === 1">
            <FInput
              :value="accountName"
              placeholder="accounts.account"
              size="big"
              data-testid="account"
              :readonly="true"
            />

            <SelectInput
              v-if="showAmountInput"
              class="amount-input"
              text="assets.amount"
              :totalAmount="transferableAmount"
              :value="amountValue"
              :asset="stakingAssetName"
              :assetId="stakingAssetId"
              :amount="amount"
              :showIcon="false"
              @update:amount="updateAmount"
              @setMax="setMax"
            />

            <Hint class="hint" iconName="notification" :text="textMinHint" />

            <InputWithIcon
              :value="payoutAddressCut"
              icon="close"
              placeholder="staking.payoutAccount"
              data-testid="payoutAccount"
              @click="setPayoutAddress"
            />

            <Hint class="hint" iconName="notification" text="staking.defaultPayout" />

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

            <InfoRow
              text="assets.networkFee"
              borderType="default"
              icon="info"
              :value="`${feeMax} ${stakingAssetName}`"
              :price="feeMaxValueString"
              :iconClasses="['staking-fee']"
            />
          </template>

          <SelectionValidatorsForm
            v-else-if="showSelectionValidatorsForm"
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

          <template v-if="step === 6">
            <div class="asset-logo">
              <Icon icon="asset-background" class="asset-background" :hover="false" />

              <AssetHighlightIcon
                :icon="stakingCurrency.icon"
                :shadowColor="stakingCurrency.color"
                class="asset-highlight"
              />
            </div>

            <ContentForm :height="200" :isStaticHeight="true" :bottomRightCorner="true">
              <InfoRow
                text="staking.selectedValidators"
                data-testid="selectedValidators"
                :value="`${selectedValidatorsLength} (${$t('common.max')} ${maxNominations})`"
                borderType="default"
              />

              <InfoRow
                text="assets.amount"
                data-testid="amount"
                :value="amountString"
                borderType="default"
                :price="amountValueString"
              />

              <InfoRow
                text="accounts.account"
                data-testid="account"
                :value="selectedAccountName"
                borderType="default"
              />

              <InfoRow
                text="assets.networkFee"
                borderType="default"
                icon="info"
                data-testid="networkFee"
                :value="`${fee} ${stakingAssetName}`"
                :price="feeValueString"
                :isIconPrepend="false"
                :iconClasses="['staking-fee']"
              />
            </ContentForm>
          </template>

          <template v-if="step === 1 || step === 6">
            <Tooltip text="staking.stakingFee" target=".staking-fee" placement="right" />
          </template>

          <template v-if="step === 6">
            <div class="descriptions-row" data-testid="descriptionRowStaked">
              <Icon icon="gift" class="icon" />

              <!-- TODO: staking Переделать, когда будут новые сети -->
              <div>
                {{ $t('staking.stakedTokens', { value: 6 + 'hours' }) }}
              </div>
            </div>

            <div class="descriptions-row" data-testid="descriptionRowUnstake">
              <Icon icon="information-rectangle" class="icon" />

              <div>
                {{ $t('staking.unstakeTokens', days) }}
              </div>
            </div>

            <div class="descriptions-row" data-testid="descriptionRowDisclaimers1">
              <Icon icon="wallet-remove" class="icon" />

              <div>
                {{ $t('staking.unstakingDisclaimers1') }}
              </div>
            </div>

            <div class="descriptions-row" data-testid="descriptionRowDisclaimers2">
              <Icon icon="logout" class="icon" />

              <div>
                {{ $t('staking.unstakingDisclaimers2') }}
              </div>
            </div>
          </template>
        </div>

        <FButton
          v-if="showBtn"
          width="100%"
          size="big"
          fontSize="big"
          :text="btnText"
          :disabled="confirmBtnDisabled"
          data-testid="confirmBtn"
          @click="confirm"
        />
      </div>
    </Scroll>

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      :currency="stakingCurrency"
      :amount="amount"
      :value="amountValue"
      :fee="fee"
      :feeValue="feeValue"
      :firstIcon="stakingAssetId"
      :tx="tx"
      extrinsicType="bond"
      @close="confirmationPasswordPopupClose"
    />
  </AboveForm>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref, toRefs, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { RequestBond, FWValidatorInfoFull } from '@extension-base/services/staking-service/types';
import type { NetworkParams } from '@/stores';
import type { SelectionValidator } from '@/interfaces';
import HistoryBook from '@/screens/wallet&asset/HistoryBook.vue';
import SelectionValidatorsForm from '@/screens/staking/myStake/validators/SelectionValidatorsForm.vue';
import { getBondAndNominateNetworkFee } from '@/extension/messaging';
import { calcTransferableSendMinusFee, getUtilityAsset, isValidAmountAsset } from '@/helpers/currencies';
import { getCostOfAssets } from '@/helpers/transfers';
import BaseApi from '@/util/BaseApi';
import { cut, getClipboard, findTokenBalanceByNetwork } from '@/helpers';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import EditAddressBook from '@/screens/wallet&asset/EditAddressBook.vue';
import WalletInfo from '@/screens/main/WalletInfo.vue';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{
  stakingNetwork: NetworkParams;
}>();

const emit = defineEmits<{
  closeBond: [value: null, updated?: boolean];
}>();

const { stakingNetwork } = toRefs(props);

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();
const { n } = useI18n();

const state = reactive<Record<string, SelectionValidator>>({});
const selectedValidator = ref<FWValidatorInfoFull | null>(null);
const payoutAddress = ref('');
const step = ref(1);
const isSuggested = ref(false);
const showConfirmationPasswordPopup = ref(false);
const showHistoryBook = ref(false);
const showMyWallets = ref(false);
const showEditAddressBook = ref(false);
const fee = ref('');
const feeMax = ref('');
const amount = ref('');
const newAddress = ref('');

const network = computed(() => stakingNetwork.value.network);

const stakingAssetId = computed(() => {
  if (accountsStore.balances.length === 0) return '';

  const { groupId } = getUtilityAsset(accountsStore.balances, network.value);

  return groupId;
});

const stakingCurrency = computed(() => accountsStore.balances.find(({ groupId }) => groupId === stakingAssetId.value));

const accountName = computed(() => accountsStore.selectedWallet.name);

const acountsEcosystem = computed(() => accountsStore.acountsEcosystem);

const showMyWalletsButton = computed(() => acountsEcosystem.value.length !== 0);

const stakingCurrencyBalance = computed(() => findTokenBalanceByNetwork(stakingCurrency.value, network.value));

const stakingAssetName = computed(() => stakingCurrency.value?.symbol ?? '');

const stakingAssetPrice = computed(() => {
  const priceId = stakingCurrency.value?.priceId ?? '';

  return networksStore.getAssetPrice(priceId).price;
});

const transferableAmount = computed(() => Number(stakingCurrencyBalance.value?.transferable ?? 0));

const feeValue = computed(() => getCostOfAssets(fee.value, stakingAssetPrice.value).toString());
const amountValue = computed(() => getCostOfAssets(amount.value, stakingAssetPrice.value).toString());

const textMinHint = computed(() => ({
  text: 'staking.minimumStake',
  localeProps: {
    value: stakingNetwork.value.minBond,
    asset: stakingAssetName.value.toUpperCase(),
  },
}));

const payoutAddressCut = computed(() => cut(payoutAddress.value));

const validators = computed(() => Object.values(state));

const selectedValidators = computed(() =>
  Object.values(state)
    .filter(({ isSelect }) => isSelect)
    .map(({ address }) => address)
);

const selectedValidatorsLength = computed(() => selectedValidators.value.length);

const days = computed(() => ({ value: stakingNetwork.value.unbondPeriod }));

const maxNominations = computed(() => {
  const max = stakingNetwork.value.maxNominations;

  return validators.value.length < max ? validators.value.length : max;
});

const showBtn = computed(() => step.value !== 2 && !showHistoryBook.value && !showEditAddressBook.value);

const showAmountInput = computed(() => step.value === 1);

const header = computed(() => {
  if (showEditAddressBook.value) return 'assets.addContact';
  if (showHistoryBook.value) return 'assets.chooseFromHistory';
  if (showMyWallets.value) return 'assets.wallets';

  if (step.value === 1) return 'staking.bond';
  if (step.value === 2) return 'staking.validators';
  if (step.value === 3) return 'common.warning';
  if (step.value === 4) return 'staking.recommended';
  if (step.value === 5) return 'staking.yourself';
  if (step.value === 6) return 'common.confirmation';

  return '';
});

const showBackIcon = computed(
  () => step.value !== 1 || showMyWallets.value || showHistoryBook.value || showEditAddressBook.value
);

const showSelectionValidatorsForm = computed(() => step.value !== 1 && step.value !== 6);

const selectedAccountName = computed(() => accountsStore.selectedWallet.name);

const amountString = computed(() => `${amount.value} ${stakingAssetName.value.toUpperCase()}`);

const amountValueString = computed(
  () => `${accountsStore.fiatSymbol}${n(Number(amount.value) * stakingAssetPrice.value, 'price')}`
);

const feeMaxValueString = computed(
  () => `${accountsStore.fiatSymbol}${n(Number(feeMax.value) * stakingAssetPrice.value, 'price')}`
);

const feeValueString = computed(
  () => `${accountsStore.fiatSymbol}${n(Number(fee.value) * stakingAssetPrice.value, 'price')}`
);

const isValidPayoutAddress = computed(() => {
  if (!payoutAddress.value) return true;

  return BaseApi.validateAddress(payoutAddress.value, network.value);
});

const isValidAmountAssetValue = computed(() => {
  const currency = stakingCurrency.value;

  if (!currency) return false;

  return isValidAmountAsset(currency, network.value, fee.value ?? '0', amount.value);
});

const btnText = computed(() => {
  if (step.value === 1) {
    if (transferableAmount.value === 0)
      return { text: 'assets.insufficientBalance', localeProps: { asset: stakingAssetName.value.toUpperCase() } };

    return 'common.next';
  }

  if (step.value === 3) return 'common.iAgree';

  return 'common.confirm';
});

const confirmBtnDisabled = computed(() => {
  if (step.value === 1)
    return !amount.value || Number(amount.value) === 0 || !isValidAmountAssetValue.value || !isValidPayoutAddress.value;

  if (step.value === 4 || step.value === 5) return selectedValidatorsLength.value === 0;

  return false;
});

const tx = computed<RequestBond>(() => ({
  amount: amount.value,
  from: accountsStore.selectedWallet.address,
  networkName: network.value,
  payoutAddress: payoutAddress.value,
  validators: selectedValidators.value,
}));

watch(selectedValidators, async () => {
  fee.value = await getBondAndNominateNetworkFee(tx.value);
});

onMounted(() => {
  const isSlashed = false;
  const limitValidatorsIdentity = false;

  stakingNetwork.value.validators.forEach((info) => {
    state[info.address] = {
      ...info,
      isSlashed,
      limitValidatorsIdentity,
      isSelect: false,
    } as SelectionValidator;
  });

  void getSoraFees();
});

const getSoraFees = async () => {
  feeMax.value = await getBondAndNominateNetworkFee({
    ...tx.value,
    validators: new Array(stakingNetwork.value.maxNominations),
  });
};

const openValidatorList = (suggested = false) => {
  validators.value.forEach((validator, index) => {
    if (state[validator.address]) {
      state[validator.address].isSelect = suggested && index < maxNominations.value;
    }
  });

  isSuggested.value = suggested;
  step.value = suggested ? 3 : 5;
};

const updateAmount = (value: string) => {
  amount.value = value;
};

const toggleEditBook = (address = '') => {
  showEditAddressBook.value = !showEditAddressBook.value;
  showHistoryBook.value = !showHistoryBook.value;
  newAddress.value = address;
};

const toggleHistoryBookVisibility = () => {
  showHistoryBook.value = !showHistoryBook.value;
};

const updateSelectedValidators = (value: boolean, address: string) => {
  if (state[address]) state[address].isSelect = value;
};

const openValidatorInfo = (validator: FWValidatorInfoFull) => {
  selectedValidator.value = validator;
};

const handlerBack = () => {
  if (showHistoryBook.value || showEditAddressBook.value || showMyWallets.value) {
    if (showHistoryBook.value) toggleHistoryBookVisibility();
    else if (showEditAddressBook.value) toggleEditBook();
    else if (showMyWallets.value) toggleMyWalletsVisibility();

    return;
  }

  if (step.value === 6 && isSuggested.value) step.value -= 1;
  else if (step.value === 5) step.value -= 2;

  step.value -= 1;
};

const closeForm = (updated = false) => {
  emit('closeBond', null, updated);
};

const confirmationPasswordPopupClose = (closeFormModal: boolean) => {
  showConfirmationPasswordPopup.value = false;

  if (closeFormModal) closeForm(true);
};

const confirm = () => {
  if (step.value === 4) step.value += 1;

  if (step.value === 6) showConfirmationPasswordPopup.value = true;
  else step.value += 1;
};

const calcTransferableSendMinusFeeValue = () => {
  if (!stakingCurrency.value) return '0';

  return calcTransferableSendMinusFee(stakingCurrency.value, network.value, feeMax.value);
};

const setPayoutAddress = (address = '') => {
  payoutAddress.value = address;
};

const setMax = () => {
  if (!stakingCurrency.value) return;

  amount.value = calcTransferableSendMinusFeeValue();
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
  payoutAddress.value = BaseApi.formatAddress({ address, ethereumAddress }, network.value);

  toggleMyWalletsVisibility();
};

const paste = () => {
  setPayoutAddress(getClipboard());
};
</script>

<style lang="scss" scoped>
.bond-form {
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: space-between;

  .hint {
    padding: $default-padding;
  }

  .activity-buttons {
    display: flex;
    user-select: none;
    margin-bottom: 5px;
  }

  .amount-input {
    margin-top: 10px;
  }

  .descriptions-row {
    display: flex;
    align-items: center;
    color: $default-white;
    text-align: left;
    line-height: 20px;
    margin: 20px 16px 16px;
    font-size: 0.875em;

    .icon {
      margin-right: 10px;
      max-width: 20px;
      height: 20px;
    }
  }

  .asset-logo {
    display: flex;
    align-items: center;
    margin-bottom: 30px;
    height: 200px;

    .asset-background {
      position: relative;
      height: 200px;
      left: 115px;
    }

    .asset-highlight {
      position: relative;
      left: -83px;
    }
  }

  .wallet {
    margin-bottom: 12px !important;
  }
}
</style>
