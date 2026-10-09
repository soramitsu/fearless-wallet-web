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
      <div class="welcome-task">
        <h1>{{ $t(showChoiceEcosystem ? 'ux.chooseNetworks' : 'ux.walletTaskTitle') }}</h1>
        <p>{{ $t(showChoiceEcosystem ? 'ux.chooseNetworksDescription' : 'ux.walletTaskDescription') }}</p>
        <ChoiceEcosystem v-if="showChoiceEcosystem" @setEcosystem="setEcosystem" />
        <div v-else class="wallet-task-actions">
          <FButton
            width="100%"
            size="big"
            fontSize="big"
            text="addWallet.createWallet"
            data-testid="createWalletBtn"
            @click="walletTask = 'create'"
          />
          <FButton
            width="100%"
            size="big"
            fontSize="big"
            type="secondary"
            text="welcome.importWallet"
            data-testid="importBtn"
            @click="walletTask = 'import'"
          />
          <details class="other-wallet-options">
            <summary>{{ $t('ux.otherWays') }}</summary>
            <FButton
              width="100%"
              size="big"
              type="secondary"
              iconName="connectMobile"
              text="welcome.connectMobile"
              data-testid="connectMobileBtn"
              @click="openAddWalletMobile"
            />
            <FButton
              v-if="isExtension && googleDriveBackupEnabled"
              width="100%"
              size="big"
              type="secondary"
              iconName="googleManage"
              text="welcome.manageGoogle"
              data-testid="googleManageBtn"
              @click="manageGoogle"
            />
          </details>
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
import { defineComponent } from 'vue';

import { Components } from '@/router/routes';
import { URLS } from '@/consts/urls';
import { hasMasterPassword, initGoogleAuth } from '@/extension/messaging';
import { useAccountsStore } from '@/stores/accounts';
import { IS_EXTENSION } from '@/consts/global';
import { type WalletEcosystem } from '@/interfaces';
import { isGoogleDriveBackupEnabled } from '@/util/releaseFeatures';
import ChoiceEcosystem from '@/screens/welcome/ChoiceEcosystem.vue';

export default defineComponent({
  name: 'Welcome',
  components: { ChoiceEcosystem },
  data() {
    return {
      isExtension: IS_EXTENSION,
      googleDriveBackupEnabled: isGoogleDriveBackupEnabled(),
      accountsStore: useAccountsStore(),
      showGoogleAuthPopup: false,
      isAuthFlowInit: false,
      hasMasterPassword: false,
      walletEcosystem: null,
      walletTask: '' as '' | 'create' | 'import',
    };
  },
  computed: {
    showChoiceEcosystem() {
      return Boolean(this.walletTask);
    },
    isSubstrate() {
      return this.walletEcosystem === 'substrate';
    },
    showBackWalletIcon() {
      return Boolean(this.walletTask) || this.accountsStore.accounts.length !== 0;
    },
    accessToken() {
      return this.$route.params.access_token;
    },
  },
  async created() {
    this.hasMasterPassword = await hasMasterPassword();

    if (this.accessToken) this.showGoogleAuthPopup = true;
  },
  methods: {
    setEcosystem(value: WalletEcosystem) {
      this.walletEcosystem = value;
      if (this.walletTask) void this.openAddWalletComponent(this.walletTask);
    },
    closeGooglePopup() {
      this.showGoogleAuthPopup = false;
    },
    openTermsAndConditions() {
      window.open(URLS.FEARLESS_TERMS);
    },
    openPrivacyPolicy() {
      window.open(URLS.FEARLESS_PRIVACY);
    },
    backToWallet() {
      if (this.walletTask) {
        this.walletTask = '';
        this.walletEcosystem = null;

        return;
      }

      this.$router.push({ name: Components.Wallet });
    },
    async manageGoogle() {
      if (!this.hasMasterPassword) {
        this.$router.push({ name: Components.ChangePassword, params: { name: 'GoogleAuth' } });

        return;
      }

      if (!this.isAuthFlowInit) {
        this.isAuthFlowInit = true;

        initGoogleAuth().finally(() => (this.isAuthFlowInit = false));
      }
    },
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
    },
    async openAddWalletMobile() {
      const path = this.hasMasterPassword
        ? { name: Components.MobileWalletAuth }
        : { name: Components.ChangePassword, params: { name: 'MobileWalletAuth' } };

      this.$router.push(path);
    },
  },
});
</script>

<style lang="scss" scoped>
.welcome-page {
  display: flex;
  flex-direction: column;
  height: $default-height-page;
  justify-content: space-between;
  min-height: 0;
  gap: 24px;
  overflow-y: auto;

  .back-wallet-container {
    height: 32px;
  }

  .description {
    margin-top: 24px;
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

<style lang="scss" scoped>
.welcome-task {
  text-align: left;
}
.welcome-task h1 {
  font-size: 1.5rem;
  line-height: 1.3;
  margin: 16px 0 8px;
}
.welcome-task p {
  color: $default-white;
  line-height: 1.5;
  margin-bottom: 24px;
}
.wallet-task-actions {
  display: grid;
  gap: 12px;
}
.other-wallet-options {
  margin-top: 8px;
  color: $default-white;
}
.other-wallet-options :deep(.button-size-big) {
  margin-block: 8px;
}
</style>
