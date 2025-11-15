<template>
  <Popup
    headerType="success"
    sizeWidth="big"
    :headerText="statusMessagesHeader"
    :zIndex="399"
    :showBorder="true"
    @handlerClose="emitClose"
  >
    <div class="popup-content">
      <template v-if="isAwaiting">
        <Icon icon="lock-green" className="icon" iconColor="success" />

        <div class="text row" data-testid="popupMessage">{{ popupMessage }}</div>

        <ValidatedInput
          :value="password"
          placeholder="common.password"
          size="big"
          class="password-input row"
          errorDescriptions="common.invalidPassword"
          data-testid="passwordGoogle"
          :isError="isErrorPassword"
          :showPassword="true"
          @change="changePassword"
        />

        <Hint class="hint" iconName="notification" :text="hintGoogleDriveText" />
      </template>

      <Loader v-if="isUploading" />

      <div v-if="isFinishedUpload">
        <Icon icon="check" className="icon" iconColor="success" />

        <div class="saved" data-testid="googleSaved">{{ $t('addWallet.google.saved') }}</div>

        <span class="descriptions" data-testid="googleDescriptions">{{ $t('wallet.googleExportSuccess') }}</span>
      </div>

      <FButton
        v-if="!isUploading"
        text="common.confirm"
        width="100%"
        size="medium"
        fontSize="big"
        type="primary"
        :disabled="disabledButton"
        :border="false"
        data-testid="confirmPassword"
        @click="onConfirm"
      />
    </div>
  </Popup>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import type { KeyringPair$Json } from '@subwallet/keyring/types';
import type { ICreateFile } from '@/interfaces';
import { createGoogleFile, exportJSON, validatePassword } from '@/extension/messaging';

const emit = defineEmits<{
  closePopup: [];
}>();

const { t } = useI18n();
const route = useRoute();

const password = ref('');
const isErrorPassword = ref(false);
const status = ref<'prepare' | 'upload' | 'uploaded' | 'await'>('await');

const selectedWalletAddress = computed(() => route.query.wallet as string);
const isAwaiting = computed(() => status.value === 'await');
const isUploading = computed(() => status.value === 'prepare' || status.value === 'upload');
const isFinishedUpload = computed(() => status.value === 'uploaded');

const disabledButton = computed(() => {
  if (isFinishedUpload.value) return false;

  return password.value === '' || isErrorPassword.value;
});

const hintGoogleDriveText = computed(() => t('addWallet.google.dataWillStoreOnGDrive'));

const popupMessage = computed(() =>
  status.value === 'await' ? t('accounts.validatePass') : t('addWallet.google.saved')
);

const statusMessagesHeader = computed(() => {
  if (status.value === 'prepare') return t('googleExport.prepData');
  if (status.value === 'upload') return t('googleExport.uploading');

  return '';
});

function changePassword(value: string) {
  password.value = value;
}

watch(password, () => {
  isErrorPassword.value = false;
});

async function onConfirm() {
  if (isFinishedUpload.value) {
    emit('closePopup');

    return;
  }

  status.value = 'prepare';

  const isValid = await validatePassword(password.value);

  if (!isValid) {
    status.value = 'await';
    isErrorPassword.value = true;

    return;
  }

  let ethWalletId: string | undefined;
  let substrateWalletId: string | undefined;

  const { json: substrateJson } = await exportJSON(selectedWalletAddress.value, password.value);
  const isEthereumAddress = !!substrateJson.meta.ethereumAddress;
  const stringifyJson = JSON.stringify(substrateJson);

  status.value = 'upload';

  if (isEthereumAddress) {
    const { json: ethereumJson } = await exportJSON(substrateJson.meta.ethereumAddress as string, password.value);

    const ethOptions = prepUploadMeta(substrateJson);
    ethWalletId = await createFile(JSON.stringify(ethereumJson), ethOptions);

    const substrateOptions = prepUploadMeta(substrateJson, ethWalletId);
    substrateWalletId = await createFile(stringifyJson, substrateOptions);
  } else {
    const substrateOptions = prepUploadMeta(substrateJson);
    substrateWalletId = await createFile(stringifyJson, substrateOptions);
  }

  status.value = substrateWalletId ? 'uploaded' : 'await';
}

function prepUploadMeta(json: KeyringPair$Json, ethWalletId?: string): ICreateFile['options'] {
  return {
    name: json.meta.name as string,
    address: ethWalletId ? `${json.address}/${ethWalletId}` : ((json.meta.ethereumAddress as string) ?? ''),
    password: password.value,
  };
}

async function createFile(json: string, options: ICreateFile['options']): Promise<string> {
  const res = await createGoogleFile({
    json,
    options,
    token: route.params.access_token as string,
  });

  return res.id;
}

function emitClose() {
  emit('closePopup');
}
</script>

<style lang="scss" scoped>
.popup-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 25px;
  min-height: 175px;

  .password-input {
    width: 100%;
    margin-bottom: 15px;
  }

  .icon {
    width: 30px;
    height: 30px;
  }

  .text {
    font-weight: 700;
    font-size: 1.125em;
    width: 250px;
  }

  .row {
    margin-top: 15px;
  }

  .saved {
    font-weight: 600;
    font-size: 1.125em;
    margin-bottom: 5px;
  }

  .descriptions {
    display: flex;
    justify-content: space-between;
    color: $gray-color;
    border-radius: 50px;
    margin-bottom: 20px;
    padding: 12px;
    max-width: 350px;

    .s-icon-arrows-arrow-right-24 {
      color: $gray-2-color;
      font-size: 1.875em !important;
      margin: 0 10px;
    }
  }

  .transfer-amount {
    font-weight: 800;
    font-size: 1.25rem;
    margin-bottom: 10px;
  }

  .transfer-value {
    font-size: 1em;
    color: $gray-color;
  }

  .remember__checkbox {
    margin-top: -15px;
    width: 100%;
    display: flex;
    align-items: flex-start;
  }

  .hint {
    width: 100%;
    max-width: 300px;
    padding-bottom: 34px;
  }
}
</style>
