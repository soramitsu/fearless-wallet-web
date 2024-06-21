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

    <GoogleWalletsList
      v-else-if="haveWalletsToImport"
      :items="files"
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
import { Component, Vue } from 'vue-property-decorator';
import type { FilesState } from '@/interfaces';
import GoogleWalletsList from '@/screens/addWallet/google/GoogleWalletsList.vue';
import { getGoogleFile, getGoogleFiles, verifyToken } from '@/extension/messaging';
import { Components } from '@/router/routes';
import FlowStepLayout from '@/screens/addWallet/google/FlowStepLayout.vue';
import NegativeMessage from '@/screens/addWallet/google/NegativeMessage.vue';
import { ETHEREUM_ADDRESS_PREFIX } from '@/consts/networks';

@Component({
  components: {
    FlowStepLayout,
    NegativeMessage,
    GoogleWalletsList,
  },
})
export default class AddFromGoogle extends Vue {
  readonly countSteps = 2;
  files: FilesState[] = [];
  isLoading = true;
  step = 1;
  token = '';
  tokenValidation: 'pending' | 'valid' | 'invalid' = 'pending';

  get isAccessDenied() {
    return this.getToken === 'null' || this.tokenValidation === 'invalid';
  }

  get isFinishForm() {
    return this.step === this.countSteps;
  }

  get getSteps() {
    return this.isLoading ? [] : [1, 2];
  }

  get isImportInProgress() {
    return this.files.some((el) => el.isLoading);
  }

  get getToken() {
    return this.$route.params.access_token;
  }

  get isFilesExists() {
    return this.files.length;
  }

  get haveWalletsToImport() {
    return !this.isLoading && this.isFilesExists;
  }

  get buttonText() {
    return this.step === 2 ? this.$t('common.finish') : this.$t('common.continue');
  }

  get isActiveNotComplete() {
    return this.files.some((el) => el.active && !el.isComplete);
  }

  get importAcquired() {
    return this.files.every((el) => !el.isComplete);
  }

  get isAllowedContinue() {
    return this.isImportInProgress || this.isActiveNotComplete || this.importAcquired;
  }

  get header() {
    if (this.isAccessDenied) return this.$t('addWallet.google.accessDenied');
    if (this.isFinishForm) return this.$t('');

    return this.isLoading ? this.$t('addWallet.google.fetchInfo') : this.$t('addWallet.google.selectToImport');
  }

  async mounted() {
    const isValidToken = await this.isTokenValid();

    if (!isValidToken) return;

    this.token = this.getToken;
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
  }

  goBack() {
    this.$router.replace('/').catch((e) => e);
    this.$router.push({ name: Components.Wallet }).catch((e) => e);
  }

  back() {
    if (this.step === 1) {
      this.goBack();

      return;
    }

    this.step -= 1;
  }

  async getFile(id: string, key: number) {
    const file = await getGoogleFile(id, this.token);

    file.address.startsWith(ETHEREUM_ADDRESS_PREFIX)
      ? this.setItemValue(key, { ethJson: file })
      : this.setItemValue(key, { json: file });
  }

  proceed() {
    if (this.isFinishForm || this.isAccessDenied) {
      this.goBack();

      return;
    }

    this.step += 1;
  }

  setItemValue(index: number, data: Record<string, unknown>) {
    this.$set(this.files, index, { ...this.files[index], ...data });
  }

  setItemPassword(index: number, password: string) {
    this.$set(this.files, index, { ...this.files[index], password });
  }

  async isTokenValid() {
    if (this.getToken === 'null') {
      this.isLoading = false;

      return false;
    }

    const data = await verifyToken(this.getToken);

    if (data === null || +data.expires_in <= 0) {
      this.tokenValidation = 'invalid';
      this.isLoading = false;

      return false;
    }

    this.tokenValidation = 'valid';

    return true;
  }
}
</script>

<style lang="scss" scoped>
.add-wallet-button {
  margin-bottom: 10px;
}
</style>
