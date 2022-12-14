<template>
  <Popup headerType="success" sizeWidth="big" :handlerClose="closePopup" :zIndex="399">
    <div class="popup-content">
      <template v-if="!isFileUploading">
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

      <Loader v-if="isFileUploading" />

      <span v-if="isFileUploaded" class="descriptions">{{ $t('wallet.googleExportSuccess') }}</span>

      <Button
        v-if="!isFileUploading"
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
import { createGoogleFile } from '@/extension/messaging';
import BaseApi from '@/util/BaseApi';

@Component
export default class GoogleExportPopup extends Vue {
  password = '';
  isErrorPassword = false;
  isFileUploaded = false;
  isFileUploading = false;

  @Prop(Function) closePopup!: VoidFunction;

  get selectedWallet() {
    return this.$route.query.wallet as string;
  }

  get isAwaitsConfirmation() {
    return !this.isFileUploaded && !this.isFileUploading;
  }

  get disabledButton() {
    return this.password === '' || this.isErrorPassword;
  }

  get hintGoogleDriveText() {
    return this.$t('addWallet.google.dataWillStoreOnGDrive');
  }

  get getIconName() {
    return this.isFileUploaded ? 'check' : 'lock-green';
  }

  get popupMessage() {
    if (this.isAwaitsConfirmation) return this.$t('accounts.validatePass');

    return this.$t('addWallet.google.saved');
  }

  @Watch('password')
  resetStatusError() {
    this.isErrorPassword = false;
  }

  async onConfirm() {
    if (this.isFileUploaded) {
      this.closePopup();

      return;
    }

    const pair = BaseApi.getPair(this.selectedWallet);

    try {
      pair.toJson(this.password);
    } catch {
      this.isErrorPassword = true;

      return;
    }

    this.isFileUploading = true;

    const ethJson = await createGoogleFile({
      json: JSON.stringify(BaseApi.getPair(pair.meta.ethereumAddress as string).toJson(this.password)),
      options: {
        name: pair.meta.name as string,
        address: pair.meta.ethereumAddress as string,
        password: this.password,
      },
      token: this.$route.params.access_token,
    });

    const substrateJson = await createGoogleFile({
      json: JSON.stringify(pair.toJson(this.password)),
      options: {
        name: pair.meta.name as string,
        address: `${pair.address}/${ethJson.id}`,
        password: this.password,
      },
      token: this.$route.params.access_token,
    });

    this.isFileUploading = false;

    if (ethJson.id && substrateJson.id) this.isFileUploaded = true;
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
