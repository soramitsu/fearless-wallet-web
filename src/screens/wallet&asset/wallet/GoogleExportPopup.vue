<template>
  <Popup
    headerType="success"
    sizeWidth="big"
    :headerText="statusMessagesHeader"
    :zIndex="399"
    :showBorder="true"
    @handlerClose="close"
  >
    <div class="popup-content" :aria-busy="isUploading">
      <p v-if="uploadError" class="upload-error" role="alert">{{ $t('addWallet.google.somethingWrong') }}</p>
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

<script lang="ts">
import { defineComponent } from 'vue';
import type { KeyringPair$Json } from '@subwallet/keyring/types';
import type { ICreateFile } from '@/interfaces';
import { createGoogleFile, exportJSON, validatePassword } from '@/extension/messaging';

type PreparedBackup = {
  primary: KeyringPair$Json;
  linked?: KeyringPair$Json;
  linkedFileId?: string;
};

export default defineComponent({
  name: 'GoogleExportPopup',
  data() {
    return {
      password: '',
      isErrorPassword: false,
      uploadError: false,
      status: 'await',
      active: true,
      revision: 0,
      prepared: null as PreparedBackup | null,
    };
  },
  computed: {
    selectedWalletAddress() { return this.$route.query.wallet as string; },
    accessToken() { return this.$route.params.access_token as string; },
    isAwaiting() { return this.status === 'await'; },
    isUploading() { return this.status === 'prepare' || this.status === 'upload'; },
    isFinishedUpload() { return this.status === 'uploaded'; },
    disabledButton() { return !this.isFinishedUpload && (this.password === '' || this.isErrorPassword); },
    hintGoogleDriveText() { return this.$t('addWallet.google.dataWillStoreOnGDrive'); },
    popupMessage() { return this.$t(this.isAwaiting ? 'accounts.validatePass' : 'addWallet.google.saved'); },
    statusMessagesHeader() {
      if (this.status === 'prepare') return this.$t('googleExport.prepData');
      if (this.status === 'upload') return this.$t('googleExport.uploading');
      return '';
    },
  },
  watch: {
    password: 'invalidateRequest',
    selectedWalletAddress() { this.password = ''; this.invalidateRequest(); },
    accessToken() { this.password = ''; this.invalidateRequest(); },
  },
  beforeUnmount() { this.abandon(); },
  methods: {
    changePassword(value: string) { this.password = value; },
    invalidateRequest() {
      this.revision++;
      this.prepared = null;
      this.status = 'await';
      this.isErrorPassword = false;
      this.uploadError = false;
    },
    abandon() {
      this.active = false;
      this.password = '';
      this.invalidateRequest();
    },
    close() {
      this.abandon();
      this.$emit('closePopup');
    },
    async onConfirm() {
      if (!this.active || this.isUploading) return;
      if (this.isFinishedUpload) { this.close(); return; }
      if (this.disabledButton) return;
      const revision = ++this.revision;
      const password = this.password;
      const address = this.selectedWalletAddress;
      const token = this.accessToken;
      const ownsRequest = () => this.active && this.revision === revision && this.password === password &&
        this.selectedWalletAddress === address && this.accessToken === token;
      this.status = 'prepare';
      this.uploadError = false;
      try {
        const valid = await validatePassword(password);
        if (!ownsRequest()) return;
        if (!valid) { this.status = 'await'; this.isErrorPassword = true; return; }
        let prepared = this.prepared;
        if (!prepared) {
          const { json: primary } = await exportJSON(address, password);
          if (!ownsRequest()) return;
          const linkedAddress = primary.meta.ethereumAddress as string | undefined;
          const linked = linkedAddress && linkedAddress.toLowerCase() !== primary.address.toLowerCase()
            ? (await exportJSON(linkedAddress, password)).json : undefined;
          if (!ownsRequest()) return;
          prepared = { primary, linked };
          this.prepared = prepared;
        }
        this.status = 'upload';
        if (prepared.linked && !prepared.linkedFileId) {
          const id = await this.createFile(JSON.stringify(prepared.linked), this.prepUploadMeta(prepared.linked), token);
          if (!ownsRequest()) return;
          // Keep acknowledged partial progress for an explicit retry. The child
          // remains an independently restorable encrypted file if the parent fails.
          prepared.linkedFileId = id;
        }
        await this.createFile(JSON.stringify(prepared.primary), this.prepUploadMeta(prepared.primary, prepared.linkedFileId), token);
        if (ownsRequest()) this.status = 'uploaded';
      } catch {
        if (ownsRequest()) { this.status = 'await'; this.uploadError = true; }
      }
    },
    prepUploadMeta(json: KeyringPair$Json, linkedFileId?: string) {
      return {
        name: typeof json.meta.name === 'string' ? json.meta.name : '',
        address: linkedFileId ? `${json.address}/${linkedFileId}` : json.address,
      };
    },
    async createFile(json: string, options: ICreateFile['options'], token: string) {
      const response = await createGoogleFile({ json, options, token });
      if (typeof response?.id !== 'string' || !response.id.trim()) throw new Error('Missing Google Drive file identifier');
      return response.id;
    },
  },
});
</script>

<style lang="scss" scoped>
.popup-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 25px;
  min-height: 175px;

  .upload-error {
    max-width: 100%;
    overflow-wrap: anywhere;
  }

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
