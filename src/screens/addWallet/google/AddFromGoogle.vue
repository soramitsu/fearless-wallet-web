<template>
  <FlowStepLayout
    :countSteps="countSteps"
    :step="step"
    :flowSteps="getSteps"
    :header="header"
    @back="back"
    :isLoading="isLoading"
    :showFullScreenIcon="false"
  >
    <NegativeMessage v-if="isAccessDenied" :message="$t('addWallet.google.somethingWrong')" />

    <GoogleWalletsList v-else-if="haveWalletsToImport" :items="files" @getFile="getFile" />

    <template v-slot:control>
      <Button
        v-if="!isLoading"
        size="big"
        fontSize="big"
        :disabled="isImportInProgress"
        width="100%"
        :text="buttonText"
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
  ethereumRawSeed: any;

  get isAccessDenied() {
    return this.getToken === 'null';
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

  get header() {
    if (this.getToken === 'null') return this.$t('addWallet.google.accessDenied');
    if (this.isFinishForm) return this.$t('');

    return this.isLoading ? this.$t('addWallet.google.fetchInfo') : this.$t('addWallet.google.selectToImport');
  }

  async mounted() {
    await this.isTokenValid();
    this.token = this.getToken;
    const { files } = await getGoogleFiles(this.token);

    if (files.length === 0) {
      this.$router.push({
        name: Components.CreateGoogle,
        params: {
          access_token: this.$route.params.access_token,
        },
      });
      this.isLoading = false;

      return;
    }

    files.forEach(({ id, description, name }) => {
      const [prepName] = name.split('.');
      const [address, ethID] = description.split('/');
      if (ethID === undefined) return;

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

  back() {
    if (this.step === 1) {
      this.$router.push({ name: Components.Welcome });

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
      this.$router.replace('/');
      this.$router.push({ name: Components.Wallet });

      return;
    }

    this.step += 1;
  }

  setItemValue(index: number, data: Record<string, unknown>) {
    this.$set(this.files, index, { ...this.files[index], ...data });
  }

  async isTokenValid() {
    if (this.getToken === 'null') {
      this.isLoading = false;

      return;
    }

    const data = await verifyToken(this.getToken);

    if (!data || +data.expires_in <= 0) {
      this.$router.push({ name: Components.Welcome });
      this.isLoading = false;

      return;
    }
  }
}
</script>

<style lang="scss" scoped>
.add-wallet-button {
  margin-bottom: 10px;
}
</style>
