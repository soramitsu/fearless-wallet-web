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
      <Button v-if="!isLoading" size="big" fontSize="big" width="100%" :text="buttonText" @click="proceed" />
    </template>
  </FlowStepLayout>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import type { KeyringPair$Json } from '@polkadot/keyring/types';
import Checkbox from '@/components/Checkbox.vue';
import Input from '@/components/Input.vue';
import Scroll from '@/components/Scroll.vue';
import GoogleWalletsList from '@/screens/addWallet/google/GoogleWalletsList.vue';
import { getGoogleFile, getGoogleFiles, verifyToken } from '@/extension/messaging';
import { IGDriveFile } from '@/interfaces';
import { Components } from '@/router/routes';
import CircleButton from '@/components/CircleButton.vue';
import FlowStepLayout from '@/screens/addWallet/google/FlowStepLayout.vue';
import Button from '@/components/Button.vue';
import BaseApi from '@/util/BaseApi';
import NegativeMessage from '@/screens/addWallet/google/NegativeMessage.vue';

interface FilesState extends IGDriveFile {
  active?: boolean;
  password?: string;
  json?: KeyringPair$Json;
}

@Component({
  components: {
    FlowStepLayout,
    Scroll,
    Input,
    NegativeMessage,
    Button,
    CircleButton,
    GoogleWalletsList,
    Checkbox,
  },
})
export default class ManageGoogle extends Vue {
  files: FilesState[] = [];
  isLoading = true;
  readonly countSteps = 2;
  step = 1;
  token = '';

  async mounted() {
    await this.isTokenValid();
    this.token = this.getToken;
    const fileResponse = await getGoogleFiles(this.token);

    if (fileResponse && fileResponse.files.length === 0) {
      this.$router.push({
        name: Components.CreateGoogle,
        params: {
          access_token: this.$route.params.access_token,
        },
      });
      this.isLoading = false;

      return;
    }

    fileResponse.files.forEach(({ id, description, name }, index) => {
      const [prepName] = name.split('.');
      this.files[index] = {
        id,
        name: prepName,
        address: description,
        password: '',
        active: false,
      };
    });

    this.isLoading = false;
  }

  get isAccessDenied() {
    return this.getToken === 'null';
  }

  get isFinishForm() {
    return this.step === this.countSteps;
  }

  get getSteps() {
    return this.isLoading ? [] : [1, 2];
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
    return this.step === 2 ? this.$t('common.finish') : this.$t('common.confirm');
  }

  get header() {
    if (this.getToken === 'null') return this.$t('addWallet.google.accessDenied');
    if (this.isFinishForm) return this.$t('');

    return this.isLoading ? this.$t('addWallet.google.fetchInfo') : this.$t('addWallet.google.selectToImport');
  }

  back() {
    if (this.step === 1) {
      this.$router.push({ name: Components.Welcome });

      return;
    }

    this.step -= 1;
  }

  async getFile(id: string, index: number) {
    const file = await getGoogleFile(id, this.token);

    this.setItemValue(index, { json: file });
  }

  proceed() {
    if (this.isFinishForm || this.isAccessDenied) {
      this.$router.push({ name: Components.Wallet });

      return;
    }

    this.step += 1;
  }

  setItemValue(index: number, data: Record<string, unknown>) {
    this.files.splice(index, 1, { ...this.files[index], ...data });
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

  saveKeypairFromJson(json: KeyringPair$Json, password: string) {
    const { address } = BaseApi.addKeypairFromJson(json, password);

    return address;
  }
}
</script>
