<template>
  <div class="wallet" :class="{ 'wallet--dashboard': dashboardEnabled }">
    <!-- Behind a build flag (src/portfolio/dashboard): the balance with Send, Receive and Swap, as in Exodus. -->
    <PortfolioDashboard
      v-if="dashboardEnabled"
      :summary="portfolioSummary"
      :summaryInput="summaryInput"
      :hiddenKeys="hiddenKeys"
      :caption="filteredCaption"
      :loading="balancesLoading"
      :swapAvailable="!selectedWalletRecoveryOnly"
      :receiveAvailable="!selectedWalletRecoveryOnly"
      :showAllWalletsList="activeTabName === assetsTab"
      @openFiats="$emit('openFiatsPopup', true)"
    >
      <template #toolbar="{ allWallets }">
        <WalletSettings
          class="home-toolbar"
          :activeTabName="activeTabName"
          :refreshSlotId="refreshSlotId"
          :showPortfolioTab="true"
          :allWallets="allWallets"
          @update:activeTabName="updateActiveTabName"
          @manage="openManageAssets"
        />
      </template>
    </PortfolioDashboard>

    <!-- The selected view; All wallets lists its own holdings above (PortfolioDashboard), so its Assets view is there. -->
    <div v-if="dashboardEnabled && !(allWalletsScope && activeTabName === assetsTab)" class="home-content">
      <router-view
        :route="ownRoute"
        :showAssetsManagementForm="showAssetsManagementForm"
        :filterValue="filterValue"
        :refreshSlotId="refreshSlotId"
        @update:filterValue="updateFilterValue"
        @toggleNetworkManagementVisible="toggleNetworkManagementVisible"
        @toggleAssetsManagementForm="toggleAssetsManagementForm"
      />
    </div>

    <template v-if="!dashboardEnabled">
      <header class="wallet-header">
        <WalletBalance
          class="wallet-balance"
          :balance="summaryTotalBalance"
          :changeWalletBalance="changeWalletBalance"
          :caption="filteredCaption"
          :staticWidth="false"
          :loading="balancesLoading"
          :loadingLabel="$t('portfolioPage.loadingBalances')"
          @click="$emit('openFiatsPopup', true)"
        />

        <Loading v-if="showLoadingBalance" :width="28" class="balance-loading" />
      </header>

      <ContentForm :height="contentFormHeight">
        <div class="content">
          <WalletSettings
            :activeTabName="activeTabName"
            :refreshSlotId="refreshSlotId"
            @update:activeTabName="updateActiveTabName"
            @manage="openManageAssets"
          />

          <router-view
            :route="ownRoute"
            :showAssetsManagementForm="showAssetsManagementForm"
            :filterValue="filterValue"
            :refreshSlotId="refreshSlotId"
            @update:filterValue="updateFilterValue"
            @toggleNetworkManagementVisible="toggleNetworkManagementVisible"
            @toggleAssetsManagementForm="toggleAssetsManagementForm"
          />
        </div>
      </ContentForm>
    </template>

    <NetworkManagement
      v-if="showNetworkManagement"
      :networks="networksWithWarning"
      @closeForm="toggleNetworkManagementVisible"
      @setNetworkUnavailable="setNetworkUnavailable"
    />

    <NetworkUnavailablePopup
      v-if="showNetworkUnavailablePopup"
      :networks="networksWithWarning"
      :network="networkUnavailable"
      @closePopup="setNetworkUnavailable"
    />

    <GoogleExportPopup v-if="showGoogleExportPopup" @closePopup="closeGoogleExportPopup" />

    <Tooltip v-if="!dashboardEnabled" text="wallet.walletBalance" target=".wallet-balance" placement="right" />
    <Tooltip text="common.networkManagement" target=".select-network-button" placement="bottom" />
  </div>
</template>

<script lang="ts">
import { defineAsyncComponent, defineComponent, markRaw } from 'vue';

import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import type { TabWallet } from '@/interfaces';
import WalletSettings from '@/screens/wallet&asset/wallet/WalletSettings.vue';
import ReceiveForm from '@/screens/wallet&asset/ReceiveForm.vue';
import SendForm from '@/screens/wallet&asset/SendForm.vue';
import WalletBalance from '@/screens/main/WalletBalance.vue';
import NetworkManagement from '@/screens/wallet&asset/wallet/NetworkManagement.vue';
import NetworkUnavailablePopup from '@/screens/wallet&asset/wallet/NetworkUnavailablePopup.vue';
import GoogleExportPopup from '@/screens/wallet&asset/wallet/GoogleExportPopup.vue';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { usePortfolio } from '@/portfolio/usePortfolio';
import { PORTFOLIO_DASHBOARD_ENABLED } from '@/portfolio/dashboard/dashboardFlag';
import { effectiveScope } from '@/portfolio/dashboard/preferences';
import { formatDecimalString } from '@/helpers/numbers';
import { CONTENT_FORM_HEIGHT, IS_EXTENSION } from '@/consts/global';
import { networksIsPending } from '@/helpers/shimmers';
import { fetchEvmBalance } from '@/extension/messaging';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { usePortfolioDashboardStore } from '@/stores/portfolioDashboard';
import { isSelectedWalletRecoveryOnly } from '@/util/walletRecoveryPolicy';

