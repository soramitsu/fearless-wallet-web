<template>
  <div>
    <AboveForm
      :header="formHeader"
      :fullScreen="true"
      :showBackIcon="showBackIcon"
      @handlerBack="handlerBack"
      @closeHandler="handleClose"
    >
      <Scroll>
        <EditAddressBook
          v-if="showEditAddressBook"
          :network="targetNetwork"
          :_address="newAddress"
          @toggleEditBook="toggleEditBook"
        />

        <HistoryBook
          v-else-if="showHistoryBook"
          :network="targetNetwork"
          :assetId="syncedAssetId"
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

        <div v-else class="transfer-form">
          <div>
            <template v-if="step === 1">
              <InputWithIcon
                v-if="isTransfer"
                :value="syncedNetwork"
                class="row"
                icon="rotate"
                :placeholder="placeholderNetwork"
                :isActiveRotate="showSelectNetworkPopup"
                data-testid="transferNetwork"
                @click="toggleValue('showSelectNetworkPopup')"
              />

              <FInput
                v-else
                :value="syncedNetwork"
                class="row"
                size="big"
                :placeholder="placeholderNetwork"
                :readonly="true"
                data-testid="network"
              />

              <SelectInput
                class="row"
                text="assets.amount"
                :totalAmount="transferableAmount"
                :value="syncedValue"
                :asset="sendAssetName"
                :assetId="syncedAssetId"
                :amount="syncedAmount"
                :isRotate="showSelectedAssetPopup"
                @update:amount="updateAmount"
                @setMax="setMax"
                @togglePopupVisibility="toggleValue('showSelectedAssetPopup')"
              />

              <InputWithIcon
                v-if="isCrossChain"
                :value="syncedDestNet"
                class="row"
                icon="rotate"
                placeholder="assets.destNet"
                data-testid="destNet"
                :isActiveRotate="showDestNetPopup"
                @click="toggleValue('showDestNetPopup')"
              />

              <InputWithIcon
                :value="recipientCut"
                class="row"
                icon="close"
                placeholder="assets.sendTo"
                data-testid="sendToInput"
                @click="setRecipient"
              />

              <div class="activity-buttons row">
                <BadgeButton text="assets.history" data-testid="historyBtn" @click="toggleHistoryBookVisibility" />

                <BadgeButton text="common.paste" data-testid="pasteBtn" @click="paste" />

                <BadgeButton
                  v-if="showMyWalletsButton"
                  text="assets.myWallets"
                  data-testid="myWalletsBtn"
                  @click="toggleMyWalletsVisibility"
                />
              </div>

              <Alert v-if="isScamAddress" :message="scamMessage" headerText="common.warning" />

              <Alert v-if="crossChainValidationError" headerText="common.warning">
                {{ crossChainValidationError }}
              </Alert>

              <slot name="step1Warning"></slot>

              <InfoRow
                :text="`assets.${isTransfer ? 'networkFee' : 'originalNetworkFee'}`"
                :value="syncedFeeCut"
                :price="fiatFeeCut"
                :iconClasses="['origin-fee']"
                :isLoading="isFetchingFees"
                icon="info"
              />

              <InfoRow
                v-if="isCrossChain"
                text="assets.crossChainFee"
                :value="destNetFeeCut"
                :price="destNetFiatFeeCut"
                :iconClasses="['cross-chain-fee']"
                icon="info"
              />

              <Tooltip text="assets.feeDescription" target=".origin-fee" placement="right" />
              <Tooltip text="assets.feeDescription" target=".cross-chain-fee" placement="right" />
            </template>

            <slot name="step2" v-else-if="step === 2"></slot>
          </div>

          <FButton
            size="big"
            class="button"
            :disabled="buttonDisabled"
            :iconName="isFetchingFees ? 'loader' : ''"
            :iconType="isFetchingFees ? 'loading' : ''"
            :text="isFetchingFees ? '' : buttonText"
            data-testid="continueBtn"
            @click="handlerContinueButton"
          />
        </div>
      </Scroll>
    </AboveForm>

    <SelectPopup
      v-if="showSelectPopup"
      :placeholder="placeholderSelectPopup"
      verticalPlacement="top"
      class="transfer-select-popup"
      :value="selectPopupValue"
      :showBlur="false"
      :showBackground="false"
      :top="top"
      :left="left"
      :height="285"
      :options="options"
      @handlerFilter="handlerFilter"
      @toggleValue="toggleSelectedNetwork"
      @handlerClose="handlerCloseSelectPopup"
    />

    <ConfirmationPasswordPopup
      v-if="showConfirmationPasswordPopup"
      :currency="currency"
      :amount="syncedAmount"
      :value="syncedValue"
      :firstIcon="firstIcon"
      :secondIcon="syncedDestNet"
      :extrinsicType="extrinsicType"
      :tx="tx"
      @close="confirmationPasswordPopupClose"
    />

    <ExistentialPopup
      v-if="showExistentialPopup"
      @handlerClose="handlerCloseExistentialPopup"
      @handlerAccept="handlerAcceptExistentialPopup"
    />

    <WarningAddressPopup
      v-if="!isValidAddressByNetwork"
      @handlerAccept="formatAddress"
      @handlerClose="handlerCloseWarningAddressPopup"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch, nextTick, getCurrentInstance, onBeforeUnmount, toRef } from 'vue';
