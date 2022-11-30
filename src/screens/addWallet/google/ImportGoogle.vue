<template>
  <FlowStepLayout
    :countSteps="countSteps"
    :step="step"
    :flowSteps="getSteps"
    :header="header"
    @back="back"
    :showFullScreenIcon="false"
    @openFullScreen="openFullScreen"
  >
    <div class="step__content">
      <NegativeMessage v-if="getToken === 'null'" :message="$t('addWallet.google.somethingWrong')" />

      <GoogleWalletsList v-else-if="!isLoading && isFilesExists" :items="files" @getFileContent="getFileContent" />

      <div v-else-if="isLoading" class="loader__container">
        <Loader />
      </div>
    </div>

    <template v-slot:control>
      <Button v-if="!isLoading" size="big" fontSize="big" width="100%" :text="$t('common.confirm')" @click="proceed" />
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
import { getGoogleFile, getGoogleFileMeta, getGoogleFiles, verifyToken } from '@/extension/messaging';
import { IGDriveFile } from '@/interfaces';
import { Components } from '@/router/routes';
import CircleButton from '@/components/CircleButton.vue';
import FlowStepLayout from '@/screens/addWallet/google/FlowStepLayout.vue';
import Button from '@/components/Button.vue';
import BaseApi from '@/util/BaseApi';
import Loader from '@/components/Loader.vue';
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
    Loader,
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

      return;
    }

    this.files = [...fileResponse.files];
    this.files.forEach((el) => {
      const [name] = el.name.split('.');
      el.active = false;
      el.name = name;
      el.password = '';
    });

    for (const [key, value] of this.files.entries()) {
      const { description } = await this.getFileMeta(value.id);

      this.setItemValue(key, { address: description });
    }

    console.log(this.files, 'files');
    this.isLoading = false;
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

  get header() {
    if (this.getToken === 'null') return this.$t('addWallet.google.accessDenied');

    return this.isLoading ? this.$t('addWallet.google.fetchInfo') : this.$t('addWallet.google.selectToImport');
  }

  back() {
    if (this.step === 1) {
      this.$router.push({ name: Components.Welcome });

      return;
    }

    this.step -= 1;
  }

  async getFileContent(id: string, index: number) {
    const file = await getGoogleFile(id, this.token);

    this.setItemValue(index, { json: file });
  }

  async getFileMeta(id: string) {
    const meta = await getGoogleFileMeta(id, this.token);

    return meta;
  }

  proceed() {
    if (this.getToken === 'null') {
      this.$router.push({ name: Components.Welcome });

      return;
    }

    if (this.step === this.countSteps) {
      this.$router.push({ name: Components.Wallet });

      return;
    }

    this.step += 1;
  }

  setItemValue(index: number, data: Record<string, unknown>) {
    this.files.splice(index, 1, { ...this.files[index], ...data });
  }

  async isTokenValid() {
    if (this.getToken === 'null') return;

    const data = await verifyToken(this.getToken);

    if (!data || +data.expires_in <= 0) {
      this.$router.push({ name: Components.Welcome });

      return;
    }
  }

  openFullScreen() {
    BaseApi.windowOpen('/');
  }

  saveKeypairFromJson(json: KeyringPair$Json, password: string) {
    const substrateJSON = { ...json };

    const { address } = BaseApi.addKeypairFromJson(substrateJSON, password);

    return address;
  }
}
</script>

<style lang="scss" scoped>
.step__content {
  height: 100%;
  width: 100%;
  display: flex;
  justify-content: center;
}

.loader__container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>