// Kept-alive wallet screens live side by side, so each gives its toolbar's Refresh place an id of its own.
let walletViews = 0;

// The Assets view's route name (Components.Currencies). The routes table imports this screen, so this screen does not
// import the table back: loaded first, as a test loads it, the cycle would build the router before its routes.
const ASSETS_TAB: TabWallet = 'Currencies' as TabWallet;
const MANAGE_ASSETS = 'ManageAssets';

export default defineComponent({ name: 'Wallet',
  components: {
    SendForm,
    ReceiveForm,
    WalletBalance,
    WalletSettings,
    NetworkManagement,
    NetworkUnavailablePopup,
    GoogleExportPopup,
    // A build without the dashboard folds this away, import included (src/portfolio/dashboard/dashboardFlag.ts).
    ...(process.env.FW_PORTFOLIO_DASHBOARD === 'true'
      ? { PortfolioDashboard: defineAsyncComponent(() => import('@/screens/portfolio/PortfolioDashboard.vue')) }
      : {}),
  },
  setup() {
    const { summary: portfolioSummary, filteredTotal, loadStatus, summaryInput, hiddenKeys } = usePortfolio();

    return { portfolioSummary, filteredTotal, loadStatus, summaryInput, hiddenKeys };
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      showNetworkManagement: false,
      // The NFT list's own settings; the token list's Manage assets is a page of its own (openManageAssets).
      showAssetsManagementForm: false,
      networkUnavailable: '',
      filterValue: '',
      selectedCurrency: {} as {
        mainNetwork?: string;
        assetId?: string;
      },
      accountsStore: useAccountsStore(),
      dashboardEnabled: PORTFOLIO_DASHBOARD_ENABLED,
      dashboardStore: PORTFOLIO_DASHBOARD_ENABLED ? usePortfolioDashboardStore() : undefined,
      refreshSlotId: `portfolio-refresh-${++walletViews}`,
      // Main.vue keeps this screen alive for its own route: hidden, it keeps its own list instead of rendering the
      // child of whatever route is open now.
      ownRoute: markRaw({ ...this.$route }),
      assetsTab: ASSETS_TAB,
    };
  },
  computed: {
    // Swaps are closed to an old wallet (walletRecoveryPolicy.ts), so the hero offers no Swap that would bounce back.
    selectedWalletRecoveryOnly(): boolean {
      return IS_EXTENSION && isSelectedWalletRecoveryOnly(this.accountsStore.accounts, this.accountsStore.selectedWallet.address);
    },
    // All wallets lists every wallet's holdings read-only, in place of the selected wallet's own list.
    allWalletsScope(): boolean {
      return (
        this.dashboardStore !== undefined &&
        effectiveScope(this.dashboardStore.preferences.scope, this.accountsStore.accounts.length) === 'all'
      );
    },
    // This screen's own view (Assets, Portfolio or NFTs): a kept-alive copy off the page keeps it while other routes open.
    activeTabName() {
      return this.ownRoute.name;
    },
    contentFormHeight() {
      return CONTENT_FORM_HEIGHT;
    },
    showNetworkUnavailablePopup() {
      return this.networkUnavailable !== '';
    },
    showWarningIcon() {
      if (this.accountsStore.selectedNetwork !== ALL_NETWORKS) {
            const networkStatus = this.networksStore.networks.find(
              ({ name }) => name.toLowerCase() === this.accountsStore.selectedNetwork.toLowerCase()
            )?.networkStatus;

            return networkStatus === NETWORK_STATUS.DISCONNECTED;
          }

          return this.networksWithWarning.length !== 0;
    },
    disconnectedNetworks() {
      return this.networksStore.networks.filter(({ networkStatus }) => networkStatus === NETWORK_STATUS.DISCONNECTED);
    },
    networksWithWarning() {
      return this.disconnectedNetworks.filter(({ name }) => !this.accountsStore.getShowWarningNetwork(name));
    },
    // Wallet-wide under every filter: hidden, unpriced and testnet assets are excluded and labelled in the list.
    summaryTotalBalance() {
      return this.portfolioSummary.total;
    },
    // Until something the wallet holds has arrived, the total is not known: no $0.00 after an update or a switch.
    balancesLoading(): boolean {
      return this.accountsStore.isBalanceLoading || this.loadStatus.state === 'loading';
    },
    filteredCaption() {
      if (this.balancesLoading) return '';

      // A balance nobody could load is not in the total, so the total is only a part and says so.
      const failed = this.portfolioSummary.unavailableCount ? this.$t('portfolioPage.balanceStatus.failed') : '';

      if (this.filteredTotal === null) return failed;

      const selected = this.accountsStore.selectedNetwork;
      const network =
        selected === POPULAR_NETWORKS
          ? this.$t('header.networkManagement.tabs.popular')
          : selected === FAVORITE_NETWORKS
            ? this.$t('header.networkManagement.tabs.favorites')
            : selected;
      const value = `${this.accountsStore.fiatSymbol}${formatDecimalString(this.filteredTotal, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

      const filtered = this.$t('portfolioPage.showingFiltered', { network, value });

      return failed ? `${filtered} · ${failed}` : filtered;
    },
    changeWalletBalance() {
      return {
        percent: this.portfolioSummary.changePercent,
        amount: this.portfolioSummary.changeAmount,
      };
    },
    showShimmers() {
      return networksIsPending(
        this.networksStore.networks, this.accountsStore.selectedNetwork, this.accountsStore.selectedWallet.address
      );
    },
    showLoadingBalance() {
      return this.showShimmers;
    },
    showCurrencies() {
      return this.activeTabName === 'currencies';
    },
    showGoogleExportPopup() {
      return this.$route.params.access_token && this.$route.params.access_token !== 'null';
    },
  },
  watch: {
    "networksWithWarning": 'connect',
    "selectedWallet": 'updateEvmBalance',
    'accountsStore.selectedWallet.address'() {
      this.showAssetsManagementForm = false;
    },
  },
  activated() {
    fetchEvmBalance(undefined, this.accountsStore.selectedWallet.ethereumAddress);
  },
  deactivated() {
    this.showAssetsManagementForm = false;
        this.showNetworkManagement = false;
        this.filterValue = '';

        this.setNetworkUnavailable();
  },
  methods: {
    connect(value: string[]) {
      if (value.length === 0) this.showNetworkManagement = false;
    },
    updateEvmBalance() {
      fetchEvmBalance(undefined, this.accountsStore.selectedWallet.ethereumAddress);
    },
    closeGoogleExportPopup() {
      this.$router.replace('/').catch((e) => e);

          this.$emit('closeSelectWalletPopup');
    },
    setNetworkUnavailable(network = '') {
      this.networkUnavailable = network;
    },
    toggleNetworkManagementVisible() {
      this.showNetworkManagement = !this.showNetworkManagement;
    },
    toggleAssetsManagementForm(value = true) {
      this.showAssetsManagementForm = value;
    },
    openManageAssets() {
      this.$router.push({ name: MANAGE_ASSETS }).catch(() => undefined);
    },
    updateFilterValue(value: string) {
      this.filterValue = value;
    },
    updateActiveTabName(name: TabWallet) {
      if (this.activeTabName === name) return;

          this.$router.push({ name });
    },
  },
});
</script>

<style lang="scss" scoped>
.wallet {
  display: flex;
  flex-direction: column;

  // The hero and the list scroll together, so the list keeps the room the hero would otherwise take. The chain is
  // .main-child (overflow hidden) above and the lists' own scroll areas below, which grow to their content here.
  &.wallet--dashboard.main-child {
    overflow-x: hidden;
    overflow-y: auto;
    // The scrollbar sits in the page gutter, as the portfolio list's own does, not over the hero card.
    width: calc(100% + #{$default-padding});
    margin-right: -$default-padding;
    padding-right: $default-padding;

    &::-webkit-scrollbar {
      width: 6px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    &::-webkit-scrollbar-thumb {
      background-color: var(--fw-stroke-strong);
      border-radius: $default-border-radius;
    }
  }

  // The list under the toolbar; it grows to its content, so the screen scrolls as one.
  .home-content {
    min-width: 0;
  }

  .content {
    padding: $default-padding 0 $default-padding $default-padding;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .wallet-header {
    min-height: 46px;
    display: flex;
    margin-bottom: 10px;
  }

  .balance-loading {
    margin-left: 10px;
  }

  .wallet-balance {
    font-size: 1.375em;
    line-height: 28px;
  }

  .balance-shimmers {
    display: flex;
    flex-direction: column;

    .balance-shimmer {
      margin-bottom: 5px;
    }
  }
}
</style>