import { getNativeAssetName, getSubstrateEvmAssetName } from '@extension-base/background/handlers/utils';
import { TransferErrorCode } from '@extension-base/background/types/types';
import { Reasons, type ScamInfo } from '@extension-base/services/scam-service/types';
import { getBalanceNetworkName } from '@extension-base/api/evm/types';
import ConfirmationPasswordPopup from './ConfirmationPasswordPopup.vue';
import ExistentialPopup from './ExistentialPopup.vue';
import WarningAddressPopup from './WarningAddressPopup.vue';
import type {
  RequestCheckTransfer,
  RequestCheckCrossChain,
  ResponseCheckTransfer,
  ResponseCheckCrossChain,
} from '@extension-base/background/types/types';
import { FPNumber } from '@/lib/fpNumber';
import EditAddressBook from '@/screens/wallet&asset/EditAddressBook.vue';
import HistoryBook from '@/screens/wallet&asset/HistoryBook.vue';
import BaseApi from '@/util/BaseApi';
import {
  getCurrencyOptions,
  calcTransferableSendMinusFee,
  isValidAmountAsset,
  getUtilityAsset,
} from '@/helpers/currencies';
import {
  balanceMatchesNetwork,
  cut,
  findTokenBalanceByNetwork,
  getClipboard,
  isSameString,
  isTonNetwork as isTonNetworkHelper,
} from '@/helpers';
import { VALID_SUBSTRATE_ADDRESS, VALID_ETHEREUM_ADDRESS, CHAIN_IDS } from '@/consts/networks';
import { getCostOfAssets, getTransactionAddress } from '@/helpers/transfers';
import { checkTransfer, checkCrossChain, checkScamAddress } from '@/extension/messaging';
import WalletInfo from '@/screens/main/WalletInfo.vue';
import { IS_POPUP } from '@/consts/globalClient';
import { IS_EXTENSION } from '@/consts/global';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

type Option = { name: string; value: string; icon: string | undefined };

defineOptions({ name: 'TransferForm' });

interface TransferFormProps {
  header: string;
  extrinsicType: 'transfer' | 'crossChain';
  isDisableBtn?: boolean;
  recipient?: string;
  assetId?: string;
  selectedNetwork?: string;
  destinationNetwork?: string;
  amount?: string;
  value?: string;
  partialFee?: string;
  destNetFee?: string;
}

const props = withDefaults(defineProps<TransferFormProps>(), {
  isDisableBtn: false,
  recipient: '',
  assetId: '',
  selectedNetwork: '',
  destinationNetwork: '',
  amount: '',
  value: '',
  partialFee: '',
  destNetFee: '0',
});

