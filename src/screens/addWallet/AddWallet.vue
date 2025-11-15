<template>
  <div class="add-wallet">
    <div class="header">
      <div class="icon-container">
        <CircleButton
          v-if="showBackIcon"
          backgroundColor="light-black"
          iconName="chevron-left"
          data-testid="backBtn"
          @click="back"
        />
      </div>

      <div class="steps">
        <div v-for="num in countSteps" :key="num" :class="getClassesStep(num)"></div>
      </div>

      <div class="icon-background">
        <CircleButton
          v-if="isPopup"
          iconName="expand"
          backgroundColor="light-black"
          tooltipText="common.fullScreen"
          target=".expand"
          placement="left"
          @click="openFullScreen"
        />
      </div>
    </div>

    <div class="content-wrapper">
      <div class="content">
        <div class="content-header" data-testid="header">{{ header }}</div>

        <NicknameForm
          v-if="showNicknameForm"
          :nickname="nickname"
          :readonly="readonlyNickname"
          @update:nickname="setNickname"
        />

        <CreateWallet
          v-if="showCreateForm"
          :step="step"
          :mnemonic="mnemonic"
          :mnemonicLength="mnemonicLength"
          :isSubstrate="isSubstrate"
          :selectedMnemonicElements="selectedMnemonicElements"
          @toggleAdvancedFormVisible="toggleAdvancedFormVisible"
          @update:selectedMnemonicElements="updateSelectedMnemonicElements"
        />

        <ImportWallet
          v-if="showImportForm"
          v-model="typeImport"
          :step="step"
          :mnemonic="mnemonic"
          :substrateRawSeed="substrateRawSeed"
          :ethereumRawSeed="ethereumRawSeed"
          :substrateJson="substrateJson"
          :ethereumJson="ethereumJson"
          :passwordJson="passwordJson"
          :isOnlyEthereumAccount="isOnlyEthereumAccount"
          :isSubstrate="isSubstrate"
          @setImportValue="setImportValue"
          @reset="reset"
          @toggleAdvancedFormVisible="toggleAdvancedFormVisible"
          @update:passwordJson="setPasswordJson"
        />

        <AdvancedForm
          v-if="showAdvancedForm"
          :derivationPaths="derivationPaths"
          :showEthereumDP="showEthereumDP"
          @updateDP="updateDP"
          @toggleAdvancedFormVisible="toggleAdvancedFormVisible"
        />

        <FinishForm v-if="showFinishForm" />
      </div>

      <div class="controls">
        <FButton
          v-if="confirmMnemonicStep"
          size="big"
          fontSize="big"
          width="64px"
          type="secondary"
          :border="false"
          :iconName="'reload'"
          data-testid="resetAllBtn"
          @click="resetAll"
        />

        <FButton
          v-if="confirmMnemonicStep"
          size="big"
          fontSize="big"
          width="100%"
          type="secondary"
          text="addWallet.skipConfirmation"
          :border="false"
          data-testid="skipBtn"
          @click="skipStep"
        />

        <FButton
          v-if="!showAdvancedForm"
          size="big"
          fontSize="big"
          width="100%"
          :iconName="isLoading ? 'loader' : ''"
          :iconType="isLoading ? 'loading' : ''"
          :disabled="disabledProceed"
          :text="isLoading ? '' : buttonText"
          data-testid="proceedBtn"
          @click="proceed"
        />
      </div>
    </div>

    <NotificationPopup
      v-if="showNotificationPopup"
      :headers="invalidMessages"
      acceptButtonText="common.accept"
      :showAcceptButton="isMobileWalletExists"
      :showRejectButton="isMobileWalletExists"
      @handlerClose="handlerCloseNotificationPopup"
      @handlerAccept="handlerAcceptAddWallet"
    />

    <AddEthereumAccountPopup
      v-if="showAddEthereumAccountPopup"
      sizeWidth="medium"
      @handlerClose="closeAddEthereumAccountPopup"
      @handlerAgree="handlerAgree"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { DerivationPaths, ImportType, ValidateJsonResult, MnemonicConfirmation } from '@/interfaces';
