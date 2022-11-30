<template>
  <div class="welcome-page">
    <div>
      <div class="back-wallet-container">
        <CircleButton
          v-if="showBackWalletIcon"
          backgroundColor="light-black"
          iconName="chevron-left"
          @click="backWallet"
        />
      </div>

      <Logo class="description" size="big" text="Fearless Wallet" :subtext="$t('welcome.deFiWallet')" />
    </div>

    <div>
      <Button
        width="100%"
        class="create-button"
        size="big"
        fontSize="big"
        :text="$t('welcome.createWallet')"
        @click="openAddWalletComponent('create')"
      />

      <Button
        class="import-button"
        width="100%"
        size="big"
        fontSize="big"
        type="google"
        :text="$t('welcome.manageGoogle')"
        :border="false"
        @click="manageGoogle"
      />
      <div class="additional-options">
        <Button
          class="import-button"
          size="big"
          fontSize="big"
          type="secondary"
          :text="$t('welcome.connectMobile')"
          :border="false"
          @click="openAddWalletMobile"
        />

        <Button
          class="import-button"
          size="big"
          fontSize="big"
          type="secondary"
          :text="$t('welcome.importWallet')"
          :border="false"
          @click="openAddWalletComponent('import')"
        />
      </div>
      <div class="privacy-policy">
        {{ $t('welcome.agreeWith') }}

        <span class="important-text" @click="openTermsAndConditions">
          {{ $t('header.settings.about.termsConditions') }}
        </span>

        {{ $t('welcome.and') }}

        <span class="important-text" @click="openPrivacyPolicy"> {{ $t('header.settings.about.privacyPolicy') }}</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Logo from '@/components/Logo.vue';
import Icon from '@/components/Icon.vue';
import Button from '@/components/Button.vue';
import CircleButton from '@/components/CircleButton.vue';
import BaseApi from '@/util/BaseApi';
import URLS from '@/consts/urls';
import AboveForm from '@/components/AboveForm.vue';
import MobileConnect from '@/screens/mobileConnect/MobileConnect.vue';
import { initGoogleAuth } from '@/extension/messaging';
import { Components } from '@/router/routes';
import { googleManage } from '@/controllers/googleController';

@Component({
  components: {
    Logo,
    Icon,
    Button,
    CircleButton,
    MobileConnect,
    AboveForm,
  },
})
export default class Welcome extends Vue {
  showGoogleAuthPopup = false;

  created() {
    if (this.accessToken) this.showGoogleAuthPopup = true;
  }

  get showBackWalletIcon() {
    return BaseApi.getAccounts().length !== 0 || BaseApi.getAddresses().length !== 0;
  }

  get accessToken() {
    return this.$route.params.access_token;
  }

  manageGoogle() {
    if (BaseApi.isExtension()) initGoogleAuth();
    else googleManage.authDesktop();
  }

  closeGooglePopup() {
    this.showGoogleAuthPopup = false;
  }

  openTermsAndConditions() {
    window.open(URLS.TERMS);
  }

  openPrivacyPolicy() {
    window.open(URLS.PRIVACY);
  }

  backWallet() {
    this.$router.push({ name: Components.Wallet });
  }

  openAddWalletComponent(type: string) {
    this.$router.push({ name: Components.AddWallet, params: { type } });
  }

  openAddWalletMobile() {
    this.$router.push({ name: Components.MobileConnect });
  }
}
</script>

<style lang="scss" scoped>
.welcome-page {
  display: flex;
  flex-direction: column;
  height: $default-height-page;
  justify-content: space-between;

  .back-wallet-container {
    height: 32px;
  }

  .description {
    margin-top: 69px;
  }

  .privacy-policy {
    margin-top: 17px;
    font-size: 12px;
    font-weight: 400;
    line-height: 16px;
    color: $grayish-white;

    .important-text {
      color: rgb(199, 31, 95);

      &:hover {
        cursor: pointer;
      }
    }
  }

  .import-button {
    margin-top: 10px;
  }

  .additional-options {
    display: flex;
    gap: 10px;
  }
}
</style>
