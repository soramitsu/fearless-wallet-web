<template>
  <Popup
    headerType="success"
    sizeWidth="big"
    :headerText="statusMessagesHeader"
    :handlerClose="closePopup"
    :zIndex="399"
  >
    <div class="popup-content">
      <template v-if="isAwaiting">
        <Icon :icon="getIconName" className="icon__lock-green" iconColor="success" />

        <div class="text row">{{ popupMessage }}</div>
      </template>

      <template v-if="isAwaitsConfirmation">
        <ValidatedInput
          v-if="isAwaitsConfirmation"
          v-model="password"
          placeholder="common.password"
          size="big"
          class="password-input row"
          errorDescriptions="common.invalidPassword"
          :isError="isErrorPassword"
          :showPassword="true"
        />

        <Hint class="hint" iconName="notification" :text="hintGoogleDriveText" />
      </template>

      <Loader v-if="isUploading" />

      <span v-if="isFinishedUpload" class="descriptions">{{ $t('wallet.googleExportSuccess') }}</span>

      <Button
        v-if="isAwaiting"
        text="common.confirm"
        width="100%"
        size="medium"
        fontSize="big"
        type="primary"
        :disabled="disabledButton"
        :border="false"
        @click="onConfirm"
      />
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import type { KeyringPair } from '@polkadot/keyring/types';
import { createGoogleFile, exportAccount, validateAccount } from '@/extension/messaging';
import BaseApi from '@/util/BaseApi';
import { ICreateFile } from '@/interfaces';

@Component
export default class GoogleExportPopup extends Vue {
  password = '';
  isErrorPassword = false;

  status: 'prepare' | 'upload' | 'uploaded' | 'await' = 'await';
  @Prop(Function) closePopup!: VoidFunction;

  get selectedWallet() {
    return this.$route.query.wallet as string;
  }

  get isAwaiting() {
    return this.status === 'await' || this.status === 'uploaded';
  }

  get isUploading() {
    return this.status === 'prepare' || this.status === 'upload';
  }

  get isFinishedUpload() {
    return this.status === 'uploaded';
  }

  get isAwaitsConfirmation() {
    return this.status === 'await';
  }

  get disabledButton() {
    return this.password === '' || this.isErrorPassword;
  }

  get hintGoogleDriveText() {
    return this.$t('addWallet.google.dataWillStoreOnGDrive');
  }

  get getIconName() {
    return this.status === 'uploaded' ? 'check' : 'lock-green';
  }

  get popupMessage() {
    if (this.status === 'await') return this.$t('accounts.validatePass');

    return this.$t('addWallet.google.saved');
  }

  @Watch('password')
  resetStatusError() {
    this.isErrorPassword = false;
  }

  async onConfirm() {
    if (this.status === 'uploaded') {
      this.closePopup();

      return;
    }

    this.status = 'prepare';

    const isValid = await validateAccount(this.selectedWallet, this.password);

    if (!isValid) {
      this.status = 'await';
      this.isErrorPassword = true;

      return;
    }

    const pair = BaseApi.getPair(this.selectedWallet);

    const ethPair = BaseApi.getPair(pair.meta.ethereumAddress as string);
    const ethJson = ethPair.toJson(this.password);
    const substrateJson = (await exportAccount(pair.address, this.password)).exportedJson;
    const ethOptions = this.prepUploadMeta(ethPair);

    this.status = 'upload';

    const ethWalletId = await this.createFile(JSON.stringify(ethJson), ethOptions);

    if (!ethWalletId) return;

    const substrateOptions = this.prepUploadMeta(pair, ethWalletId);
    const substrateWalletId = await this.createFile(JSON.stringify(substrateJson), substrateOptions);

    if (ethWalletId && substrateWalletId) this.status = 'uploaded';
  }

  get statusMessagesHeader() {
    if (this.status === 'prepare') return this.$t('googleExport.prepData');
    if (this.status === 'upload') return this.$t('googleExport.uploading');

    return '';
  }

  prepUploadMeta(pair: KeyringPair, ethWalletId?: string): ICreateFile['options'] {
    return {
      name: pair.meta.name as string,
      address: ethWalletId ? `${pair.address}/${ethWalletId}` : (pair.meta.ethereumAddress as string),
      password: this.password,
    };
  }

  async createFile(json: string, options: ICreateFile['options']): Promise<string> {
    const res = await createGoogleFile({
      json,
      options,
      token: this.$route.params.access_token,
    });

    return res.id;
  }
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

  .icon__lock-green {
    width: 30px;
    height: 30px;
  }

  .text {
    font-weight: 700;
    font-size: 18px;
    width: 250px;
  }

  .row {
    margin-top: 15px;
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
      color: rgba(255, 255, 255, 0.3);
      font-size: 30px !important;
      margin: 0 10px;
    }
  }

  .transfer-amount {
    font-weight: 800;
    font-size: 20px;
    margin-bottom: 10px;
  }

  .transfer-value {
    font-size: 16px;
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