import type { KeyringPair$Json } from '@subwallet/keyring/types';
import type { WarningValueName } from '@/consts/messages';
import type { FWKeyringMeta } from '@/extension/background/extension-base/src/types';
import { WalletEcosystem } from '@/interfaces';
import CreateWallet from '@/screens/addWallet/CreateWallet.vue';
import FinishForm from '@/screens/addWallet/FinishForm.vue';
import ImportWallet from '@/screens/addWallet/ImportWallet.vue';
import NicknameForm from '@/screens/addWallet/NicknameForm.vue';
import AdvancedForm from '@/screens/addWallet/AdvancedForm.vue';
import AddEthereumAccountPopup from '@/screens/addWallet/AddEthereumAccountPopup.vue';
import NotificationPopup from '@/components/NotificationPopup.vue';
import BaseApi from '@/util/BaseApi';
import { Components } from '@/router/routes';
import { INITIAL_DERIVATION_PATHS, ETHEREUM_DEFAULT_DERIVATION_PATH } from '@/consts/derivationPath';
import {
  forgetAccount,
  isDerivationPathValid,
  isJsonValid,
  jsonRestore,
  windowOpen,
  addAccount,
  updatePairMeta,
  generateMnemonic,
  mnemonicValidate,
} from '@/extension/messaging';
import { IS_POPUP } from '@/consts/globalClient';
import { useAccountsStore } from '@/stores/accounts';

type AddWalletField = 'mnemonic' | 'ethereumRawSeed' | 'substrateRawSeed' | 'substrateJson' | 'ethereumJson';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const accountsStore = useAccountsStore();

const countSteps = 4;
const isPopup = IS_POPUP;

const step = ref(1);
const nickname = ref('');
const mnemonic = ref('');
const passwordSubstrateJson = ref('');
const passwordEthereumJson = ref('');
const ethereumJson = ref('');
const substrateJson = ref('');
const ethereumRawSeed = ref('');
const substrateRawSeed = ref('');
const showAdvancedForm = ref(false);
const showAddEthereumAccountPopup = ref(false);
const selectedMnemonicElements = ref<MnemonicConfirmation[]>([]);
const warningValueName = ref<WarningValueName>('');
const typeImport = ref<ImportType>('mnemonic');
const derivationPaths = ref<DerivationPaths>(JSON.parse(JSON.stringify(INITIAL_DERIVATION_PATHS)) as DerivationPaths);
const address = ref<string | null>(null);
const isLoading = ref(false);

const isOnlyEthereumAccount = computed(() => route.params.onlyEthereumAccount !== undefined);
const walletType = computed(() => route.params.type as 'create' | 'import' | undefined);
const walletEcosystem = computed<WalletEcosystem>(
  () => (route.params.walletEcosystem as WalletEcosystem) ?? WalletEcosystem.Substrate
);
const isSubstrate = computed(() => walletEcosystem.value === WalletEcosystem.Substrate);
const mnemonicLength = computed(() => (walletEcosystem.value === WalletEcosystem.Ton ? 24 : 12));
const confirmMnemonicStep = computed(() => step.value === 3 && isCreateWallet.value);
const isDifferentPasswords = computed(() => passwordEthereumJson.value !== passwordSubstrateJson.value);

const passwordJson = computed(() =>
  isOnlyEthereumAccount.value
    ? passwordEthereumJson.value
    : step.value === 1
      ? passwordSubstrateJson.value
      : passwordEthereumJson.value
);

const substrateJSON = computed(() => BaseApi.parseJson(substrateJson.value));
const ethereumJSON = computed(() => BaseApi.parseJson(ethereumJson.value));
const showEthereumDP = computed(() => typeImport.value === 'mnemonic');
const readonlyNickname = computed(() => typeImport.value === 'json');
const showNotificationPopup = computed(() => warningValueName.value !== '');
const isMobileWalletExists = computed(() => warningValueName.value === 'duplicateMobileWallet');

