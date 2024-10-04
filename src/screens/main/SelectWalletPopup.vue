<template>
  <Popup
    horizontalPlacement="left"
    verticalPlacement="top"
    sizeWidth="small"
    :showHeader="false"
    :showBorder="true"
    @handlerClose="close"
    :top="55"
    :maxHeight="391"
    @click.native="walletPopupClick"
  >
    <div class="wallet-content">
      <WalletInfo
        v-for="({ name, address, active, isMobile }, index) in sortedWallets"
        :key="name + index"
        :name="name"
        :isSelected="active"
        :isMobile="isMobile"
        :address="address"
        class="wallet"
        data-testid="walletContent"
        @setShowWalletDetailsPopupVisible="toggleWalletDetailsPopupVisible(...arguments, address)"
        @setWallet="updateSelectedWallet(address)"
      />

      <BorderButton text="wallet.addWallet" iconName="plus-pink" data-testid="addWalletBtn" @click="addWallet" />
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import WalletInfo from './WalletInfo.vue';
import type { SelectedWallet } from '@/store';
import type { CustomEvent } from '@/interfaces';
import type { AccountJson } from '@extension-base/background/types/types';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { Components } from '@/router/routes';
import { updateCurrentAccount } from '@/extension/messaging';

@Component({
  components: { WalletInfo },
})
export default class SelectWalletPopup extends Vue {
  @Getter(AccountsGettersTypes.getAccounts) wallets!: AccountJson[];
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;

  addWallet() {
    this.$router.push({ name: Components.Welcome });
  }

  walletPopupClick({ target: { classList } }: CustomEvent) {
    if (
      !(
        classList.contains('dots-container') ||
        classList.contains('dots') ||
        classList.contains('dots-horizontal') ||
        classList.contains('icon__inner')
      )
    )
      this.$emit('toggleWalletDetailsPopupVisible', false);
  }

  updateSelectedWallet(address: string) {
    updateCurrentAccount(address);

    this.close();
  }

  close() {
    this.$emit('close');
  }

  toggleWalletDetailsPopupVisible(buttonTop: number, address: string) {
    this.$emit('toggleWalletDetailsPopupVisible', undefined, buttonTop, address);
  }

  get sortedWallets() {
    return this.wallets.sort((a, b) => a.name.localeCompare(b.name));
  }
}
</script>

<style lang="scss" scoped>
.wallet-content {
  padding: 0 $default-padding;
  height: 100%;
}

.wallet {
  margin-bottom: 10px !important;
}
</style>
