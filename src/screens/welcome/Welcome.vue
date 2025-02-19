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
      <ChoiceEcosystem v-if="showChoiceEcosystem" @setEcosystem="setEcosystem" />

      <div v-else>
        <FButton
          v-if="isSubstrate"
          width="100%"
          size="big"
          fontSize="big"
          text="addWallet.createWallet"
          data-testid="createWalletBtn"
          @click="openAddWalletComponent('create')"
        />

        <div class="additional-options">
          <FButton
            v-if="isSubstrate"
            class="import-button button--content-wrap"
            size="big"
            fontSize="big"
            type="secondary"
            iconName="connectMobile"
            iconType="big"
            text="welcome.connectMobile"
            :border="false"
            data-testid="connectMobileBtn"
            @click="openAddWalletMobile"
          />

          <FButton
            v-if="isExtension && isSubstrate"
            class="import-button button--content-wrap"
            size="big"
            fontSize="big"
            type="secondary"
            iconName="googleManage"
            iconType="big"
            text="welcome.manageGoogle"
            :border="false"
            data-testid="googleManageBtn"
            @click="manageGoogle"
          />

          <FButton
            v-if="!isSubstrate"
            class="import-button button--content-wrap"
            size="big"
            fontSize="big"
            type="secondary"
            iconName="createButton"
            iconType="big"
            text="addWallet.createWallet"
            :border="false"
            data-testid="createWalletBtn"
            @click="openAddWalletComponent('create')"
          />

          <FButton
            class="import-button button--content-wrap"
            size="big"
            fontSize="big"
            type="secondary"
            iconName="importButton"
            iconType="big"
            text="welcome.importWallet"
            :border="false"
            data-testid="importBtn"
            @click="openAddWalletComponent('import')"
          />
        </div>
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
import { IS_EXTENSION } from '@/consts/global';
import { type WalletEcosystem } from '@/interfaces';
import ChoiceEcosystem from '@/screens/welcome/ChoiceEcosystem.vue';

@Component({ components: { ChoiceEcosystem } })
export default class Welcome extends Vue {
  readonly isExtension = IS_EXTENSION;
  accountsStore = useAccountsStore();
  showGoogleAuthPopup = false;
  isAuthFlowInit = false;
  hasMasterPassword = false;
  walletEcosystem: WalletEcosystem | null = null;

  get showChoiceEcosystem() {
    return !this.walletEcosystem;
  }

  get isSubstrate() {
    return this.walletEcosystem === 'substrate';
  }

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

  setEcosystem(value: WalletEcosystem) {
    this.walletEcosystem = value;
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
    if (this.walletEcosystem) {
      this.walletEcosystem = null;

      return;
    }

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
    if (this.hasMasterPassword)
      this.$router.push({ name: Components.AddWallet, params: { type, walletEcosystem: this.walletEcosystem! } });
    else
      this.$router.push({
        name: Components.ChangePassword,
        params: {
          name: 'AddWallet',
          type,
          walletEcosystem: this.walletEcosystem!,
        },
      });
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
    font-size: 0.75rem;
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

  .button--icon {
    width: 32px;
    height: 32px;
  }

  .button--content-wrap {
    flex: 1 1 100px;
  }

  .button__icon--big {
    width: 32px;
    height: 32px;
  }

  .additional-options {
    display: flex;
    line-height: 18px;
    gap: 10px;
    margin-top: 10px;
  }
}

.fw-extension {
  .button--content-wrap {
    width: 169px;
  }
}

.fw-web {
  .button--content-wrap {
    width: 30%;
  }

  .additional-options {
    font-size: 1.25rem;
  }
}
</style>
