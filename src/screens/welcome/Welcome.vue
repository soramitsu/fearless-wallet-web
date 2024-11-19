<template>
  <div class="welcome-page">
    <div>
      <div class="back-wallet-container">
        <CircleButton
          v-if="showBackWalletIcon"
          backgroundColor="light-black"
          iconName="chevron-left"
          data-testid="backBtn"
          @click="backToWallet"
        />
      </div>

      <Logo
        class="description"
        size="big"
        text="common.fearlessWallet"
        :subtext="$t('welcome.deFiWallet')"
        data-testid="headerText"
      />
    </div>

    <div>
      <FButton
        width="100%"
        class="create-button"
        size="big"
        fontSize="big"
        text="addWallet.createWallet"
        data-testid="createWalletBtn"
        @click="openAddWalletComponent('create')"
      />

      <div class="additional-options">
        <FButton
          class="import-button button--content-wrap"
          size="big"
          width="169px"
          fontSize="big"
          type="secondary"
          iconName="connectMobile"
          iconType="big"
          :text="$t('welcome.connectMobile')"
          :border="false"
          data-testid="connectMobileBtn"
          @click="openAddWalletMobile"
        />

        <FButton
          class="import-button button--content-wrap"
          size="big"
          width="169px"
          fontSize="big"
          type="secondary"
          iconName="googleManage"
          iconType="big"
          :text="$t('welcome.manageGoogle')"
          :border="false"
          data-testid="googleManageBtn"
          @click="manageGoogle"
        />

        <FButton
          class="import-button button--content-wrap"
          size="big"
          fontSize="big"
          width="169px"
          type="secondary"
          iconName="importButton"
          iconType="big"
          :text="$t('welcome.importWallet')"
          :border="false"
          data-testid="importBtn"
          @click="openAddWalletComponent('import')"
        />
      </div>

      <div class="privacy-policy" data-testid="infoPolicyText">
        {{ $t('welcome.agreeWith') }}

        <span class="important-text" data-testid="termsAndConditionsLink" @click="openTermsAndConditions">
          {{ $t('common.termsConditions') }}
        </span>

        {{ $t('common.and') }}

        <span class="important-text" data-testid="privacyPolicyLink" @click="openPrivacyPolicy">
          {{ $t('common.privacyPolicy') }}
        </span>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Components } from '@/router/routes';
import { URLS } from '@/consts/urls';
import { hasMasterPassword, initGoogleAuth } from '@/extension/messaging';
import { useAccountsStore } from '@/stores/accounts';

@Component
export default class Welcome extends Vue {
  accountsStore = useAccountsStore();

  showGoogleAuthPopup = false;
  isAuthFlowInit = false;
  hasMasterPassword = false;

  get showBackWalletIcon() {
    return this.accountsStore.accounts.length !== 0;
  }

  get accessToken() {
    return this.$route.params.access_token;
  }

  async created() {
    this.hasMasterPassword = await hasMasterPassword();

    if (this.accessToken) this.showGoogleAuthPopup = true;
  }

  closeGooglePopup() {
    this.showGoogleAuthPopup = false;
  }

  openTermsAndConditions() {
    window.open(URLS.FEARLESS_TERMS);
  }

  openPrivacyPolicy() {
    window.open(URLS.FEARLESS_PRIVACY);
  }

  backToWallet() {
    this.$router.push({ name: Components.Wallet });
  }

  async manageGoogle() {
    if (!this.hasMasterPassword) {
      this.$router.push({ name: Components.ChangePassword, params: { name: 'GoogleAuth' } });

      return;
    }

    if (!this.isAuthFlowInit) {
      this.isAuthFlowInit = true;

      initGoogleAuth().finally(() => (this.isAuthFlowInit = false));
    }
  }

  async openAddWalletComponent(type: string) {
    if (this.hasMasterPassword) this.$router.push({ name: Components.AddWallet, params: { type } });
    else this.$router.push({ name: Components.ChangePassword, params: { name: 'AddWallet', type } });
  }

  async openAddWalletMobile() {
    const path = this.hasMasterPassword
      ? { name: Components.MobileWalletAuth }
      : { name: Components.ChangePassword, params: { name: 'MobileWalletAuth' } };

    this.$router.push(path);
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