const isCreateWallet = computed(() => walletType.value === 'create');
const isImportWallet = computed(() => walletType.value === 'import');

const showNicknameForm = computed(
  () => (isImportWallet.value && step.value === 3) || (isCreateWallet.value && step.value === 1)
);
const showCreateForm = computed(
  () => isCreateWallet.value && (step.value === 2 || step.value === 3) && !showAdvancedForm.value
);
const showImportForm = computed(
  () => isImportWallet.value && (step.value === 1 || step.value === 2) && !showAdvancedForm.value
);
const showBackIcon = computed(() => step.value !== 4);
const showFinishForm = computed(() => step.value === 4);

const translate = (key: string, params: Record<string, unknown> = {}) => t(`addWallet.${key}`, params).toString();

const header = computed(() => {
  if (isCreateWallet.value) {
    if (step.value === 1) return translate('createWallet');
    if (step.value === 2) return translate('backupPassphrase');
    if (step.value === 3) return translate('confirmPassphrase');
  }

  if (step.value === 1) {
    if (isOnlyEthereumAccount.value) return translate('addEthereumAccount');

    return typeImport.value === 'mnemonic'
      ? translate('importWallet')
      : translate('importAccount', { type: 'substrate' });
  }

  if (step.value === 2) return translate('importAccount', { type: 'ethereum' });
  if (step.value === 3) return translate('walletNickname');

  return '';
});

const buttonText = computed(() => {
  if (isCreateWallet.value && step.value === 2) return translate('haveWrittenPassphrase');
  if (showFinishForm.value) return translate('usingFearless');

  return 'common.continue';
});

const isLengthZero = (value: string | KeyringPair$Json) =>
  typeof value === 'string' ? value.length === 0 : Object.keys(value ?? {}).length === 0;

const invalidMessages = computed(() => {
  if (!warningValueName.value) return {};

  const mainPath = `addWallet.warningMessages.${warningValueName.value}`;

  return {
    text: `${mainPath}.text`,
    subtext: `${mainPath}.subtext`,
  };
});

const disabledProceed = computed(() => {
  if (isLoading.value) return true;

  if (isImportWallet.value) {
    if (step.value === 1) {
      if (isOnlyEthereumAccount.value) {
        return !ethereumRawSeed.value && isLengthZero(ethereumJson.value) && !passwordEthereumJson.value;
      }

      if (
        !mnemonic.value &&
        !substrateRawSeed.value &&
        (isLengthZero(substrateJson.value) || !passwordSubstrateJson.value)
      )
        return true;

      return false;
    }

    if (step.value === 2) {
      if (isDifferentPasswords.value) return true;
      if (!ethereumRawSeed.value) return isLengthZero(ethereumJson.value) || !passwordEthereumJson.value;

      return false;
    }

    if (step.value === 3 && typeImport.value !== 'json') return !nickname.value;

    return false;
  }

  if (step.value === 1) return !nickname.value;
  if (step.value === 3) return mnemonic.value.split(' ').length !== selectedMnemonicElements.value.length;

  return false;
});

const substrateDerivationPath = computed(() => derivationPaths.value.substrate.value.trim());
const ethereumDerivationPath = computed(() => derivationPaths.value.ethereum.value.trim());

const suriSubstrate = computed(
  () => `${(mnemonic.value || substrateRawSeed.value).trim()}${substrateDerivationPath.value}`
);

const suriEthereum = computed(() => {
  if (!isSubstrate.value) return '';

  const dp = ethereumDerivationPath.value.length
    ? ethereumDerivationPath.value.startsWith('/')
      ? ethereumDerivationPath.value
      : `/${ethereumDerivationPath.value}`
    : ETHEREUM_DEFAULT_DERIVATION_PATH;

  if (mnemonic.value) return `${mnemonic.value.trim()}${dp.trim()}`;
  if (ethereumRawSeed.value) return ethereumRawSeed.value.trim();

  return '';
});