type TransferFormEmits = {
  (event: 'closeForm'): void;
  (event: 'update:recipient', value: string): void;
  (event: 'update:assetId', value: string): void;
  (event: 'update:selectedNetwork', value: string): void;
  (event: 'update:destinationNetwork', value: string): void;
  (event: 'update:amount', value: string): void;
  (event: 'update:value', value: string): void;
  (event: 'update:partialFee', value: string): void;
  (event: 'update:destNetFee', value: string): void;
};

const emit = defineEmits<TransferFormEmits>();

const handleClose = () => emit('closeForm');

const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();

const showSelectedAssetPopup = ref(false);
const showSelectNetworkPopup = ref(false);
const showDestNetPopup = ref(false);
const showExistentialPopup = ref(false);
const showConfirmationPasswordPopup = ref(false);
const showMyWallets = ref(false);
const showHistoryBook = ref(false);
const showEditAddressBook = ref(false);
const newAddress = ref('');
const filterValue = ref('');
const isFetchingFees = ref(false);
const estimateFeeError = ref(false);
const isScamAddress = ref(false);
const scamInfo = ref<ScamInfo | null>(null);
const crossChainValidationError = ref<string | null>(null);
const step = ref(1);

let timeoutSubscription: ReturnType<typeof setTimeout> | undefined;
let timeoutSetMax: ReturnType<typeof setTimeout> | undefined;

const vm = getCurrentInstance();
const n = vm?.proxy?.$n?.bind(vm.proxy);

const syncedRecipient = computed<string>({
  get: () => props.recipient,
  set: (value) => emit('update:recipient', value),
});
const syncedAssetId = computed<string>({
  get: () => props.assetId,
  set: (value) => emit('update:assetId', value),
});
const syncedNetwork = computed<string>({
  get: () => props.selectedNetwork,
  set: (value) => emit('update:selectedNetwork', value),
});
const syncedDestNet = computed<string>({
  get: () => props.destinationNetwork,
  set: (value) => emit('update:destinationNetwork', value),
});
const syncedAmount = computed<string>({
  get: () => props.amount,
  set: (value) => emit('update:amount', value),
});
const syncedValue = computed<string>({
  get: () => props.value,
  set: (value) => emit('update:value', value),
});
const syncedFee = computed<string>({
  get: () => props.partialFee,
  set: (value) => emit('update:partialFee', value),
});
const syncedDestNetFee = computed<string>({
  get: () => props.destNetFee,
  set: (value) => emit('update:destNetFee', value),
});

const togglesMap = {
  showSelectedAssetPopup,
  showSelectNetworkPopup,
  showDestNetPopup,
  showEditAddressBook,
} as const;

const toggleValue = (key: keyof typeof togglesMap) => {
  const target = togglesMap[key];
  target.value = !target.value;
};

const extrinsicType = toRef(props, 'extrinsicType');
const isTransfer = computed(() => extrinsicType.value === 'transfer');
const isCrossChain = computed(() => extrinsicType.value === 'crossChain');

const targetNetwork = computed(() => (isTransfer.value ? syncedNetwork.value : syncedDestNet.value));

const formHeader = computed(() => {
  if (showEditAddressBook.value) return 'assets.addContact';
  if (showHistoryBook.value) return 'assets.chooseFromHistory';
  if (showMyWallets.value) return 'assets.wallets';

  return props.header;
});

const isTonNetwork = computed(() => isTonNetworkHelper(syncedNetwork.value));

const currency = computed(() =>
  accountsStore.balances?.find(({ balances }) => balances.some((el) => isSameString(el.id, syncedAssetId.value)))
);
const currencyBalance = computed(() => findTokenBalanceByNetwork(currency.value, syncedNetwork.value));

const originNet = computed(() => networksStore.getNetwork(syncedNetwork.value));
const originalUtilityId = computed(() => originNet.value?.assets?.[0]?.id ?? '');
const originalNetworkUtilityAsset = computed(() => {
  const current = accountsStore.balances.find(({ balances }) =>
    balances.some(({ id }) => id === originalUtilityId.value)
  );

  return current?.symbol ?? '';
});
const originalAssetPrice = computed(() => {
  const current = accountsStore.balances.find(({ balances }) =>
    balances.some(({ id }) => id === originalUtilityId.value)
  );
  const priceId = current?.priceId ?? '';

  return networksStore.getAssetPrice(priceId).price;
});

