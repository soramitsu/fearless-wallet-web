<template>
  <FlowStepLayout
    :countSteps="countSteps"
    :showAdvancedForm="showAdvancedForm"
    :step="step"
    :header="header"
    :showFullScreenIcon="false"
    @back="back"
  >
    <NickNameForm v-if="nickNameStep" :nickname="nickname" @update:nickname="setNickname" />

    <CreateWallet
      v-if="createWalletStep"
      :step="step"
      :mnemonic="mnemonic"
      :selectedMnemonicElements="selectedMnemonicElements"
      @update:selectedMnemonicElements="updateSelectedMnemonicElements"
      @toggleAdvancedFormVisible="toggleAdvancedFormVisible"
    />

    <AdvancedForm
      v-if="showAdvancedForm"
      :derivationPaths="derivationPaths"
      @updateDP="updateDP"
      @toggleAdvancedFormVisible="toggleAdvancedFormVisible"
    />

    <template v-slot:control>
      <div class="controls">
        <FButton
          v-if="confirmMnemonicStep"
          size="big"
          fontSize="big"
          width="64px"
          type="secondary"
          :border="false"
          iconName="reload"
          @click="resetAll"
        />

        <FButton
          v-if="confirmMnemonicStep"
          size="big"
          fontSize="big"
          width="100%"
          type="secondary"
          :border="false"
          :text="$t('addWallet.skipConfirmation')"
          @click="skipStep"
        />

        <FButton
          size="big"
          fontSize="big"
          width="100%"
          type="primary"
          :border="false"
          :iconName="isLoading ? 'loader' : ''"
          :iconType="isLoading ? 'loading' : ''"
          :disabled="disabledProceed"
          :text="isLoading ? '' : buttonText"
          @click="proceed"
        />
      </div>
    </template>

    <NotificationPopup
      v-if="showNotificationPopup"
      :headers="invalidMessages"
      acceptButtonText="common.accept"
      @handlerClose="handlerCloseNotificationPopup"
      @handlerAccept="handlerAcceptAddWallet"
    />
  </FlowStepLayout>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { FWKeyringMeta } from '@extension-base/types';
import type { WarningValueName } from '@/consts/messages';
import { type DerivationPaths, WalletEcosystem, type MnemonicConfirmation } from '@/interfaces';
import NickNameForm from '@/screens/addWallet/NicknameForm.vue';
import CreateWallet from '@/screens/addWallet/CreateWallet.vue';
import FlowStepLayout from '@/screens/addWallet/google/FlowStepLayout.vue';
import AdvancedForm from '@/screens/addWallet/AdvancedForm.vue';
import NotificationPopup from '@/components/NotificationPopup.vue';
import { ETHEREUM_DEFAULT_DERIVATION_PATH, INITIAL_DERIVATION_PATHS } from '@/consts/derivationPath';
import BaseApi from '@/util/BaseApi';
import {
  addAccount,
  createGoogleFile,
  exportJSON,
  updateCurrentAccount,
  getExtensionPassword,
  generateMnemonic,
} from '@/extension/messaging';

const countSteps = 4;
const step = ref(1);
const nickname = ref('');
const mnemonic = ref('');
const showAdvancedForm = ref(false);
const derivationPaths = ref<DerivationPaths>(INITIAL_DERIVATION_PATHS);
const showNotificationPopup = ref(false);
const warningValueName = ref<WarningValueName>('');
const isLoading = ref(false);
const selectedMnemonicElements = ref<MnemonicConfirmation[]>([]);

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const accessToken = computed(() => route.params.access_token as string | undefined);
const nicknameStep = computed(() => step.value === 1);
const createWalletStep = computed(() => step.value === 2 || step.value === 3);
const confirmMnemonicStep = computed(() => step.value === 3);

const buttonTextForStep = computed<Record<number, string>>(() => ({
  1: t('common.continue').toString(),
  2: t('addWallet.haveWrittenPassphrase').toString(),
  3: t('addWallet.ConfirmSecretData').toString(),
  4: t('common.finish').toString(),
}));

const header = computed(() => {
  if (nicknameStep.value) return t('addWallet.createWallet');
  if (step.value === 2) return t('addWallet.backupPassphrase');
  if (step.value === 3) return t('addWallet.confirmPassphrase');
  if (step.value === 4) return '';

  return t('addWallet.createWallet');
});

const buttonText = computed(() => buttonTextForStep.value[step.value] ?? t('addWallet.createWallet').toString());

const disabledProceed = computed(() => {
  if (nicknameStep.value) return !nickname.value.trim();
  if (isLoading.value) return true;
  if (step.value === 3) return mnemonic.value.split(' ').length !== selectedMnemonicElements.value.length;

  return false;
});

