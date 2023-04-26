<template>
  <Popup
    sizeWidth="mini"
    :showBorder="true"
    :showHeader="false"
    :showBlur="false"
    :showBackground="false"
    :handlerClose="close"
    :top="top"
    :left="300"
  >
    <div class="wallet-details">
      <div class="row" @click="openWalletDetails">
        <div class="label">Wallet Details</div>
      </div>
      <div v-if="isExportPossible" class="row" @click="exportToGoogleDrive">
        <div class="label google">Export to Google</div>
      </div>
      <div class="row" @click="deleteWallet">
        <div class="label delete">Delete Wallet</div>
      </div>
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter, Mutation } from 'vuex-class';
import type { TMutation } from '@/interfaces/common';
import { Components } from '@/router/routes';
import { ActionTypes as AccountsActionTypes } from '@/store/accounts/actions';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { forgetAccount, initGoogleAuth } from '@/extension/messaging';
import { AccountJson } from '@/extension/background/extension-base/src/background/types/types';

@Component
export default class WalletDetailsPopup extends Vue {
  @Prop(Number) buttonTopClick!: number;
  @Prop(String) selectedWalletAddress!: string;
  @Mutation(AccountsActionTypes.SET_SELECTED_WALLET) setSelectedWallet!: TMutation<string>;
  @Getter(AccountsGettersTypes.getAccounts) accounts!: AccountJson[];

  get selectedWallet() {
    return this.accounts.find((account) => account.active)!;
  }

  get isMobileWallet() {
    return this.accounts.find((el) => el.address === this.selectedWalletAddress && el.isMobile);
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
    forgetAccount(this.selectedWalletAddress, this.isMobileWallet ? 'mobile' : 'native');

    if (this.accounts.length === 0) this.$router.push({ name: Components.Welcome });
    else this.close();
  }

  exportToGoogleDrive() {
    initGoogleAuth('export', this.selectedWalletAddress);
  }

  openWalletDetails() {
    this.setSelectedWallet(this.selectedWalletAddress);

    this.$router.push({
      name: Components.Accounts,
      params: {
        address: this.selectedWallet.address,
        name: this.selectedWallet.name,
        ethereumAddress: this.selectedWallet.ethereumAddress,
        isMobile: this.selectedWallet.isMobile ? 'mobile' : '',
      },
    });

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
      color: $delete-color;
      opacity: 0.8;
    }
  }
}
</style>
