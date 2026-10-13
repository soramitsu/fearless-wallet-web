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
    <NegativeMessage v-if="isAccessDenied || loadError" :message="$t('addWallet.google.somethingWrong')" />

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

<script lang="ts">
import { defineComponent } from 'vue';

import BackupWalletsList from '@/screens/addWallet/BackupWalletsList.vue';
import { getGoogleFile, getGoogleFiles, verifyToken } from '@/extension/messaging';
import { Components } from '@/router/routes';
import FlowStepLayout from '@/screens/addWallet/google/FlowStepLayout.vue';
import NegativeMessage from '@/screens/addWallet/google/NegativeMessage.vue';

export default defineComponent({ name: 'AddFromGoogle',
  components: {
    FlowStepLayout,
    NegativeMessage,
    BackupWalletsList,
  },
  data() {
    return {
      countSteps: 2,
      files: [],
      isLoading: true,
      step: 1,
      tokenValidation: 'pending',
      isActive: true,
      loadError: false,
      loadRevision: 0,
      fileRequests: new Map<string, string>(),
    };
  },
  computed: {
    isAccessDenied() {
      return this.token === 'null' || this.tokenValidation === 'invalid';
    },
    isFinishForm() {
      return this.step === this.countSteps;
    },
    getSteps() {
      return this.isLoading ? [] : [1, 2];
    },
    isImportInProgress() {
      return this.files.some((el) => el.isLoading);
    },
    token() {
      return this.$route.params.access_token;
    },
    isFilesExists() {
      return this.files.length;
    },
    haveWalletsToImport() {
      return !this.isLoading && this.isFilesExists;
    },
    buttonText() {
      if (this.loadError) return this.$t('ux.retry');
      if (this.isAccessDenied) return this.$t('common.finish');
      return this.step === 2 ? this.$t('common.finish') : this.$t('common.continue');
    },
    isActiveNotComplete() {
      return this.files.some(({ active, isComplete }) => active && !isComplete);
    },
    importAcquired() {
      return this.files.every(({ isComplete }) => !isComplete);
    },
    isAllowedContinue() {
      if (this.loadError || this.isAccessDenied) return false;
      return this.isImportInProgress || this.isActiveNotComplete || this.importAcquired;
    },
    header() {
      if (this.isAccessDenied) return this.$t('addWallet.google.accessDenied');

          if (this.isFinishForm) return this.$t('');

          return this.isLoading ? this.$t('addWallet.google.fetchInfo') : this.$t('addWallet.google.selectToImport');
    },
  },
  beforeUnmount() {
    this.isActive = false;
    this.loadRevision++;
    this.fileRequests.clear();
  },
  watch: {
    token() { void this.loadBackups(); },
  },
  async mounted() { await this.loadBackups(); },
  methods: {
    async loadBackups() {
      if (!this.isActive) return;
      const revision = ++this.loadRevision;
      const token = this.token;
      const current = () => this.isActive && this.loadRevision === revision && this.token === token;
      this.files = [];
      this.fileRequests.clear();
      this.isLoading = true;
      this.loadError = false;
      this.tokenValidation = 'pending';
      try {
        const data = token && token !== 'null' ? await verifyToken(token) : null;
        if (!current()) return;
        if (!data || !Number.isFinite(+data.expires_in) || +data.expires_in <= 0) {
          this.tokenValidation = 'invalid';
          return;
        }
        this.tokenValidation = 'valid';
        const { files } = await getGoogleFiles(token);
        if (!current()) return;
        if (!Array.isArray(files)) throw new Error('Invalid Google Drive inventory');
        if (files.length === 0) {
          await this.$router.push({ name: Components.CreateGoogle, params: { access_token: token } });
          return;
        }
        // Descriptions are metadata, not authority to hide encrypted files. Keep
        // standalone keys and children from interrupted backups reachable too.
        this.files = files.map(({ id, description, name }) => {
          const parts = typeof description === 'string' ? description.split('/') : [];
          return {
            id, name: typeof name === 'string' ? name.replace(/\.json$/i, '') : id, address: parts[0] ?? '',
            ethWalletID: parts.length === 2 && parts[1] && parts[1] !== id ? parts[1] : undefined,
            isComplete: false, isLoading: false, isError: false, password: '', active: false,
          };
        });
      } catch { if (current()) this.loadError = true; }
      finally { if (current()) this.isLoading = false; }
    },
    goBack() {
      this.$router.replace({ name: Components.Wallet, params: { access_token: '' } }).catch((e) => e);
    },
    back() {
      if (this.step === 1) {
            this.goBack();

            return;
          }

          this.step -= 1;
    },
    async getFile(id: string, key: number) {
      const row = this.files[key];
      const token = this.token;
      const revision = this.loadRevision;
      if (!this.isActive || !row || !id || (id !== row.id && id !== row.ethWalletID)) return;
      const requestKey = JSON.stringify([revision, row.id, id]);
      if (this.fileRequests.has(requestKey)) return;
      this.fileRequests.set(requestKey, row.id);
      const currentIndex = () => this.isActive && this.token === token && this.loadRevision === revision ? this.files.findIndex((file) =>
        file.id === row.id && file.address === row.address && file.ethWalletID === row.ethWalletID) : -1;
      this.setItemValue(key, { isFileLoading: true, fileLoadError: false });
      try {
        const file = await getGoogleFile(id, token);
        const index = currentIndex();
        if (index < 0) return;
        // The requested file ID determines its role, including an EVM-only primary backup.
        this.setItemValue(index, id === row.id ? { json: file } : { ethJson: file });
      } catch {
        const index = currentIndex();
        if (index >= 0) this.setItemValue(index, { fileLoadError: true });
      } finally {
        this.fileRequests.delete(requestKey);
        const index = currentIndex();
        if (index >= 0) this.setItemValue(index, {
          isFileLoading: [...this.fileRequests.values()].some((owner) => owner === row.id),
        });
      }
    },
    async proceed() {
      if (this.loadError) { await this.loadBackups(); return; }
      if (this.isFinishForm || this.isAccessDenied) {
            this.goBack();

            return;
          }

          this.step += 1;
    },
    setItemValue(index: number, data: Record<string, unknown>) {
      this.files[index] = { ...this.files[index], ...data };
    },
    setItemPassword(index: number, password: string) {
      this.files[index] = { ...this.files[index], password };
    },

  },
});
</script>

<style lang="scss" scoped>
.add-wallet-button {
  margin-bottom: 10px;
}
</style>
