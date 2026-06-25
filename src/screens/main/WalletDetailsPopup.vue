<template>
  <Popup
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
        <div class="label" data-testid="walletDetails">Wallet Details</div>
      </div>

      <div v-if="isExportPossible" class="row" @click="exportToGoogleDrive">
        <div class="label google" data-testid="exportToGoogle">Export to Google</div>
      </div>

      <div class="row" @click="deleteWallet">
        <div class="label delete" data-testid="deleteWallet">Delete Wallet</div>
      </div>
    </div>
  </Popup>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { Components } from '@/router/routes';
import { forgetAccount, initGoogleAuth, updateCurrentAccount } from '@/extension/messaging';
import { useAccountsStore } from '@/stores/accounts';
import { IS_EXTENSION } from '@/consts/global';
import { WalletEcosystem } from '@/interfaces';

export default defineComponent({ name: 'WalletDetailsPopup' ,
  props: {
    buttonTopClick: Number,
    selectedWalletAddress: String,
  },
  data() {
    return {
      isExtension: IS_EXTENSION,
      accountsStore: useAccountsStore(),
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
      if (!this.isExtension || this.selectedAccount?.isMobile) return false;

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
    async deleteWallet() {
      await forgetAccount(this.selectedWalletAddress, this.selectedAccount?.isMobile ? 'mobile' : 'native');

          if (this.accountsStore.accounts.length === 0) this.$router.push({ name: Components.Welcome });
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
      color: $orange-color;
      opacity: 0.8;
    }
  }
}
</style>
