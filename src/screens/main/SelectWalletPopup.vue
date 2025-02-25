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
        v-for="({ name, address, active, isMobile, walletEcosystem }, index) in sortedWallets"
        :key="name + index"
        :name="name"
        :isSelected="active"
        :isMobile="isMobile"
        :address="address"
        class="wallet"
        data-testid="walletContent"
        @setShowWalletDetailsPopupVisible="toggleWalletDetailsPopupVisible(...arguments, address)"
        @setWallet="updateSelectedWallet(address, walletEcosystem)"
      />

      <BorderButton text="wallet.addWallet" iconName="plus-pink" data-testid="addWalletBtn" @click="addWallet" />
    </div>
  </Popup>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import WalletInfo from './WalletInfo.vue';
import type { CustomEvent, WalletEcosystem } from '@/interfaces';
import { Components } from '@/router/routes';
import { updateCurrentAccount } from '@/extension/messaging';
import { useAccountsStore } from '@/stores/accounts';

@Component({
  components: { WalletInfo },
})
export default class SelectWalletPopup extends Vue {
  accountsStore = useAccountsStore();

  get sortedWallets() {
    return this.accountsStore.accounts.sort((a, b) => a.name.localeCompare(b.name));
  }

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

  async updateSelectedWallet(address: string, walletEcosystem: WalletEcosystem) {
    await updateCurrentAccount(address, walletEcosystem);

    this.close();
  }

  close() {
    this.$emit('close');
  }

  toggleWalletDetailsPopupVisible(buttonTop: number, address: string) {
    this.$emit('toggleWalletDetailsPopupVisible', undefined, buttonTop, address);
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
