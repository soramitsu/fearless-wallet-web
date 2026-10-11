<template>
  <Scroll class="portfolio-scroll">
    <div class="portfolio-actions">
      <span v-if="refreshError" class="refresh-error" role="status">{{ refreshError }}</span>
      <button
        class="portfolio-refresh"
        data-testid="portfolioRefresh"
        type="button"
        :disabled="refreshing"
        :aria-busy="refreshing"
        @click="refreshPortfolio"
      >
        {{ $t(refreshing ? 'portfolioPage.syncing' : 'portfolioPage.refresh') }}
      </button>
    </div>

    <Loader v-if="showLoader" class="asset-loader" />

    <template v-else>
      <PortfolioHiddenFundsNotice
        v-if="showHiddenFundsNotice"
        :count="summary.hiddenCount"
        @review="reviewHidden"
        @keepHidden="keepHidden"
      />

      <div v-if="showEmptyState" class="portfolio-empty" data-testid="infoText">
        <Icon icon="wallet" className="empty-icon" :hover="false" />
        <strong>{{ emptyTitle }}</strong>
        <span>{{ emptyDescription }}</span>
      </div>

      <div v-if="visibleSections.length" class="network-list" data-testid="portfolioNetworkList">
        <PortfolioNetworkSection
          v-for="section in splitSections.funded"
          :key="section.key"
          :section="section"
          :manage="showAssetsManagementForm"
          :forceExpanded="searching || hiddenOnly"
        />

        <PortfolioZeroNetworks
          v-if="splitSections.zeroOnly.length"
          :label="zeroNetworksLabel"
          :expanded="zeroNetworksExpanded"
          @toggle="setZeroNetworksExpanded"
        >
          <PortfolioNetworkSection
            v-for="section in splitSections.zeroOnly"
            :key="section.key"
            :section="section"
            :manage="showAssetsManagementForm"
            :forceExpanded="searching || hiddenOnly"
          />
        </PortfolioZeroNetworks>
      </div>

      <PortfolioExclusions
        v-if="!showAssetsManagementForm"
        :hiddenCount="summary.hiddenCount"
        :unpricedCount="summary.unpricedCount"
        :poolStakesExcluded="summary.poolStakesExcluded"
        :testnetCount="testnetsNotShownCount"
        @manageHidden="reviewHidden"
        @showTestnets="showTestnets"
      />
    </template>
  </Scroll>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import PortfolioNetworkSection from './PortfolioNetworkSection.vue';
