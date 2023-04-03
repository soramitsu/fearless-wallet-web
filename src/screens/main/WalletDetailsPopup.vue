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
import { Mutation } from 'vuex-class';
import type { TMutation } from '@/interfaces/common';
import BaseApi from '@/util/BaseApi';
import { Components } from '@/router/routes';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { initGoogleAuth } from '@/extension/messaging';

@Component
export default class WalletDetailsPopup extends Vue {
  @Prop(Number) buttonTopClick!: number;
  @Prop(String) selectedWalletAddress!: string;
  @Mutation(AccountsMutationTypes.SET_SELECTED_WALLET) setSelectedWallet!: TMutation<string>;

  get isMobileWallet() {
    return BaseApi.isMobileWallet(this.selectedWalletAddress);
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
    const walletsCount = this.isMobileWallet
      ? await BaseApi.deleteMobileWallet(this.selectedWalletAddress)
      : BaseApi.deleteNativeWallet(this.selectedWalletAddress);

    if (walletsCount === 0) this.$router.push({ name: Components.Welcome });
    else {
      this.setWallet();
      this.close();
    }
  }

  setWallet() {
    const selectedWalletAddress = BaseApi.getFirstSubstrateWalletAddress();

    if (selectedWalletAddress) this.setSelectedWallet(selectedWalletAddress);
  }

  exportToGoogleDrive() {
    initGoogleAuth('export', this.selectedWalletAddress);
  }

  openWalletDetails() {
    this.setSelectedWallet(this.selectedWalletAddress);

    this.$router.push({ name: Components.Accounts });

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