const assetPrice = computed(() => {
  const priceId = currency.value?.priceId ?? '';

  return networksStore.getAssetPrice(priceId).price;
});

const acountsEcosystem = computed(() => (isCrossChain.value ? accountsStore.accounts : accountsStore.acountsEcosystem));
const showMyWalletsButton = computed(() => acountsEcosystem.value.length !== 0);

const recipientCut = computed(() => cut(syncedRecipient.value));

const sendAssetName = computed(() => {
  const symbol = currency.value?.symbol;

  return symbol ? getNativeAssetName(symbol) : '';
});

const scamMessage = computed(() => {
  const reason = scamInfo.value?.reason;
  const key =
    reason === Reasons.Donation
      ? 'isDonationAddress'
      : reason === Reasons.Exchange
        ? 'isExchangeAddress'
        : reason === Reasons.Sanctions
          ? 'isSanctionsAddress'
          : 'isScamAddress';

  return {
    text: `assets.${key}`,
    localeProps: { asset: sendAssetName.value?.toUpperCase?.() ?? '' },
  };
});

const isSameAddress = computed(() => {
  if (isTonNetwork.value) {
    return isSameString(accountsStore.selectedWallet.address, syncedRecipient.value);
  }

  if (isCrossChain.value) return false;

  return BaseApi.isSameAddress(accountsStore.selectedWallet, syncedRecipient.value, syncedNetwork.value);
});

const isValidRecipientAddress = computed(() => {
  if (isSameAddress.value) return false;

  if (isTonNetwork.value) return true;

  if (syncedRecipient.value === '') return false;

  if (isCrossChain.value && syncedDestNet.value === '') return false;

  return BaseApi.validateAddress(syncedRecipient.value, targetNetwork.value);
});

const isValidAddressByNetwork = computed(() => {
  if (!isValidRecipientAddress.value || syncedNetwork.value === '') return true;

  return BaseApi.validateAddressByNetwork(syncedRecipient.value, targetNetwork.value);
});

const utilityAsset = computed(() => getUtilityAsset(accountsStore.balances, syncedNetwork.value));
const utilityAssetName = computed(() => utilityAsset.value?.symbol?.toLowerCase?.() ?? '');

const transferableAmount = computed(() => +(currencyBalance.value?.transferable ?? 0));

const showSelectPopup = computed(
  () => showSelectedAssetPopup.value || showSelectNetworkPopup.value || showDestNetPopup.value
);

const placeholderSelectPopup = computed(() =>
  showSelectedAssetPopup.value ? 'common.searchAmongAssets' : 'common.searchNetwork'
);
const placeholderNetwork = computed(() => (isTransfer.value ? 'assets.network' : 'assets.originNet'));

const top = computed(() => {
  if (!IS_EXTENSION) return 120;

  if (showSelectedAssetPopup.value) return 220;

  if (showSelectNetworkPopup.value) return 150;

  return IS_POPUP ? 42 : 332;
});

const left = computed(() => {
  if (!IS_EXTENSION) return 0;

  if (showSelectedAssetPopup.value || (showDestNetPopup.value && IS_POPUP)) return 160;

  return -160;
});

const selectPopupValue = computed(() => {
  if (showSelectedAssetPopup.value) return syncedAssetId.value;

  if (showSelectNetworkPopup.value) return syncedNetwork.value;

  return syncedDestNet.value;
});

const showBackIcon = computed(
  () => step.value === 2 || showHistoryBook.value || showMyWallets.value || showEditAddressBook.value
);

const firstIcon = computed(() => (isTransfer.value ? syncedAssetId.value : syncedNetwork.value));