const invalidMessages = computed(() => {
  if (!warningValueName.value) return {};

  const basePath = `addWallet.warningMessages.${warningValueName.value}`;

  return {
    text: `${basePath}.text`,
    subtext: `${basePath}.subtext`,
  };
});

const substrateDerivationPath = computed(() => derivationPaths.value.substrate.value.trim());
const ethereumDerivationPath = computed(() => derivationPaths.value.ethereum.value.trim());

const suriSubstrate = computed(() => `${mnemonic.value.trim()}${substrateDerivationPath.value}`);
const suriEthereum = computed(() => {
  const path = ethereumDerivationPath.value
    ? ethereumDerivationPath.value.startsWith('/')
      ? ethereumDerivationPath.value
      : `/${ethereumDerivationPath.value}`
    : ETHEREUM_DEFAULT_DERIVATION_PATH;

  return `${mnemonic.value}${path.trim()}`;
});

onMounted(async () => {
  mnemonic.value = await generateMnemonic();
});

watch(step, async (value) => {
  if (value !== 4) return;

  isLoading.value = true;

  try {
    const address = await saveKeypairFromSeed();

    await backupWallet(address);
    updateCurrentAccount(address);
  } finally {
    isLoading.value = false;
  }
});

const setNickname = (name: string) => {
  nickname.value = name;
};

const updateSelectedMnemonicElements = (value: MnemonicConfirmation[]) => {
  selectedMnemonicElements.value = value;
};

const updateDP = (value: DerivationPaths) => {
  derivationPaths.value = value;
};

const resetAll = () => {
  selectedMnemonicElements.value = [];
};

const skipStep = () => {
  step.value += 1;
};

const handlerCloseNotificationPopup = () => {
  warningValueName.value = '';
  selectedMnemonicElements.value = [];
  showNotificationPopup.value = false;
};

const handlerAcceptAddWallet = () => {
  warningValueName.value = '';
  step.value += 1;
};

const goBack = () => {
  router.replace('/').catch(() => {});
};

const back = () => {
  if (step.value === 1) {
    goBack();

    return;
  }

  step.value -= 1;
};

const proceed = () => {
  if (step.value === countSteps) {
    goBack();

    return;
  }

  if (step.value === 3) {
    const isValidSequenceMnemonic = BaseApi.isValidSequenceMnemonic(
      mnemonic.value,
      selectedMnemonicElements.value.map(({ word }) => word.trim())
    );

    if (!isValidSequenceMnemonic) {
      warningValueName.value = 'mnemonicSequence';
      showNotificationPopup.value = true;

      return;
    }
  }

  step.value += 1;
};

const toggleAdvancedFormVisible = (value = true) => {
  showAdvancedForm.value = value;
};

const backupWallet = async (address: string) => {
  const token = accessToken.value;

  if (!token) return;

  const password = await getExtensionPassword();
  const { json } = await exportJSON(address, password);

  const ethAddress = (json.meta.ethereumAddress as string) || '';
  let ethResponseId: string | undefined;

  if (ethAddress) {
    const { json: ethJson } = await exportJSON(ethAddress, password);
    const response = await createGoogleFile({
      json: JSON.stringify(ethJson),
      options: { name: nickname.value, address: ethAddress },
      token,
    });

    ethResponseId = response.id;
  }

  await createGoogleFile({
    json: JSON.stringify(json),
    options: { name: nickname.value, address: `${address}/${ethResponseId ?? ''}` },
    token,
  });
};

const saveKeypairFromSeed = async () => {
  const meta: FWKeyringMeta = {
    name: nickname.value.trim(),
    ethereumAddress: '',
    walletEcosystem: WalletEcosystem.Substrate,
  };

  const {
    substrate: { keypairType: substrateKeypairType },
    ethereum: { keypairType: ethereumKeypairType },
  } = derivationPaths.value;

  if (suriEthereum.value) {
    const ethereumAddress = await addAccount(suriEthereum.value, ethereumKeypairType, meta);

    meta.ethereumAddress = ethereumAddress;
  }

  const address = await addAccount(suriSubstrate.value, substrateKeypairType, meta);

  return address;
};
</script>

<style lang="scss" scoped>
.icon__container {
  height: 100%;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;

  .icon--drive {
    width: 187px;
    height: 187px;
    place-content: center;
  }
}

.divider__container {
  display: flex;
  flex-flow: row nowrap;
  width: 100%;
  justify-content: center;
  align-items: center;
  gap: 16px;
  padding-left: 10px;
  padding-right: 10px;
  color: $grayish-white-2;

  .divider {
    background: rgba(255, 255, 255, 0.1);
  }
}
.controls {
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 10px;
}
</style>
