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
import { Getter } from 'vuex-class';
import type { KeyringPair$Json } from '@polkadot/keyring/types';
import { createGoogleFile, exportAccount, validateAccount } from '@/extension/messaging';
import { ICreateFile } from '@/interfaces';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { AccountJson } from '@/extension/background/extension-base/src/background/types/types';

@Component
export default class GoogleExportPopup extends Vue {
  password = '';
  isErrorPassword = false;
  @Getter(AccountsGettersTypes.getAccounts) accounts!: AccountJson[];

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

    let ethWalletId;
    let substrateWalletId;
    const { exportedJson: substrateJson } = await exportAccount(this.selectedWallet, this.password);
    const isEthereumAddress = substrateJson.meta.ethereumAddress;
    this.status = 'upload';

    if (isEthereumAddress) {
      const { exportedJson: ethereumJson } = await exportAccount(
        substrateJson.meta.ethereumAddress as string,
        this.password
      );
      const ethOptions = this.prepUploadMeta(substrateJson);
      ethWalletId = await this.createFile(JSON.stringify(ethereumJson), ethOptions);
      const substrateOptions = this.prepUploadMeta(ethereumJson, ethWalletId);
      substrateWalletId = await this.createFile(JSON.stringify(substrateJson), substrateOptions);
    } else {
      const substrateOptions = this.prepUploadMeta(substrateJson);
      substrateWalletId = await this.createFile(JSON.stringify(substrateJson), substrateOptions);
    }

    this.status = substrateWalletId ? 'uploaded' : 'await';
  }

  get statusMessagesHeader() {
    if (this.status === 'prepare') return this.$t('googleExport.prepData');
    if (this.status === 'upload') return this.$t('googleExport.uploading');

    return '';
  }

  prepUploadMeta(json: KeyringPair$Json, ethWalletId?: string): ICreateFile['options'] {
    return {
      name: json.meta.name as string,
      address: ethWalletId ? `${json.address}/${ethWalletId}` : (json.meta.ethereumAddress as string),
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
