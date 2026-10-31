<template>
  <div class="wallet" :class="{ 'wallet--dashboard': dashboardEnabled }">
    <!-- Behind a build flag (src/portfolio/dashboard): the winged-sun hero in place of the plain total. -->
    <PortfolioDashboard
      v-if="dashboardEnabled"
      :summary="portfolioSummary"
      :summaryInput="summaryInput"
      :hiddenKeys="hiddenKeys"
      :caption="filteredCaption"
      :loading="balancesLoading"
      :swapAvailable="!selectedWalletRecoveryOnly"
      @openFiats="$emit('openFiatsPopup', true)"
    />

    <header v-else class="wallet-header">
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

    <ContentForm v-if="!allWalletsScope" :height="dashboardEnabled ? undefined : contentFormHeight">
      <div class="content">
        <WalletSettings
          :activeTabName="activeTabName"
          :filterValue="filterValue"
          :showAssetsManagementForm="showAssetsManagementForm"
          :tokenGroups="filteredTokenGroups"
          :hideZero="accountsStore.portfolioView.hideZero"
          :showTestnets="accountsStore.portfolioView.showTestnets"
          :lens="accountsStore.portfolioView.lens"
          :sort="portfolioSort"
          :showSortControl="legacyOrderIndex.size > 0"
          :hiddenAssetCount="hiddenAssetCount"
          :manageHiddenOnly="manageHiddenOnly"
          :refreshSlotId="refreshSlotId"
          @update:filterValue="updateFilterValue"
          @update:activeTabName="updateActiveTabName"
          @update:showAssetsManagementForm="toggleAssetsManagementForm"
          @update:hideZero="setHideZero"
          @update:showTestnets="setShowTestnets"
          @update:manageHiddenOnly="setManageHiddenOnly"
          @update:lens="setLens"
          @update:sort="setSort"
        />

        <router-view
          :route="ownRoute"
          :balances="filteredTokenGroups"
          :showAssetsManagementForm="showAssetsManagementForm"
          :manageHiddenOnly="manageHiddenOnly"
          :filterValue="filterValue"
          :refreshSlotId="refreshSlotId"
          @toggleNetworkManagementVisible="toggleNetworkManagementVisible"
          @toggleAssetsManagementForm="toggleAssetsManagementForm"
          @update:manageHiddenOnly="setManageHiddenOnly"
        />
      </div>
    </ContentForm>

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
import { accountController } from '@/controllers/accountController';
import WalletBalance from '@/screens/main/WalletBalance.vue';
import NetworkManagement from '@/screens/wallet&asset/wallet/NetworkManagement.vue';
import NetworkUnavailablePopup from '@/screens/wallet&asset/wallet/NetworkUnavailablePopup.vue';
import GoogleExportPopup from '@/screens/wallet&asset/wallet/GoogleExportPopup.vue';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { defaultSortingCurrencies, filterBalanceItemsByNetwork } from '@/helpers/currencies';
import { usePortfolio } from '@/portfolio/usePortfolio';
import { PORTFOLIO_DASHBOARD_ENABLED } from '@/portfolio/dashboard/dashboardFlag';
import { effectiveScope } from '@/portfolio/dashboard/preferences';
import { resolvePortfolioSort, type PortfolioLens, type PortfolioSort } from '@/portfolio/portfolioViewSettings';
import { formatDecimalString } from '@/helpers/numbers';
import { CONTENT_FORM_HEIGHT, IS_EXTENSION } from '@/consts/global';
import { networksIsPending } from '@/helpers/shimmers';
import BaseApi from '@/util/BaseApi';
import { fetchEvmBalance } from '@/extension/messaging';
import { isSameString } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { usePortfolioDashboardStore } from '@/stores/portfolioDashboard';
import { isSelectedWalletRecoveryOnly } from '@/util/walletRecoveryPolicy';