import PortfolioZeroNetworks from './PortfolioZeroNetworks.vue';
import PortfolioExclusions from './PortfolioExclusions.vue';
import PortfolioHiddenFundsNotice from './PortfolioHiddenFundsNotice.vue';
import {
  buildPortfolioSections,
  filterSectionAssets,
  filterSectionsBySearch,
  splitZeroSections,
  type PortfolioNetworkSection as PortfolioSection,
} from '@/portfolio/assetIdentity';
import { hiddenFundsSignature, type PortfolioViewSettings } from '@/portfolio/portfolioViewSettings';
import { usePortfolio } from '@/portfolio/usePortfolio';
import { isTestnetNetwork } from '@/portfolio/zeroRule';
import { isSameString } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { useExtensionStore } from '@/stores/extension';
import { forceAssetDiscoverySweep } from '@/extension/messaging/asset-discovery';
import { ALL_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { fetchNfts } from '@/extension/messaging/nfts';

export default defineComponent({
  name: 'Currencies',
  components: { PortfolioNetworkSection, PortfolioZeroNetworks, PortfolioExclusions, PortfolioHiddenFundsNotice },
  props: {
    balances: Array,
    filterValue: String,
    showAssetsManagementForm: Boolean,
    /** Manage mode lists only hidden assets (the "Hidden (N)" filter). */
    manageHiddenOnly: Boolean,
  },
  emits: ['toggleAssetsManagementForm', 'update:manageHiddenOnly', 'toggleNetworkManagementVisible'],
  setup() {
    const {
      effectivePreferences,
      preferenceSource,
      addressForNetwork,
      walletScope,
      networkFilter,
      isFiltered,
      zeroRule,
      summary,
      filteredSummary,
    } = usePortfolio();

    return {
      effectivePreferences,
      preferenceSource,
      addressForNetwork,
      walletScope,
      networkFilter,
      isFiltered,
      zeroRule,
      summary,
      filteredSummary,
    };
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
      extensionStore: useExtensionStore(),
      refreshing: false,
      refreshError: '',
    };
  },
  computed: {
    showLoader() {
      return this.accountsStore.isBalanceLoading;
    },
    viewSettings(): PortfolioViewSettings {
      return this.accountsStore.portfolioView;
    },
    // Manage has no search field, so a search typed before never narrows it (Review must list every hidden asset).
    searching(): boolean {
      return !this.showAssetsManagementForm && Boolean(this.filterValue?.trim());
    },
    /** A test network chosen as the only network is shown even with the Testnets switch off. */
    selectedTestnet(): boolean {
      const selected = this.networksStore.allNetworks.find(({ name }) =>
        isSameString(name, this.accountsStore.selectedNetwork)
      );

      return Boolean(selected && isTestnetNetwork(selected));
    },
    showsTestnets(): boolean {
      return this.viewSettings.showTestnets || (!this.hiddenOnly && this.selectedTestnet);
    },
    portfolioSections(): PortfolioSection[] {
      return buildPortfolioSections({
        groups: this.accountsStore.balances,
        networks: this.networksStore.allNetworks,
        prices: this.networksStore.assetsPrice.tokenPriceMap,
        preferences: this.effectivePreferences,
        preferenceSource: this.preferenceSource,
        scanStates: this.accountsStore.networkScanStates,
        surfaceDiscoveredAssets:
          (this.extensionStore.features?.assetDiscoveryMode ??
            this.extensionStore.features?.portfolio?.assetDiscoveryMode ??
            'shadow') === 'visible',
        addressForNetwork: this.addressForNetwork,
        mode: this.showAssetsManagementForm ? 'manage' : 'view',
        hideZero: this.viewSettings.hideZero,
        showHidden: this.viewSettings.showHidden,
        showTestnets: this.showsTestnets,
        isDefaultVisibleAtZero: (network, asset) => this.zeroRule(network, asset.key),
        walletScope: this.walletScope,
        // The Hidden list is wallet-wide, like the notice, the footer and the "Hidden (N)" count that open it.
        networkFilter: this.hiddenOnly ? undefined : this.networkFilter,
      });
    },
    visibleSections(): PortfolioSection[] {
      const sections = this.hiddenOnly
        ? filterSectionAssets(this.portfolioSections, (asset) => asset.hidden)
        : this.portfolioSections;

      return this.searching ? filterSectionsBySearch(sections, this.filterValue) : sections;
    },
    splitSections(): { funded: PortfolioSection[]; zeroOnly: PortfolioSection[] } {
      return splitZeroSections(this.visibleSections);
    },
    walletIsEmpty(): boolean {
      return this.splitSections.funded.length === 0 && !this.searching && !this.showAssetsManagementForm;
    },
    /** Anything funded anywhere in the wallet, hidden or outside the display filter included. */
    walletHoldsAssets(): boolean {
      const { total, hiddenCount, unpricedCount } = this.summary;

      return hiddenCount > 0 || unpricedCount > 0 || Number(total) > 0;
    },
    zeroNetworksLabel(): string {
      const count = this.splitSections.zeroOnly.length;
      const listsPopularNetworks = [ALL_NETWORKS, POPULAR_NETWORKS].some((group) =>
        isSameString(group, this.accountsStore.selectedNetwork)
      );

      // "Popular networks" only while the block lists them for a wallet that holds nothing yet.
      return this.walletIsEmpty && !this.walletHoldsAssets && listsPopularNetworks
        ? this.$t('portfolioPage.popularNoBalance')
        : this.$t('portfolioPage.zeroNetworks', count, { count });
    },
    // A search or the Hidden filter opens the block, so a match or a hidden asset with no balance is never tucked away.
    zeroNetworksExpanded(): boolean {
      return this.searching || this.hiddenOnly || this.viewSettings.zeroNetworksExpanded;
    },
    hiddenOnly(): boolean {
      return this.showAssetsManagementForm && this.manageHiddenOnly;
    },
    // Nothing to list, or no funded row in view (zero-balance networks stay below, collapsed). Funds the user
    // hid in this view are explained by the hidden-funds notice and the "hidden not included · Manage" footer.
    showEmptyState(): boolean {
      if (!this.walletIsEmpty) return this.visibleSections.length === 0;

      return this.filteredSummary.hiddenCount === 0 || !navigator.onLine;
    },
    /** Funded test-network assets the Testnets switch keeps out of this view; the footer offers to show them. */
    testnetsNotShownCount(): number {
      return this.showsTestnets ? 0 : this.filteredSummary.testnetFundedCount;
    },
    hiddenFundsSignature(): string {
      return hiddenFundsSignature(this.summary.hiddenFundedKeys);
    },
    // 3.0.5 users whose "Hide zero" click hid assets that later received funds see this until they decide.
    showHiddenFundsNotice(): boolean {
      return (
        !this.showAssetsManagementForm &&
        this.summary.hiddenCount > 0 &&
        this.viewSettings.hiddenFundsNoticeAck !== this.hiddenFundsSignature
      );
    },
    // The header total covers the whole wallet, so a filtered view without a balance says so instead of "empty".
    showsFilteredEmpty(): boolean {
      return this.isFiltered && this.walletHoldsAssets;
    },
    emptyTitle() {
      if (!navigator.onLine) return this.$t('portfolioPage.offline');
      if (this.hiddenOnly) return this.$t('portfolioPage.noHiddenAssets');
      if (this.searching) return this.$t('portfolioPage.noMatchingAssets');
      if (this.showsFilteredEmpty) return this.$t('portfolioPage.noBalanceInView');
      return this.$t('portfolioPage.emptyWalletTitle');
    },
    emptyDescription() {
      if (!navigator.onLine) return this.$t('portfolioPage.offlineDescription');
      if (this.hiddenOnly) return this.$t('portfolioPage.noHiddenAssetsDescription');
      if (this.searching) return this.$t('portfolioPage.searchDescription');
      if (this.showsFilteredEmpty) return this.$t('portfolioPage.scanDescription');
      return this.$t('portfolioPage.emptyWalletDescription');
    },
  },
  methods: {
    async refreshPortfolio() {
      if (this.refreshing) return;

      this.refreshing = true;
      this.refreshError = '';

      try {
        const refreshes: Promise<unknown>[] = [forceAssetDiscoverySweep()];
        const ethereumAddress = this.accountsStore.selectedWallet.ethereumAddress;

        if (ethereumAddress) refreshes.push(fetchNfts(ethereumAddress));

        await Promise.all(refreshes);
      } catch {
        this.refreshError = this.$t('portfolioPage.syncFailedBalancesShown');
      } finally {
        this.refreshing = false;
      }
    },
    setZeroNetworksExpanded(expanded: boolean) {
      this.accountsStore.updatePortfolioView({ zeroNetworksExpanded: expanded });
    },
    reviewHidden() {
      this.$emit('toggleAssetsManagementForm', true);
      this.$emit('update:manageHiddenOnly', true);
    },
    keepHidden() {
      this.accountsStore.updatePortfolioView({ hiddenFundsNoticeAck: this.hiddenFundsSignature });
    },
    showTestnets() {
      this.accountsStore.updatePortfolioView({ showTestnets: true });
    },
  },
});
</script>

<style lang="scss" scoped>
.portfolio-scroll {
  margin-right: -16px;
}

.network-list {
  min-height: 0;
}

.portfolio-actions {
  min-height: 28px;
  padding: 0 16px 4px 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.portfolio-refresh {
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: $pink-color;
  cursor: pointer;
  font: inherit;
  font-size: 0.72rem;

  &:disabled {
    cursor: default;
    opacity: 0.55;
  }
}

.refresh-error {
  color: $gray-color;
  font-size: 0.68rem;
  line-height: 1.2;
  text-align: right;
}

.portfolio-empty,
.asset-loader {
  min-height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.portfolio-empty {
  flex-direction: column;
  gap: 10px;
  padding-right: 16px;
  color: $gray-color;
  text-align: center;

  strong {
    color: $plain-white;
  }

  span {
    max-width: 290px;
    font-size: 0.78rem;
    line-height: 1.35;
  }
}

.empty-icon {
  width: 34px;
  height: 34px;
  color: $gray-color;
}
</style>