const scamWatcher = async () => {
  if (isValidRecipientAddress.value && isValidAddressByNetwork.value) {
    const { value, info } = await checkScamAddress({
      address: syncedRecipient.value,
      network: targetNetwork.value,
    });

    isScamAddress.value = value;
    scamInfo.value = info ?? null;
  } else {
    isScamAddress.value = false;
    scamInfo.value = null;
  }
};

const optionsAssets = computed(() => {
  const networkInfo = networksStore.networks.find(
    ({ name }) => name.toLowerCase() === syncedNetwork.value.toLowerCase()
  );
  const relay = ((networkInfo?.parentId && CHAIN_IDS[networkInfo.parentId]) ?? syncedNetwork.value).toLowerCase();

  if (isTransfer.value) return getCurrencyOptions(accountsStore.balances);

  const xcm = networkInfo?.xcm;

  const balances = accountsStore.balances.filter(({ symbol, relayChain }) => {
    if (relayChain.toLowerCase() !== relay) return false;

    return xcm?.availableAssets.some(({ symbol: _symbol }) => {
      const assetName = getSubstrateEvmAssetName(_symbol, syncedNetwork.value);

      return isSameString(assetName, symbol);
    });
  });

  return getCurrencyOptions(balances);
});

const optionsNetworks = computed(() => {
  const walletBalance = currency.value?.balances ?? [];

  return walletBalance.flatMap((balance) => {
    const networkName = getBalanceNetworkName(balance);
    const network = networksStore.getNetwork(networkName);

    if (!network.active) return [];

    return [
      {
        name: network.name,
        value: network.name,
        icon: balance.icon,
      },
    ];
  });
});

const optionsDestNet = computed<Option[]>(() => {
  if (isTransfer.value || !sendAssetName.value) return [];

  const asset = getNativeAssetName(sendAssetName.value);
  const destinations = originNet.value?.xcm?.availableDestinations ?? [];

  return destinations.flatMap(({ assets, chainId }) => {
    if (!assets.some(({ symbol }) => symbol.toLowerCase() === asset)) return [];

    const { name, icon } = networksStore.getNetwork(chainId);

    return {
      name,
      value: name,
      icon,
    };
  });
});

const options = computed<Option[]>(() => {
  const filter = filterValue.value.trim().toLowerCase();

  let list: Option[] = [];

  if (showSelectedAssetPopup.value) list = optionsAssets.value;
  else if (showSelectNetworkPopup.value) list = optionsNetworks.value as Option[];
  else if (showDestNetPopup.value) list = optionsDestNet.value;

  return list.filter(({ name }) => name.toLowerCase().includes(filter));
});

const calcTransferableUtility = () => {
  const balance = utilityAsset.value?.balances.find(
    (balanceItem) => balanceItem.isUtility && balanceMatchesNetwork(balanceItem, syncedNetwork.value)
  );

  return balance?.transferable?.toString() ?? '0';
};

const calcTransferableSendMinusFeeValue = (fee: string) =>
  calcTransferableSendMinusFee(currency.value, syncedNetwork.value, fee, isCrossChain.value, syncedDestNetFee.value);

const isValidSendAsset = computed(() =>
  isValidAmountAsset(
    currency.value,
    syncedNetwork.value,
    syncedFee.value ?? '0',
    syncedAmount.value,
    isCrossChain.value,
    syncedDestNetFee.value ?? '0'
  )
);

const isValidTransferByUtility = computed(() => {
  if (syncedFee.value === '') return false;

  if (sendAssetName.value?.toLowerCase() === utilityAssetName.value) return true;

  const precision = currencyBalance.value?.precision;

  const ed = FPNumber.fromCodecValue(currencyBalance.value?.existentialDeposit ?? '0', precision).mul(
    new FPNumber(1.1, precision)
  );

  const feeFP = new FPNumber(syncedFee.value, precision);
  const checkValue = isCrossChain.value ? feeFP.add(ed) : feeFP;

  return FPNumber.gte(new FPNumber(calcTransferableUtility(), precision), checkValue);
});

const transactionAddress = computed(() => getTransactionAddress(accountsStore.selectedWallet, syncedNetwork.value));