const getClassesStep = (num: number) => {
  let hidden: number[] = [];

  if (isOnlyEthereumAccount.value) {
    if (isImportWallet.value) {
      if (typeImport.value === 'mnemonic' || typeImport.value === 'rawSeed') hidden = [2, 3, 5];
      else if (typeImport.value === 'json') hidden = [2, 3, 4, 5];
    } else hidden = [1, 5];
  } else if (isImportWallet.value) {
    if (typeImport.value === 'json') hidden = [4];
    else if (typeImport.value === 'mnemonic') hidden = [2];
  }

  const isCircleHidden = hidden.includes(num) || hidden.length === countSteps - 1;
  const isCircleFilled = !isCircleHidden && num <= step.value;

  return [
    'circle-step',
    {
      'circle-filled': isCircleFilled,
      'circle-hidden': isCircleHidden,
    },
  ];
};

const toggleAdvancedFormVisible = (value = true) => {
  showAdvancedForm.value = value;
};

const updateDP = (value: DerivationPaths) => {
  derivationPaths.value = value;
};

const reset = () => {
  mnemonic.value = '';
  substrateRawSeed.value = '';
  ethereumRawSeed.value = '';
  substrateJson.value = '';
  ethereumJson.value = '';
  passwordSubstrateJson.value = '';
  passwordEthereumJson.value = '';
  nickname.value = '';
  address.value = null;
  derivationPaths.value = JSON.parse(JSON.stringify(INITIAL_DERIVATION_PATHS)) as DerivationPaths;
};

const setImportValue = (value: string | KeyringPair$Json | Record<string, never>, field: AddWalletField) => {
  switch (field) {
    case 'mnemonic':
      mnemonic.value = value as string;
      break;
    case 'ethereumRawSeed':
      ethereumRawSeed.value = value as string;
      break;
    case 'substrateRawSeed':
      substrateRawSeed.value = value as string;
      break;
    case 'substrateJson':
      substrateJson.value = value as string;
      break;
    case 'ethereumJson':
      ethereumJson.value = value as string;
      break;
  }
};

const setNickname = (value: string) => {
  nickname.value = value;
};

const updateSelectedMnemonicElements = (value: MnemonicConfirmation[]) => {
  selectedMnemonicElements.value = value;
};

const setPasswordJson = (value: string) => {
  if (isOnlyEthereumAccount.value) {
    passwordEthereumJson.value = value;
  } else {
    if (step.value === 1) passwordSubstrateJson.value = value;
    else passwordEthereumJson.value = value;
  }
};

const handlerCloseNotificationPopup = async () => {
  if (warningValueName.value === 'jsonInvalid') {
    if (step.value === 1) substrateJson.value = '';
    else if (step.value === 2) ethereumJson.value = '';
  }

  if (step.value === 1) passwordSubstrateJson.value = '';
  else if (step.value === 2) passwordEthereumJson.value = '';

  if (warningValueName.value === 'duplicateMobileWallet') reset();

  warningValueName.value = '';
  selectedMnemonicElements.value = [];
};

const handlerAcceptAddWallet = async () => {
  if (address.value) await forgetAccount(address.value, 'mobile');

  warningValueName.value = '';
  step.value += 1;
};

const closeAddEthereumAccountPopup = () => {
  showAddEthereumAccountPopup.value = false;
  step.value += 2;
};

const resetAll = () => {
  selectedMnemonicElements.value = [];
};

const skipStep = () => {
  step.value += 1;
};

const handlerAgree = () => {
  showAddEthereumAccountPopup.value = false;
  step.value += 1;
};

const validateAddressForDubMobileWallet = (rawAddress: string) => {
  const substrateAddress = BaseApi.encodeAddress(rawAddress);

  if (BaseApi.isMobileWallet(substrateAddress)) {
    warningValueName.value = 'duplicateMobileWallet';
    address.value = substrateAddress;
  }
};

const validateMobileDubs = async () => {
  if (isOnlyEthereumAccount.value) return;

  if (typeImport.value === 'json') {
    validateAddressForDubMobileWallet(substrateJSON.value.address);

    return;
  }

  return true;
};

