<template>
  <Popup
    headerType="success"
    sizeWidth="big"
    :headerText="statusMessagesHeader"
    :zIndex="399"
    :showBorder="true"
    @handlerClose="$emit('closePopup')"
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

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { AccountJson } from '@extension-base/background/types/types';
import type { KeyringPair$Json } from '@polkadot/keyring/types';
import { createGoogleFile, exportAccountJSON, validatePassword } from '@/extension/messaging';
import { type ICreateFile } from '@/interfaces';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

@Component
export default class GoogleExportPopup extends Vue {
  password = '';
  isErrorPassword = false;
  status: 'prepare' | 'upload' | 'uploaded' | 'await' = 'await';

  @Getter(AccountsGettersTypes.getAccounts) accounts!: AccountJson[];

  get selectedWalletAddress() {
    return this.$route.query.wallet as string;
  }

  get isAwaiting() {
    return this.status === 'await';
  }

  get isUploading() {
    return this.status === 'prepare' || this.status === 'upload';
  }

  get isFinishedUpload() {
    return this.status === 'uploaded';
  }

  get disabledButton() {
    if (this.isFinishedUpload) return false;

    return this.password === '' || this.isErrorPassword;
  }

  get hintGoogleDriveText() {
    return this.$t('addWallet.google.dataWillStoreOnGDrive');
  }

  get popupMessage() {
    if (this.status === 'await') return this.$t('accounts.validatePass');

    return this.$t('addWallet.google.saved');
  }

  get statusMessagesHeader() {
    if (this.status === 'prepare') return this.$t('googleExport.prepData');
    if (this.status === 'upload') return this.$t('googleExport.uploading');

    return '';
  }

  changePassword(value: string) {
    this.password = value;
  }

  @Watch('password')
  resetStatusError() {
    this.isErrorPassword = false;
  }

  async onConfirm() {
    if (this.isFinishedUpload) {
      this.$emit('closePopup');

      return;
    }

    this.status = 'prepare';

    const isValid = await validatePassword(this.selectedWalletAddress, this.password);

    if (!isValid) {
      this.status = 'await';
      this.isErrorPassword = true;

      return;
    }

    let ethWalletId;
    let substrateWalletId;
    const { json: substrateJson } = await exportAccountJSON(this.selectedWalletAddress, this.password);
    const isEthereumAddress = !!substrateJson.meta.ethereumAddress;
    const stringifyJson = JSON.stringify(substrateJson);

    this.status = 'upload';

    if (isEthereumAddress) {
      const { json: ethereumJson } = await exportAccountJSON(
        substrateJson.meta.ethereumAddress as string,
        this.password
      );

      const ethOptions = this.prepUploadMeta(substrateJson);
      ethWalletId = await this.createFile(JSON.stringify(ethereumJson), ethOptions);

      const substrateOptions = this.prepUploadMeta(substrateJson, ethWalletId);
      substrateWalletId = await this.createFile(stringifyJson, substrateOptions);
    } else {
      const substrateOptions = this.prepUploadMeta(substrateJson);
      substrateWalletId = await this.createFile(stringifyJson, substrateOptions);
    }

    this.status = substrateWalletId ? 'uploaded' : 'await';
  }

  prepUploadMeta(json: KeyringPair$Json, ethWalletId?: string): ICreateFile['options'] {
    return {
      name: json.meta.name as string,
      address: ethWalletId ? `${json.address}/${ethWalletId}` : (json.meta.ethereumAddress as string) ?? '',
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
    font-size: 1.25em;
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