const tx = computed(() => {
  const baseRequest = {
    to: syncedRecipient.value,
    from: transactionAddress.value,
    relayChain: currency.value?.relayChain,
    assetId: syncedAssetId.value,
    amount: syncedAmount.value,
  };

  if (isTransfer.value)
    return {
      ...baseRequest,
      networkKey: syncedNetwork.value,
    } as RequestCheckTransfer;

  return {
    ...baseRequest,
    originNet: syncedNetwork.value,
    destinationNet: syncedDestNet.value,
  } as RequestCheckCrossChain;
});

const syncedFeeCut = computed(() => {
  const text = isTonNetwork.value ? '< ' : '';
  const formatted = n ? n(+syncedFee.value, 'decimalPrecise') : syncedFee.value;

  return `${text}${formatted} ${originalNetworkUtilityAsset.value.toUpperCase()}`;
});

const fiatFeeCut = computed(() => {
  const formatted = n ? n(+syncedFee.value * originalAssetPrice.value, 'price') : (+syncedFee.value).toString();

  return `${accountsStore.fiatSymbol}${formatted}`;
});

const destNetFeeCut = computed(() => {
  const formatted = n ? n(+syncedDestNetFee.value, 'decimalPrecise') : syncedDestNetFee.value;

  return `${formatted} ${sendAssetName.value?.toUpperCase?.() ?? ''}`;
});

const destNetFiatFeeCut = computed(() => {
  const formatted = n
    ? n(+syncedDestNetFee.value * assetPrice.value, 'price')
    : (+syncedDestNetFee.value * assetPrice.value).toString();

  return `${accountsStore.fiatSymbol}${formatted}`;
});

const buttonText = computed(() => {
  if (!navigator.onLine) return 'common.offlineStatus';

  if (!currency.value) return '';

  if (step.value === 2) {
    if (isTransfer.value) return 'assets.sendButtonText';

    return 'common.confirm';
  }

  if (estimateFeeError.value) return 'estimateFeeError';

  if (isSameAddress.value) return 'assets.isSameAddress';

  if (!isValidRecipientAddress.value && syncedRecipient.value !== '') return 'assets.incorrectAddress';

  if (!isValidSendAsset.value)
    return { text: 'assets.insufficientBalance', localeProps: { asset: sendAssetName.value?.toUpperCase?.() } };

  if (!isValidTransferByUtility.value)
    return { text: 'assets.insufficientBalance', localeProps: { asset: utilityAssetName.value.toUpperCase() } };

  return 'common.continue';
});

const buttonDisabled = computed(() => {
  if (props.isDisableBtn) return true;

  if (isFetchingFees.value || estimateFeeError.value) return true;

  if (!navigator.onLine) return true;

  if (step.value === 2) return false;

  return (
    !isValidSendAsset.value ||
    !isValidTransferByUtility.value ||
    !isValidRecipientAddress.value ||
    !syncedAssetId.value ||
    !syncedNetwork.value ||
    !syncedAmount.value ||
    +syncedAmount.value === 0 ||
    syncedFee.value === ''
  );
});

const getStatusWallet = (address: string, ethereumAddress: string) => {
  const currentAddress = BaseApi.formatAddress({ address, ethereumAddress }, syncedNetwork.value);
  const currentRecipientAddress = BaseApi.formatAddress(
    { address: syncedRecipient.value, ethereumAddress: syncedRecipient.value },
    syncedNetwork.value
  );

  return currentAddress === currentRecipientAddress;
};

const toggleEditBook = (address: string = '') => {
  showEditAddressBook.value = !showEditAddressBook.value;
  showHistoryBook.value = !showHistoryBook.value;
  newAddress.value = address;
};

const setRecipient = (address = '') => {
  syncedRecipient.value = BaseApi.formatAddress({ address, ethereumAddress: address }, targetNetwork.value);
};

const toggleSelectedNetwork = (value: string) => {
  if (showSelectedAssetPopup.value) {
    syncedAssetId.value = value;

    toggleValue('showSelectedAssetPopup');
  } else if (showSelectNetworkPopup.value) {
    syncedNetwork.value = value;

    toggleValue('showSelectNetworkPopup');
  } else {
    syncedDestNet.value = value;

    toggleValue('showDestNetPopup');
  }
};