const validateSequenceMnemonic = () => {
  const isValidSequenceMnemonic = isCreateWallet.value
    ? BaseApi.isValidSequenceMnemonic(
        mnemonic.value,
        selectedMnemonicElements.value.map(({ word }) => word.trim())
      )
    : true;

  if (!isValidSequenceMnemonic) warningValueName.value = 'mnemonicSequence';
};

const validateSuri = async () => {
  const {
    ethereum: { value: ethereumDPValue },
    substrate,
  } = derivationPaths.value;

  const normalizedDP =
    ethereumDPValue.length !== 0 ? (ethereumDPValue[0] === '/' ? ethereumDPValue.slice(1) : ethereumDPValue) : '';

  const isValidMnemonic =
    mnemonic.value.length === 0 ? true : await mnemonicValidate(walletEcosystem.value, mnemonic.value.trim());
  const isValidSubstratePhrase = substrate.value ? await isDerivationPathValid(substrate) : true;
  const isValidEthereumDP = ethereumDPValue ? BaseApi.isValidEthereumDerivationPath(normalizedDP.trim()) : true;
  const isValidSubstrateRawSeed = substrateRawSeed.value ? BaseApi.isHex(substrateRawSeed.value) : true;
  const isValidEthereumRawSeed = ethereumRawSeed.value ? BaseApi.isHex(ethereumRawSeed.value) : true;

  const validatedSubstrateJson =
    substrateJson.value !== ''
      ? await isJsonValid(substrateJSON.value, passwordSubstrateJson.value)
      : ({ value: true } as ValidateJsonResult);

  const validatedEthereumJson =
    ethereumJson.value !== ''
      ? await isJsonValid(ethereumJSON.value, passwordEthereumJson.value, false)
      : ({ value: true } as ValidateJsonResult);

  if (!isValidMnemonic) warningValueName.value = 'mnemonic';
  else if (!isValidSubstratePhrase) warningValueName.value = 'substrateDP';
  else if (!isValidEthereumDP) warningValueName.value = 'ethereumDP';
  else if (!isValidSubstrateRawSeed || !isValidEthereumRawSeed) warningValueName.value = 'rawSeed';
  else if (!validatedSubstrateJson.value) warningValueName.value = validatedSubstrateJson.errorType;
  else if (!validatedEthereumJson.value) warningValueName.value = validatedEthereumJson.errorType;
  else if (isValidMnemonic && isValidSubstrateRawSeed && validatedSubstrateJson.value && step.value === 1)
    await validateMobileDubs();
};

const saveKeypairFromSeed = async () => {
  const meta: FWKeyringMeta = {
    name: nickname.value.trim(),
    ethereumAddress: '',
    walletEcosystem: walletEcosystem.value,
  };

  const {
    substrate: { keypairType: substrateKeypairType },
    ethereum: { keypairType: ethereumKeypairType },
  } = derivationPaths.value;

  if (isOnlyEthereumAccount.value) meta.name = accountsStore.selectedWallet.name;

  if (suriEthereum.value) {
    const ethereumAddress = await addAccount(suriEthereum.value, ethereumKeypairType, meta);

    if (isOnlyEthereumAccount.value) {
      updatePairMeta(accountsStore.selectedWallet.address, { ethereumAddress });

      return '';
    }

    meta.ethereumAddress = ethereumAddress;
  }

  const addressValue = await addAccount(suriSubstrate.value, substrateKeypairType, meta, walletEcosystem.value);

  return addressValue;
};

const saveKeypairFromJson = async () => {
  const substrateJSONClone = { ...substrateJSON.value };

  if (ethereumJson.value) {
    const ethereumAddress = await jsonRestore(ethereumJSON.value, passwordEthereumJson.value);

    if (isOnlyEthereumAccount.value) {
      updatePairMeta(accountsStore.selectedWallet.address, {
        ethereumAddress,
        walletEcosystem: WalletEcosystem.Substrate,
      });

      return '';
    }

    substrateJSONClone.meta.ethereumAddress = ethereumAddress;
  }

  const addressValue = await jsonRestore(substrateJSONClone, passwordSubstrateJson.value);

  return addressValue;
};

