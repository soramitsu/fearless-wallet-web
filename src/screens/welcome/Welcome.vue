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

      <Logo class="description" size="big" text="common.fearlessWallet" :subtext="$t('welcome.deFiWallet')" />
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

      <div class="additional-options">
        <Button
          class="import-button button--content-wrap"
          size="big"
          width="169px"
          fontSize="big"
          type="secondary"
          iconName="connectMobile"
          iconType="big"
          :text="$t('welcome.connectMobile')"
          :border="false"
          @click="openAddWalletMobile"
        />

        <Button
          class="import-button button--content-wrap"
          size="big"
          width="169px"
          fontSize="big"
          type="secondary"
          iconName="googleManage"
          iconType="big"
          :text="$t('welcome.manageGoogle')"
          :border="false"
          @click="manageGoogle"
        />

        <Button
          class="import-button button--content-wrap"
          size="big"
          fontSize="big"
          width="169px"
          type="secondary"
          iconName="importButton"
          iconType="big"
          :text="$t('welcome.importWallet')"
          :border="false"
          @click="openAddWalletComponent('import')"
        />
      </div>

      <div class="privacy-policy">
        {{ $t('welcome.agreeWith') }}

        <span class="important-text" @click="openTermsAndConditions">
          {{ $t('common.termsConditions') }}
        </span>

        {{ $t('common.and') }}

        <span class="important-text" @click="openPrivacyPolicy"> {{ $t('common.privacyPolicy') }}</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { Components } from '@/router/routes';
import BaseApi from '@/util/BaseApi';
import URLS from '@/consts/urls';
import MobileConnect from '@/screens/mobileConnect/MobileConnect.vue';
import { initGoogleAuth } from '@/extension/messaging';
import { AccountJson } from '@/extension/background/extension-base/src/background/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

@Component({
  components: { MobileConnect },
})
export default class Welcome extends Vue {
  showGoogleAuthPopup = false;
  @Getter(AccountsGettersTypes.getAccounts) accounts!: AccountJson[];

  get showBackWalletIcon() {
    return this.accounts.length !== 0;
  }

  get accessToken() {
    return this.$route.params.access_token;
  }

  created() {
    if (this.accessToken) this.showGoogleAuthPopup = true;
  }

  manageGoogle() {
    if (BaseApi.isExtension()) initGoogleAuth();
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
  min-height: 561px;
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

  .button--icon {
    width: 32px;
    height: 32px;
  }

  .button--content-wrap {
    flex-grow: 1;
  }

  .button__icon--big {
    width: 32px;
    height: 32px;
  }

  .additional-options {
    display: flex;
    font-size: 14px;
    line-height: 18px;
    gap: 10px;
  }
}
</style>
