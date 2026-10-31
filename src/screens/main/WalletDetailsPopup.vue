<template>
  <DeleteWalletPopup
    v-if="confirmDelete"
    :address="selectedWalletAddress"
    @cancel="close"
    @deleted="onDeleted"
    @exported="$emit('closeSelectWalletPopup')"
  />

  <Popup
    v-else
    sizeWidth="mini"
    :showBorder="true"
    :showHeader="false"
    :showBlur="false"
    :showBackground="false"
    :top="top"
    :left="300"
    @handlerClose="close"
  >
    <div class="wallet-details">
      <button v-if="selectedAccountIsSubstrate" type="button" class="row" @click="openWalletDetails">
        <span class="label" data-testid="walletDetails">{{ $t('walletDetailsPopup.details') }}</span>
      </button>

      <button v-if="needsPasswordNotice" type="button" class="row" data-testid="universalWalletPasswordReopen" @click="openPasswordNotice">
        <span class="label">{{ passwordNoticeLabel }}</span>
      </button>

      <button v-if="isExportPossible" type="button" class="row" :disabled="isAuthFlowInit" :aria-busy="isAuthFlowInit" @click="exportToGoogleDrive">
        <span class="label google" data-testid="exportToGoogle">{{ $t('walletDetailsPopup.exportToGoogle') }}</span>
      </button>
      <p v-if="googleAuthError" role="alert" class="google-auth-error">{{ $t('addWallet.google.somethingWrong') }}</p>

      <button type="button" class="row" @click="deleteWallet">
        <span class="label delete" data-testid="deleteWallet">{{ $t('walletDetailsPopup.deleteWallet') }}</span>
      </button>
    </div>
  </Popup>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import DeleteWalletPopup from './DeleteWalletPopup.vue';
import { Components } from '@/router/routes';
import { initGoogleAuth, universalWalletPasswordStatus, updateCurrentAccount } from '@/extension/messaging';
import { universalWalletPasswordMessages } from '@/locales/universalWalletPassword';
import { needsUniversalWalletPasswordNotice, universalWalletPasswordNoticeRequest } from '@/util/universalWalletPasswordNotice';
import { useAccountsStore } from '@/stores/accounts';
import { IS_EXTENSION } from '@/consts/global';
import { WalletEcosystem } from '@/interfaces';
import { isGoogleDriveBackupEnabled } from '@/util/releaseFeatures';

export default defineComponent({ name: 'WalletDetailsPopup' ,
  components: { DeleteWalletPopup },
  props: {
    buttonTopClick: Number,
    selectedWalletAddress: String,
  },
  data() {
    return {
      isExtension: IS_EXTENSION,
      accountsStore: useAccountsStore(),
      confirmDelete: false,
      isAuthFlowInit: false,
      googleAuthError: false,
      isActive: true,
      authRevision: 0,
      needsPasswordNotice: false,
      passwordNoticeLabel: universalWalletPasswordMessages['en-EN'].reopen,
    };
  },
  computed: {
    selectedAccount() {
      return this.accountsStore.accounts.find(({ address }) => address === this.selectedWalletAddress);
    },
    selectedAccountIsSubstrate() {
      return this.selectedAccount?.walletEcosystem === WalletEcosystem.Substrate;
    },
    isExportPossible() {
      if (!this.isExtension || !isGoogleDriveBackupEnabled() || this.selectedAccount?.isMobile) return false;

      return this.selectedAccountIsSubstrate || this.selectedAccount?.walletEcosystem === WalletEcosystem.Evm;
    },
    top() {
      return this.buttonTopClick - 30;
    },
  },
  beforeUnmount() { this.abandon(); },
  watch: {
    selectedWalletAddress: {
      handler() {
        this.authRevision++;
        this.googleAuthError = false;
        this.isAuthFlowInit = false;
        void this.loadPasswordNotice();
      },
      immediate: true,
    },
  },
  methods: {
    abandon() { this.isActive = false; this.authRevision++; },
    async loadPasswordNotice() {
      const address = this.selectedWalletAddress;
      this.needsPasswordNotice = false;
      if (!address) return;
      try {
        const status = await universalWalletPasswordStatus(address);
        if (this.isActive && this.selectedWalletAddress === address) this.needsPasswordNotice = needsUniversalWalletPasswordNotice(status);
      } catch {
        // The row is optional; without an answer it stays hidden.
      }
    },
    async openPasswordNotice() {
      const address = this.selectedWalletAddress;
      if (!address) return;
      const walletInfo = this.accountsStore.accounts.find((account) => account.address === address);
      // The notice belongs to the selected wallet's screen.
      if (this.accountsStore.selectedWallet.address !== address) await updateCurrentAccount(address, walletInfo?.walletEcosystem);
      universalWalletPasswordNoticeRequest.value = address;
      this.$emit('closeSelectWalletPopup');
      this.close();
    },
    close() {
      this.abandon();
      this.$emit('close');
    },
    // One click never deletes: the confirmation shows the balance, offers the export and asks for the password.
    deleteWallet() {
      this.abandon();
      this.confirmDelete = true;
    },
    onDeleted() {
      const remaining = this.accountsStore.accounts.filter(({ address }) => address !== this.selectedWalletAddress);

      if (remaining.length === 0) this.$router.push({ name: Components.Welcome });
      else this.close();
    },
    async exportToGoogleDrive() {
      if (!this.isActive || this.isAuthFlowInit || !this.isExportPossible) return;
      const revision = ++this.authRevision;
      const address = this.selectedWalletAddress;
      const ownsRequest = () => this.isActive && this.authRevision === revision && this.selectedWalletAddress === address;
      this.isAuthFlowInit = true;
      this.googleAuthError = false;
      try { await initGoogleAuth('export', address); }
      catch { if (ownsRequest()) this.googleAuthError = true; }
      finally { if (ownsRequest()) this.isAuthFlowInit = false; }
    },
    async openWalletDetails() {
      const walletInfo = this.accountsStore.accounts.find(({ address }) => address === this.selectedWalletAddress);

          await updateCurrentAccount(this.selectedWalletAddress, walletInfo?.walletEcosystem);

          this.$router.push({ name: Components.AccountSetting });

          this.$emit('closeSelectWalletPopup');
    },
  },
});
</script>

<style lang="scss" scoped>
.wallet-details {
  color: $default-white;
  font-weight: 500;
  display: flex;
  flex-flow: column;
  max-height: min(70vh, 400px);
  overflow-y: auto;
  gap: 16px;
  padding: 0 10px;

  .google-auth-error {
    margin: 0;
    color: var(--fw-danger);
    overflow-wrap: anywhere;
  }

  .row {
    appearance: none;
    background: transparent;
    border: 0;
    padding: 0;
    color: inherit;
    font: inherit;
    flex-shrink: 0;
    &:disabled { opacity: 0.6; cursor: wait; }
    &:focus-visible { outline: 2px solid var(--fw-focus); outline-offset: 2px; }
    &:last-child {
      margin-bottom: 0;
    }

    &:hover {
      cursor: pointer;
      color: rgba(255, 255, 255, 0.9);

      .delete {
        opacity: 1;
      }
    }

    .label {
      margin: auto 0 auto 10px;
      display: block;
      max-width: 160px;
      overflow-wrap: anywhere;
      text-align: left;
    }

    .delete {
      color: palette($orange-color, var(--fw-danger));
      opacity: 0.8;
    }
  }
}
</style>
