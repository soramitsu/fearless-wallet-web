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

<script lang="ts">
import { defineComponent } from 'vue';

import BackupWalletsList from '@/screens/addWallet/BackupWalletsList.vue';
import { getGoogleFile, getGoogleFiles, verifyToken } from '@/extension/messaging';
import { Components } from '@/router/routes';
import FlowStepLayout from '@/screens/addWallet/google/FlowStepLayout.vue';
import NegativeMessage from '@/screens/addWallet/google/NegativeMessage.vue';
import { ETHEREUM_ADDRESS_PREFIX } from '@/consts/networks';

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
      return this.step === 2 ? this.$t('common.finish') : this.$t('common.continue');
    },
    isActiveNotComplete() {
      return this.files.some(({ active, isComplete }) => active && !isComplete);
    },
    importAcquired() {
      return this.files.every(({ isComplete }) => !isComplete);
    },
    isAllowedContinue() {
      return this.isImportInProgress || this.isActiveNotComplete || this.importAcquired;
    },
    header() {
      if (this.isAccessDenied) return this.$t('addWallet.google.accessDenied');

          if (this.isFinishForm) return this.$t('');

          return this.isLoading ? this.$t('addWallet.google.fetchInfo') : this.$t('addWallet.google.selectToImport');
    },
  },
  async mounted() {
    const isValidToken = await this.isTokenValid();

        if (!isValidToken) return;

        const { files } = await getGoogleFiles(this.token);

        const jsonsWithoutEth = files.filter((el) => el.description === '' || el.description === 'undefined');
        const regex = /\w+\/\w+/;
        const filterFiles = files.filter((el) => el && regex.test(el.description));
        const filesToImport = [...filterFiles, ...jsonsWithoutEth];

        if (filesToImport.length === 0) {
          this.$router.push({
            name: Components.CreateGoogle,
            params: {
              access_token: this.$route.params.access_token,
            },
          });

          this.isLoading = false;

          return;
        }

        filesToImport.forEach(({ id, description, name }) => {
          const [prepName] = name.split('.');

          const [address, ethID] = description.split('/');

          this.files.push({
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

        this.isLoading = false;
  },
  methods: {
    goBack() {
      this.$router.replace('/').catch((e) => e);
          this.$router.push({ name: Components.Wallet }).catch((e) => e);
    },
    back() {
      if (this.step === 1) {
            this.goBack();

            return;
          }

          this.step -= 1;
    },
    async getFile(id: string, key: number) {
      const file = await getGoogleFile(id, this.token);

          if (file.address.startsWith(ETHEREUM_ADDRESS_PREFIX)) this.setItemValue(key, { ethJson: file });
          else this.setItemValue(key, { json: file });
    },
    proceed() {
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
    async isTokenValid() {
      if (this.token === 'null') {
            this.isLoading = false;

            return false;
          }

          const data = await verifyToken(this.token);

          if (data === null || +data.expires_in <= 0) {
            this.tokenValidation = 'invalid';
            this.isLoading = false;

            return false;
          }

          this.tokenValidation = 'valid';

          return true;
    },
  },
});
</script>

<style lang="scss" scoped>
.add-wallet-button {
  margin-bottom: 10px;
}
</style>