const updateAmount = (amount: string) => {
  const value = getCostOfAssets(+amount, assetPrice.value).toString() ?? '';

  syncedAmount.value = amount;
  syncedValue.value = value;
};

const handlerFilter = (value: string) => {
  filterValue.value = value;
};

const toggleMyWalletsVisibility = () => {
  showMyWallets.value = !showMyWallets.value;
};

const toggleHistoryBookVisibility = () => {
  showHistoryBook.value = !showHistoryBook.value;
};

const handlerBack = () => {
  if (showHistoryBook.value) toggleHistoryBookVisibility();
  else if (showEditAddressBook.value) toggleEditBook();
  else if (showMyWallets.value) toggleMyWalletsVisibility();
  else step.value -= 1;
};

const confirmationPasswordPopupClose = (closeForm: boolean) => {
  showConfirmationPasswordPopup.value = false;

  if (closeForm) emit('closeForm');
};

const setWallet = (address: string, ethereumAddress: string) => {
  const network = isTransfer.value || syncedDestNet.value === '' ? syncedNetwork.value : syncedDestNet.value;

  syncedRecipient.value = BaseApi.formatAddress({ address, ethereumAddress }, network);

  toggleMyWalletsVisibility();
};

const toggleLoading = (value = true) => {
  isFetchingFees.value = value;
};

const verifyTx = async (_amount?: string): Promise<ResponseCheckTransfer | ResponseCheckCrossChain> => {
  toggleLoading();

  try {
    const to = BaseApi.formatAddress(
      { address: VALID_SUBSTRATE_ADDRESS, ethereumAddress: VALID_ETHEREUM_ADDRESS },
      targetNetwork.value
    );

    const amount = _amount ?? (syncedAmount.value !== '' && syncedAmount.value !== '0' ? syncedAmount.value : '1');

    if (isTransfer.value) {
      return await checkTransfer({
        networkKey: syncedNetwork.value,
        from: transactionAddress.value,
        to,
        relayChain: currency.value?.relayChain,
        amount,
        assetId: syncedAssetId.value,
      });
    }

    return await checkCrossChain({
      originNet: syncedNetwork.value,
      destinationNet: syncedDestNet.value,
      from: transactionAddress.value,
      to,
      relayChain: currency.value?.relayChain,
      amount,
      assetId: syncedAssetId.value,
    });
  } finally {
    toggleLoading(false);
  }
};

const calculateEstimates = async () => {
  if (!currency.value) return;

  crossChainValidationError.value = null;

  try {
    const { estimateFee, destEstimateFee, errors } = await verifyTx();

    if (errors) {
      errors.forEach((error) => {
        if (error.code === TransferErrorCode.TRANSFER_ERROR) estimateFeeError.value = true;
        else estimateFeeError.value = false;
      });
    }

    syncedFee.value = estimateFee ?? '';
    syncedDestNetFee.value = destEstimateFee ?? '';
  } catch (error) {
    syncedFee.value = '';
    syncedDestNetFee.value = '';

    if (isCrossChain.value) {
      const fallbackMessage = 'Unable to estimate cross-chain fees for the selected destination.';
      const normalizedMessage = error instanceof Error && error.message.trim() !== '' ? error.message : fallbackMessage;

      crossChainValidationError.value = normalizedMessage;
    }
  }
};

const setMax = async () => {
  if (!currency.value) return;

  const setMaxInner = async () => {
    const { estimateFee } = await verifyTx(transferableAmount.value.toString());
    const transferable = calcTransferableSendMinusFeeValue(estimateFee ?? '0');

    syncedAmount.value = transferable.toString();
    syncedValue.value = getCostOfAssets(transferable, assetPrice.value).toString();
  };

  if (syncedFee.value === '' || syncedFee.value === '0') {
    if (timeoutSetMax) clearTimeout(timeoutSetMax);

    timeoutSetMax = setTimeout(() => {
      void setMaxInner();
    }, 2000);
  } else {
    await setMaxInner();
  }
};

