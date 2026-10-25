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
    @click="walletPopupClick"
  >
    <div class="wallet-content">
      <!-- Behind a build flag (src/portfolio/dashboard): every wallet read together, with each wallet's own total. -->
      <PortfolioScopeRow v-if="showAllWallets" class="wallet" :selected="allWalletsSelected" @select="selectAllWallets" />

      <WalletInfo
        v-for="({ name, address, active, isMobile, walletEcosystem }, index) in sortedWallets"
        :key="name + index"
        :name="name"
        :isSelected="active && !allWalletsSelected"
        :isMobile="isMobile"
        :address="address"
        class="wallet"
        data-testid="walletContent"
        @setShowWalletDetailsPopupVisible="toggleWalletDetailsPopupVisible($event, address)"
        @setWallet="updateSelectedWallet(address, walletEcosystem)"
      />

      <BorderButton text="wallet.addWallet" iconName="plus-pink" data-testid="addWalletBtn" @click="addWallet" />
    </div>
  </Popup>
</template>

<script lang="ts">
import { defineAsyncComponent, defineComponent } from 'vue';
import { isEthereumAddress } from '@polkadot/util-crypto';

import WalletInfo from './WalletInfo.vue';
import type { CustomEvent, WalletEcosystem } from '@/interfaces';
import { Components } from '@/router/routes';
import { updateCurrentAccount } from '@/extension/messaging';
import { useAccountsStore } from '@/stores/accounts';
import { usePortfolioDashboardStore } from '@/stores/portfolioDashboard';
import { PORTFOLIO_DASHBOARD_ENABLED } from '@/portfolio/dashboard/dashboardFlag';
import { effectiveScope } from '@/portfolio/dashboard/preferences';

export default defineComponent({ name: 'SelectWalletPopup',
  components: {
    WalletInfo,
    // A build without the dashboard folds this away, import included (src/portfolio/dashboard/dashboardFlag.ts).
    ...(process.env.FW_PORTFOLIO_DASHBOARD === 'true'
      ? { PortfolioScopeRow: defineAsyncComponent(() => import('@/screens/portfolio/PortfolioScopeRow.vue')) }
      : {}),
  },
  data() {
    return {
      accountsStore: useAccountsStore(),
      dashboardStore: PORTFOLIO_DASHBOARD_ENABLED ? usePortfolioDashboardStore() : undefined,
    };
  },
  computed: {
    // All wallets only exists with two or more wallets.
    showAllWallets(): boolean {
      return this.dashboardStore !== undefined && this.accountsStore.accounts.length >= 2;
    },
    allWalletsSelected(): boolean {
      return (
        this.dashboardStore !== undefined &&
        effectiveScope(this.dashboardStore.preferences.scope, this.accountsStore.accounts.length) === 'all'
      );
    },
    sortedWallets() {
      // Account subscriptions include standalone EVM records for security
      // classification; selection must match State.updateCurrentAccount's guard.
      return this.accountsStore.accounts
        .filter(({ address }) => !isEthereumAddress(address))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  },
  methods: {
    addWallet() {
      this.$router.push({ name: Components.Welcome });
    },
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
    },
    // Reads every wallet together and leaves the selected wallet as it is: All wallets never signs or sends.
    selectAllWallets() {
      this.dashboardStore?.setScope('all');

      const route = this.$route.name;

      if (route !== Components.Wallet && route !== Components.Currencies && route !== Components.Nfts) {
        void this.$router.replace({ name: Components.Wallet });
      }

      this.close();
    },
    async updateSelectedWallet(address: string, walletEcosystem: WalletEcosystem) {
      await updateCurrentAccount(address, walletEcosystem);
      this.dashboardStore?.setScope('wallet');

          this.close();
    },
    close() {
      this.$emit('close');
    },
    toggleWalletDetailsPopupVisible(buttonTop: number, address: string) {
      this.$emit('toggleWalletDetailsPopupVisible', undefined, buttonTop, address);
    },
  },
});
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