// Kept-alive wallet screens live side by side, so each gives its toolbar's Refresh place an id of its own.
let walletViews = 0;

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
    const { summary: portfolioSummary, filteredTotal, loadStatus, legacyOrderIndex, summaryInput, hiddenKeys } = usePortfolio();

    return { portfolioSummary, filteredTotal, loadStatus, legacyOrderIndex, summaryInput, hiddenKeys };
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      showNetworkManagement: false,
      showAssetsManagementForm: false,
      manageHiddenOnly: false,
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
    activeTabName() {
      return this.$route.name;
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
    // The "Hidden (N)" filter lists hidden testnet assets only while testnets are shown.
    hiddenAssetCount() {
      const { hiddenAssetCount, hiddenTestnetAssetCount } = this.portfolioSummary;

      return hiddenAssetCount + (this.accountsStore.portfolioView.showTestnets ? hiddenTestnetAssetCount : 0);
    },
    portfolioSort(): PortfolioSort {
      return resolvePortfolioSort(this.accountsStore.portfolioView, this.legacyOrderIndex.size > 0);
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
    sortedTokenGroups() {
      const balances = this.accountsStore.selectedWallet.hasEthereum
            ? this.accountsStore.balances
            : this.accountsStore.balances.filter((el) => !BaseApi.isEthereumNetwork(el.mainNetwork));

          const { address } = this.accountsStore.selectedWallet;

          if (address === '') return [];

          if (!this.accountsStore.isCustomSort(address))
            return defaultSortingCurrencies(
              this.accountsStore.balances,
              this.networksStore.assetsPrice,
              this.accountsStore.selectedNetwork
            );

          const sequence = accountController.getSequenceAssetsByAddress(address);

          return balances.sort((currency1, currency2) => {
            const index1 = sequence.indexOf(currency1.groupId);
            const index2 = sequence.indexOf(currency2.groupId);

            return index1 - index2;
          });
    },
    showShimmers() {
      return networksIsPending(
        this.networksStore.networks, this.accountsStore.selectedNetwork, this.accountsStore.selectedWallet.address
      );
    },
    showLoadingBalance() {
      return this.showShimmers;
    },
    filteredTokenGroups() {
      const isAllNetworks = isSameString(this.accountsStore.selectedNetwork, ALL_NETWORKS);

          const tokenGroups = this.accountsStore.selectedWallet.isMobile
            ? this.sortedTokenGroups.filter(({ balances }) => {
                return balances.some((balance) => {
                  const account = this.accountsStore.accounts.find(
                    ({ address }) => address === this.accountsStore.selectedWallet.address
                  );

                  const network = this.networksStore.getNetwork(balance.name);

                  return account?.chains?.some((el) => network.chainId.includes(el));
                });
              })
            : this.sortedTokenGroups;

          const filteredByNetwork = isAllNetworks
            ? tokenGroups
            : tokenGroups.filter(({ balances }) => {
                return balances.some((balance) => filterBalanceItemsByNetwork(balance, this.accountsStore.selectedNetwork));
              });

          if (this.showAssetsManagementForm) return filteredByNetwork;

          const filter = this.filterValue.trim().toLowerCase();

          return filteredByNetwork.filter(({ symbol }) => symbol.toLowerCase().includes(filter));
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
      this.manageHiddenOnly = false;
    },
  },
  activated() {
    fetchEvmBalance(undefined, this.accountsStore.selectedWallet.ethereumAddress);
  },
  deactivated() {
    this.showAssetsManagementForm = false;
        this.manageHiddenOnly = false;
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
      if (!value) this.manageHiddenOnly = false;
    },
    // "Hide zero balances" is a view filter: it never writes an asset preference, so a later deposit shows up.
    setHideZero(value: boolean) {
      this.accountsStore.updatePortfolioView({ hideZero: value });
    },
    setShowTestnets(value: boolean) {
      this.accountsStore.updatePortfolioView({ showTestnets: value });
    },
    setLens(lens: PortfolioLens) {
      this.accountsStore.updatePortfolioView({ lens });
    },
    setSort(sort: PortfolioSort) {
      this.accountsStore.updatePortfolioView({ sort });
    },
    setManageHiddenOnly(value: boolean) {
      this.manageHiddenOnly = value;
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