const handlerContinueButton = () => {
  if (step.value === 2) {
    showConfirmationPasswordPopup.value = true;

    return;
  }

  step.value += 1;
  showSelectedAssetPopup.value = false;
  showSelectNetworkPopup.value = false;
  showDestNetPopup.value = false;
};

const handlerCloseExistentialPopup = () => {
  showExistentialPopup.value = false;
};

const handlerAcceptExistentialPopup = () => {
  handlerContinueButton();
  handlerCloseExistentialPopup();
};

const handlerCloseSelectPopup = () => {
  if (showSelectedAssetPopup.value) toggleValue('showSelectedAssetPopup');
  else if (showSelectNetworkPopup.value) toggleValue('showSelectNetworkPopup');
  else toggleValue('showDestNetPopup');
};

const handlerCloseWarningAddressPopup = () => {
  syncedRecipient.value = '';
};

const formatAddress = () => {
  syncedRecipient.value = BaseApi.formatAddress(
    {
      address: syncedRecipient.value,
      ethereumAddress: syncedRecipient.value,
    },
    targetNetwork.value
  );
};

const paste = () => {
  syncedRecipient.value = getClipboard();
};

watch(syncedRecipient, () => {
  void scamWatcher();
});

watch(showSelectedAssetPopup, (newValue) => {
  if (newValue) {
    showSelectNetworkPopup.value = false;
    showDestNetPopup.value = false;
    filterValue.value = '';
  }
});

watch(showSelectNetworkPopup, (newValue) => {
  if (newValue) {
    showSelectedAssetPopup.value = false;
    showDestNetPopup.value = false;
    filterValue.value = '';
  }
});

watch(showDestNetPopup, (newValue) => {
  if (newValue) {
    showSelectedAssetPopup.value = false;
    showSelectNetworkPopup.value = false;
    filterValue.value = '';
  }
});

watch(
  syncedNetwork,
  (newValue, prevValue) => {
    if (!newValue || !prevValue) return;

    if (newValue.toLowerCase() === syncedDestNet.value.toLowerCase()) syncedDestNet.value = prevValue;
  },
  { flush: 'post' }
);

watch(syncedAssetId, () => {
  syncedAmount.value = '';
  syncedDestNet.value = optionsDestNet.value?.[0]?.value ?? '';
  syncedValue.value = '';

  if (isTransfer.value) syncedNetwork.value = optionsNetworks.value?.[0]?.value ?? '';
});

watch(syncedDestNet, () => {
  nextTick(() => {
    if (!isValidRecipientAddress.value) setRecipient();
  });
});

watch([syncedRecipient, syncedDestNet, syncedNetwork], () => {
  crossChainValidationError.value = null;
});

watch(
  () => [syncedAssetId.value, syncedNetwork.value, syncedDestNet.value, syncedRecipient.value, syncedAmount.value],
  () => {
    if (!currency.value) return;

    if (timeoutSubscription) clearTimeout(timeoutSubscription);

    timeoutSubscription = setTimeout(() => {
      void calculateEstimates();
    }, 2000);
  }
);

void calculateEstimates();

onBeforeUnmount(() => {
  if (timeoutSubscription) clearTimeout(timeoutSubscription);
  if (timeoutSetMax) clearTimeout(timeoutSetMax);
});
</script>

<style lang="scss">
.transfer-form {
  .row {
    margin-top: 10px;

    &:first-child {
      margin-top: 0;
    }
  }
}
</style>

<style lang="scss" scoped>
.transfer-select-popup {
  z-index: 300 !important;
  text-transform: capitalize;
}

.wallet {
  margin-bottom: 12px !important;
}

.transfer-form {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  .s-icon-arrows-arrow-right-24 {
    color: $default-white;
    font-size: 1.875em !important;
  }

  .balance {
    font-size: 1.375em;
    line-height: 28px;
    max-width: 245px;
  }

  .activity-buttons {
    display: flex;
    user-select: none;
    margin-bottom: 30px;
  }
}
</style>
