<template>
  <Popup
    sizeWidth="mini"
    :showBorder="true"
    :showHeader="false"
    :showBlur="false"
    :showBackground="false"
    @handlerClose="close"
    :top="top"
    :left="300"
  >
    <div class="wallet-details">
      <div class="row" @click="openWalletDetails">
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
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Components } from '@/router/routes';
import { forgetAccount, initGoogleAuth, updateCurrentAccount } from '@/extension/messaging';
import { useAccountsStore } from '@/stores/accounts';

@Component
export default class WalletDetailsPopup extends Vue {
  accountsStore = useAccountsStore();

  @Prop(Number) buttonTopClick!: number;
  @Prop(String) selectedWalletAddress!: string;

  get selectedWallet() {
    return this.accountsStore.accounts.find((account) => account.active)!;
  }

  get isMobileWallet() {
    return this.accountsStore.accounts.find(
      ({ address, isMobile }) => address === this.selectedWalletAddress && isMobile
    );
  }

  get isExportPossible() {
    return !this.isMobileWallet;
  }

  get top() {
    return this.buttonTopClick - 30;
  }

  close() {
    this.$emit('close');
  }

  async deleteWallet() {
    await forgetAccount(this.selectedWalletAddress, this.isMobileWallet ? 'mobile' : 'native');

    if (this.accountsStore.accounts.length === 0) this.$router.push({ name: Components.Welcome });
    else this.close();
  }

  exportToGoogleDrive() {
    initGoogleAuth('export', this.selectedWalletAddress);
  }

  async openWalletDetails() {
    await updateCurrentAccount(this.selectedWalletAddress);

    this.$router.push({ name: Components.AccountSetting });

    this.$emit('closeSelectWalletPopup');
  }
}
</script>

<style lang="scss" scoped>
.wallet-details {
  color: $default-white;
  font-weight: 500;
  display: flex;
  flex-flow: column;
  max-height: 90px;
  min-height: 60px;
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
