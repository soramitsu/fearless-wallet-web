<template>
  <FlowStepLayout
    :countSteps="countSteps"
    :step="step"
    :flowSteps="getSteps"
    :header="header"
    :isLoading="isLoading"
    :showFullScreenIcon="false"
    @back="back"
  >
    <NegativeMessage v-if="isAccessDenied" :message="$t('addWallet.google.somethingWrong')" />

    <BackupWalletsList
      v-else-if="haveWalletsToImport"
      :items="files"
      :isGoogle="true"
      @getFile="getFile"
      @setItemValue="setItemValue"
      @setItemPassword="setItemPassword"
    />

    <template v-slot:control>
      <FButton
        v-if="!isLoading"
        size="big"
        fontSize="big"
        :disabled="isAllowedContinue"
        width="100%"
        :text="buttonText"
        data-testid="proceedBtn"
        @click="proceed"
      />
    </template>
  </FlowStepLayout>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { FilesState } from '@/interfaces';
import BackupWalletsList from '@/screens/addWallet/BackupWalletsList.vue';
import { getGoogleFile, getGoogleFiles, verifyToken } from '@/extension/messaging';
import { Components } from '@/router/routes';
import FlowStepLayout from '@/screens/addWallet/google/FlowStepLayout.vue';
import NegativeMessage from '@/screens/addWallet/google/NegativeMessage.vue';
import { ETHEREUM_ADDRESS_PREFIX } from '@/consts/networks';

const countSteps = 2;
const files = ref<FilesState[]>([]);
const isLoading = ref(true);
const step = ref(1);
const tokenValidation = ref<'pending' | 'valid' | 'invalid'>('pending');

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const token = computed(() => (route.params.access_token as string | undefined) ?? 'null');

const isImportInProgress = computed(() => files.value.some((el) => el.isLoading));
const isActiveNotComplete = computed(() => files.value.some(({ active, isComplete }) => active && !isComplete));
const importAcquired = computed(() => files.value.every(({ isComplete }) => !isComplete));
const isAccessDenied = computed(() => token.value === 'null' || tokenValidation.value === 'invalid');
const isFinishForm = computed(() => step.value === countSteps);
const getSteps = computed(() => (isLoading.value ? [] : [1, 2]));
const isFilesExists = computed(() => files.value.length);
const haveWalletsToImport = computed(() => !isLoading.value && Boolean(isFilesExists.value));
const buttonText = computed(() => t(step.value === 2 ? 'common.finish' : 'common.continue').toString());
const isAllowedContinue = computed(() => isImportInProgress.value || isActiveNotComplete.value || importAcquired.value);
const header = computed(() => {
  if (isAccessDenied.value) return t('addWallet.google.accessDenied').toString();

  if (isFinishForm.value) return '';

  return isLoading.value ? t('addWallet.google.fetchInfo').toString() : t('addWallet.google.selectToImport').toString();
});

const goBack = () => {
  router.replace('/').catch(() => {});
  router.push({ name: Components.Wallet }).catch(() => {});
};

const back = () => {
  if (step.value === 1) {
    goBack();

    return;
  }

  step.value -= 1;
};

const setItemValue = (index: number, data: Record<string, unknown>) => {
  const updated = { ...files.value[index], ...data };

  files.value.splice(index, 1, updated as FilesState);
};

const setItemPassword = (index: number, password: string) => {
  setItemValue(index, { password });
};

const getFile = async (id: string, key: number) => {
  const file = await getGoogleFile(id, token.value);

  if (file.address.startsWith(ETHEREUM_ADDRESS_PREFIX)) setItemValue(key, { ethJson: file });
  else setItemValue(key, { json: file });
};

const proceed = () => {
  if (isFinishForm.value || isAccessDenied.value) {
    goBack();

    return;
  }

  step.value += 1;
};

const isTokenValid = async () => {
  if (token.value === 'null') {
    isLoading.value = false;
    tokenValidation.value = 'invalid';

    return false;
  }

  const data = await verifyToken(token.value);

  if (data === null || Number(data.expires_in) <= 0) {
    isLoading.value = false;
    tokenValidation.value = 'invalid';

    return false;
  }

  tokenValidation.value = 'valid';

  return true;
};

onMounted(async () => {
  const validToken = await isTokenValid();

  if (!validToken) return;

  const { files: googleFiles } = await getGoogleFiles(token.value);

  const jsonsWithoutEth = googleFiles.filter((el) => el.description === '' || el.description === 'undefined');
  const regex = /\w+\/\w+/;
  const filterFiles = googleFiles.filter((el) => el && regex.test(el.description ?? ''));
  const filesToImport = [...filterFiles, ...jsonsWithoutEth];

  if (filesToImport.length === 0) {
    router.push({
      name: Components.CreateGoogle,
      params: {
        access_token: route.params.access_token,
      },
    });

    isLoading.value = false;

    return;
  }

  filesToImport.forEach(({ id, description, name }) => {
    const [prepName] = name.split('.');
    const [address, ethID] = (description ?? '').split('/');

    files.value.push({
      id,
      name: prepName,
      address,
      isComplete: false,
      isLoading: false,
      isError: false,
      ethWalletID: ethID,
      password: '',
      active: false,
    });
  });

  isLoading.value = false;
});
</script>

<style lang="scss" scoped>
.add-wallet-button {
  margin-bottom: 10px;
}
</style>
