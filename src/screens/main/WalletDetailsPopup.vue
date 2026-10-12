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
      <div v-if="selectedAccountIsSubstrate" class="row" @click="openWalletDetails">
        <div class="label" data-testid="walletDetails">{{ $t('walletDetailsPopup.details') }}</div>
      </div>

      <div v-if="isExportPossible" class="row" @click="exportToGoogleDrive">
        <div class="label google" data-testid="exportToGoogle">{{ $t('walletDetailsPopup.exportToGoogle') }}</div>
      </div>

      <div class="row" @click="deleteWallet">
        <div class="label delete" data-testid="deleteWallet">{{ $t('walletDetailsPopup.deleteWallet') }}</div>
      </div>
    </div>
  </Popup>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import DeleteWalletPopup from './DeleteWalletPopup.vue';
import { Components } from '@/router/routes';
import { initGoogleAuth, updateCurrentAccount } from '@/extension/messaging';
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

          return this.selectedAccountIsSubstrate;
    },
    top() {
      return this.buttonTopClick - 30;
    },
  },
  methods: {
    close() {
      this.$emit('close');
    },
    // One click never deletes: the confirmation shows the balance, offers the export and asks for the password.
    deleteWallet() {
      this.confirmDelete = true;
    },
    onDeleted() {
      const remaining = this.accountsStore.accounts.filter(({ address }) => address !== this.selectedWalletAddress);

      if (remaining.length === 0) this.$router.push({ name: Components.Welcome });
      else this.close();
    },
    exportToGoogleDrive() {
      initGoogleAuth('export', this.selectedWalletAddress);
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
  max-height: 90px;
  overflow: hidden;
  gap: 16px;
  padding: 0 10px;

  .row {
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
      width: 160px;
      text-align: left;
    }

    .delete {
      color: palette($orange-color, var(--fw-danger));
      opacity: 0.8;
    }
  }
}
</style>