const saveKeypair = () => {
  if (substrateJson.value || ethereumJson.value) return saveKeypairFromJson();

  return saveKeypairFromSeed();
};

const createFlow = async () => {
  if (step.value === 1 && !mnemonic.value.length) {
    mnemonic.value = await generateMnemonic(walletEcosystem.value, mnemonicLength.value);
  } else if (step.value === 2) {
    await validateSuri();
  } else if (step.value === 3) {
    validateSequenceMnemonic();
  }
};

const importFlow = async () => {
  if (step.value === 1) {
    await validateSuri();

    if (warningValueName.value !== '') return;

    if (isOnlyEthereumAccount.value) {
      step.value += 2;

      return;
    }

    if (typeImport.value === 'mnemonic') {
      step.value += 1;
    } else {
      showAddEthereumAccountPopup.value = true;
    }
  } else if (step.value === 2) {
    await validateSuri();
  }
};

const proceed = async () => {
  if (isCreateWallet.value) await createFlow();
  else await importFlow();

  if (!showNotificationPopup.value && !showAddEthereumAccountPopup.value) step.value += 1;
};

const openFullScreen = () => {
  windowOpen('/');
  window.close();
};

const backIsImportWallet = () => {
  if (step.value === 3 && ethereumRawSeed.value === '' && ethereumJson.value === '') step.value -= 1;
};

const back = () => {
  if (isOnlyEthereumAccount.value) {
    step.value -= 1;
  } else if (isImportWallet.value) {
    backIsImportWallet();
  } else if (step.value === 2) {
    ethereumRawSeed.value = '';
    ethereumJson.value = '';
  }

  step.value -= 1;
};

watch(substrateJson, (value) => {
  if (isLengthZero(substrateJSON.value) && value !== '') {
    warningValueName.value = 'jsonInvalid';

    return;
  }

  nickname.value = (substrateJSON.value?.meta?.name as string) || '';
});

watch(ethereumJson, (value) => {
  if (isLengthZero(ethereumJSON.value) && value !== '') warningValueName.value = 'jsonInvalid';
});

watch(step, async (value, oldValue) => {
  if (value === 0) {
    router.push({ name: Components.Welcome });

    return;
  }

  if (value === 2) selectedMnemonicElements.value = [];
  else if (value === 5) {
    router.push({ name: Components.Wallet });

    return;
  } else if (value === 4 && oldValue !== 4) {
    isLoading.value = true;

    try {
      await saveKeypair();

      if (isOnlyEthereumAccount.value) router.push({ name: Components.Wallet });
    } finally {
      isLoading.value = false;
    }
  }
});

onMounted(() => {
  if (isOnlyEthereumAccount.value && isCreateWallet.value) void proceed();
});
</script>

<style lang="scss" scoped>
.add-wallet {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;

  .header {
    width: 100%;
    margin-bottom: 24px;
    display: flex;
    justify-content: space-between;

    .steps {
      display: flex;
      align-items: center;

      .circle-step {
        border-radius: 50%;
        width: 10px;
        height: 10px;
        background-color: $default-background-color;
        margin-right: 8px;
      }

      .circle-filled {
        background-color: $pink-color;
      }

      .circle-hidden {
        display: none;
      }
    }
  }

  .content-wrapper {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;

    .content {
      width: 100%;

      .selected-network {
        margin-bottom: 16px;
      }
    }

    .content-header {
      font-weight: 600;
      font-size: 1.25rem;
      line-height: 25px;
      margin: 13.5px 0 21.5px;
    }
  }

  .el-button.s-primary:disabled {
    background-color: rgba(238, 0, 119, 0.4);
    border: rgba(238, 0, 119, 0.4);
    color: $gray-color;
  }

  .icon-container {
    width: 32px;
    height: 32px;
  }
}

.controls {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 10px;
  width: 100%;
}
</style>
