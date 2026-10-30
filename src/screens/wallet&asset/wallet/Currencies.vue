<template>
  <Scroll class="portfolio-scroll">
    <SearchResultStatus
      label="common.searchAmongAssets"
      :count="searchResultCount"
      :active="searching && !showLoader"
    />
    <div class="portfolio-actions">
      <span v-if="refreshError" class="refresh-error" role="status">{{ refreshError }}</span>
      <!-- What is listed may not be all yet: some networks of this wallet have not answered. -->
      <span v-else-if="checkingNetworksText" class="refresh-error" data-testid="portfolioChecking" role="status">
        {{ checkingNetworksText }}
      </span>
      <!-- On the wallet screen the button sits at the end of the toolbar's view row and this row shows only a status.
           Until that slot is on the page the button stays here; a disabled Teleport still resolves its target, so
           without a slot it names one that always exists. -->
      <Teleport :to="refreshSlot ?? 'body'" :disabled="!refreshSlot">
        <button
          class="portfolio-refresh"
          :class="{ 'portfolio-refresh--busy': refreshing }"
          data-testid="portfolioRefresh"
          type="button"
          :title="$t(refreshing ? 'portfolioPage.syncing' : 'portfolioPage.refresh')"
          :disabled="refreshing"
          :aria-busy="refreshing"
          @click="refreshPortfolio"
        >
          <Icon icon="reload" width="18px" height="18px" :hover="false" class="refresh-icon" />
          <span class="refresh-label">{{ $t(refreshing ? 'portfolioPage.syncing' : 'portfolioPage.refresh') }}</span>
        </button>
      </Teleport>
    </div>

    <div v-if="showLoader" class="portfolio-loading" data-testid="portfolioLoading" role="status" aria-live="polite">
      <Loader class="asset-loader" />
      <strong>{{ $t('portfolioPage.loadingBalances') }}</strong>
      <span v-if="loadStatus.pendingCount">{{ pendingNetworksText }}</span>
    </div>

    <template v-else>
      <PortfolioLayoutNote
        v-if="showLayoutNote"
        :customOrderKept="tokenSort === 'custom'"
        @dismiss="dismissLayoutNote"
        @useNetworks="showByNetwork"
      />

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

      <template v-if="tokenLens">
        <div v-if="tokenRows.length" class="token-list" data-testid="portfolioTokenList">
          <PortfolioTokenRow
            v-for="row in splitTokenRows.funded"
            :key="row.id"
            :row="row"
            :manage="showAssetsManagementForm"
            :forceExpanded="hiddenOnly"
            :search="searchQuery"
          />

          <PortfolioZeroNetworks
            v-if="splitTokenRows.zeroOnly.length"
            :label="zeroTokensLabel"
            :expanded="zeroNetworksExpanded"
            :locked="zeroNetworksLocked"
            @toggle="setZeroNetworksExpanded"
          >
            <PortfolioTokenRow
              v-for="row in splitTokenRows.zeroOnly"
              :key="row.id"
              :row="row"
              :manage="showAssetsManagementForm"
              :forceExpanded="hiddenOnly"
              :search="searchQuery"
            />
          </PortfolioZeroNetworks>
        </div>

        <!-- Detected tokens are never grouped: they stay with the network they were found on. -->
        <div v-if="detectedSections.length" class="network-list" data-testid="portfolioDetectedList">
          <PortfolioNetworkSection
            v-for="section in detectedSections"
            :key="section.key"
            :section="section"
            :manage="showAssetsManagementForm"
            :forceExpanded="searching || hiddenOnly"
            :search="searchQuery"
          />
        </div>
      </template>

      <div v-else-if="visibleSections.length" class="network-list" data-testid="portfolioNetworkList">
        <PortfolioNetworkSection
          v-for="section in splitSections.funded"
          :key="section.key"
          :section="section"
          :manage="showAssetsManagementForm"
          :forceExpanded="searching || hiddenOnly"
            :search="searchQuery"
        />

        <PortfolioZeroNetworks
          v-if="splitSections.zeroOnly.length"
          :label="zeroNetworksLabel"
          :expanded="zeroNetworksExpanded"
          :locked="zeroNetworksLocked"
          @toggle="setZeroNetworksExpanded"
        >
          <PortfolioNetworkSection
            v-for="section in splitSections.zeroOnly"
            :key="section.key"
            :section="section"
            :manage="showAssetsManagementForm"
            :forceExpanded="searching || hiddenOnly"
            :search="searchQuery"
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
import { computed, defineComponent } from 'vue';
import PortfolioNetworkSection from './PortfolioNetworkSection.vue';
import PortfolioZeroNetworks from './PortfolioZeroNetworks.vue';
import PortfolioExclusions from './PortfolioExclusions.vue';
import PortfolioHiddenFundsNotice from './PortfolioHiddenFundsNotice.vue';
import PortfolioLayoutNote from './PortfolioLayoutNote.vue';
import PortfolioTokenRow from './PortfolioTokenRow.vue';
import SearchResultStatus from '@/components/SearchResultStatus.vue';
import { splitZeroSections, type PortfolioNetworkSection as PortfolioSection } from '@/portfolio/assetIdentity';
import { hiddenFundsSignature, type PortfolioViewSettings } from '@/portfolio/portfolioViewSettings';
import { shouldShowLayoutNote } from '@/portfolio/layoutNotice';
import { splitZeroTokenRows, type PortfolioTokenRow as TokenRow } from '@/portfolio/tokenLens';
import { usePortfolio } from '@/portfolio/usePortfolio';
import { useWalletTokenRows } from '@/portfolio/useWalletTokenRows';
import { isSameString } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { forceAssetDiscoverySweep } from '@/extension/messaging/asset-discovery';
import { ALL_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { fetchNfts } from '@/extension/messaging/nfts';

// One observer per list while it waits for the toolbar's Refresh place; kept off the reactive state.
const refreshSlotObservers = new WeakMap<object, MutationObserver>();

export default defineComponent({
  name: 'Currencies',
  components: {
    SearchResultStatus,
    PortfolioNetworkSection,
    PortfolioZeroNetworks,
    PortfolioExclusions,
    PortfolioHiddenFundsNotice,
    PortfolioLayoutNote,
    PortfolioTokenRow,
  },
  props: {
    balances: Array,
    filterValue: String,
    showAssetsManagementForm: Boolean,
    /** Manage mode lists only hidden assets (the "Hidden (N)" filter). */
    manageHiddenOnly: Boolean,
    /** Where the toolbar keeps a place for Refresh (WalletSettings.vue); without one it stays in the list. */
    refreshSlotId: { type: String, default: '' },
  },
  emits: ['toggleAssetsManagementForm', 'update:manageHiddenOnly', 'toggleNetworkManagementVisible'],
  setup(props) {
    const portfolio = usePortfolio();
    const { isFiltered, summary, filteredSummary, loadStatus } = portfolio;
    const manage = computed(() => Boolean(props.showAssetsManagementForm));
    const hiddenOnly = computed(() => manage.value && Boolean(props.manageHiddenOnly));
    // Manage has no search field, so text typed before never narrows it (Review must list every hidden asset).
    const search = computed(() => props.filterValue ?? '');
    const {
      searchQuery,
      searching,
      showsTestnets,
      visibleSections,
      tokenSort,
      tokenRows,
    } = useWalletTokenRows({ search, manage, hiddenOnly, portfolio });

    return {
      isFiltered,
      summary,
      filteredSummary,
      loadStatus,
      hiddenOnly,
      searchQuery,
      searching,
      showsTestnets,
      visibleSections,
      tokenSort,
      tokenRows,
    };
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
      refreshing: false,
      refreshError: '',
      refreshSlot: null as HTMLElement | null,
    };
  },
  computed: {
    // Until something the wallet holds has arrived, an empty list would be a guess (first open after an update, a
    // wallet switch). Manage lists every asset whatever it holds, so it never waits.
    showLoader() {
      return (
        this.accountsStore.isBalanceLoading || (this.loadStatus.state === 'loading' && !this.showAssetsManagementForm)
      );
    },
    pendingNetworksText(): string {
      const count = this.loadStatus.pendingCount;

      return this.$t('portfolioPage.checkingNetworks', count, { count });
    },
    checkingNetworksText(): string {
      return this.loadStatus.state === 'syncing' && !this.showAssetsManagementForm ? this.pendingNetworksText : '';
    },
    viewSettings(): PortfolioViewSettings {
      return this.accountsStore.portfolioView;
    },
    searchResultCount(): number {
      return this.visibleSections.reduce((count, section) => count + section.assets.length + section.detectedAssets.length, 0);
    },
    splitSections(): { funded: PortfolioSection[]; zeroOnly: PortfolioSection[] } {
      return splitZeroSections(this.visibleSections);
    },
    /** "By token" is the default lens (portfolio contract §6); the choice is stored per wallet. */
    tokenLens(): boolean {
      return this.viewSettings.lens === 'token';
    },
    splitTokenRows(): { funded: TokenRow[]; zeroOnly: TokenRow[] } {
      return splitZeroTokenRows(this.tokenRows);
    },
    detectedSections(): PortfolioSection[] {
      return this.visibleSections
        .filter((section) => section.detectedAssets.length > 0)
        .map((section) => ({ ...section, assets: [] }));
    },
    zeroTokensLabel(): string {
      const count = this.splitTokenRows.zeroOnly.length;

      return this.listsPopularNoBalance
        ? this.$t('portfolioPage.popularNoBalance')
        : this.$t('portfolioPage.zeroTokens', count, { count });
    },
    // Once per install, for a wallet that existed before this layout: what changed and how to switch back.
    showLayoutNote(): boolean {
      if (!this.tokenLens || this.showAssetsManagementForm) return false;

      const account = this.accountsStore.accounts.find(({ address }) => address === this.accountsStore.selectedWallet.address);

      return shouldShowLayoutNote(account, this.accountsStore.portfolioLayout);
    },
    walletIsEmpty(): boolean {
      return this.splitSections.funded.length === 0 && !this.searching && !this.showAssetsManagementForm;
    },
    /** Anything funded anywhere in the wallet, hidden or outside the display filter included. */
    walletHoldsAssets(): boolean {
      const { total, hiddenCount, unpricedCount } = this.summary;

      return hiddenCount > 0 || unpricedCount > 0 || Number(total) > 0;
    },
    // "Popular networks" only while the zero block lists them for a wallet that holds nothing yet, in either lens.
    listsPopularNoBalance(): boolean {
      const listsPopularNetworks = [ALL_NETWORKS, POPULAR_NETWORKS].some((group) =>
        isSameString(group, this.accountsStore.selectedNetwork)
      );

      return this.walletIsEmpty && !this.walletHoldsAssets && listsPopularNetworks;
    },
    zeroNetworksLabel(): string {
      const count = this.splitSections.zeroOnly.length;

      return this.listsPopularNoBalance
        ? this.$t('portfolioPage.popularNoBalance')
        : this.$t('portfolioPage.zeroNetworks', count, { count });
    },
    // A search or the Hidden filter opens the block, so a match or a hidden asset with no balance is never tucked away.
    zeroNetworksLocked(): boolean {
      return this.searching || this.hiddenOnly;
    },
    zeroNetworksExpanded(): boolean {
      return this.zeroNetworksLocked || this.viewSettings.zeroNetworksExpanded;
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
      // Networks that have not answered yet may still hold something: after an update this is not an empty wallet.
      if (this.loadStatus.pendingCount > 0) return this.$t('portfolioPage.noAssetsDetected');
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
  // A kept-alive wallet screen off the page still follows the route, so this list can be created where the toolbar's
  // slot is not in the document yet; the dashboard's toolbar also arrives a moment after the list. Look it up whenever
  // the screen is back on the page, and keep looking until it is there.
  mounted() {
    this.watchRefreshSlot();
  },
  activated() {
    this.watchRefreshSlot();
  },
  deactivated() {
    this.stopWatchingRefreshSlot();
  },
  beforeUnmount() {
    this.stopWatchingRefreshSlot();
  },
  methods: {
    findRefreshSlot() {
      this.refreshSlot = this.refreshSlotId ? document.getElementById(this.refreshSlotId) : null;
    },
    watchRefreshSlot() {
      this.stopWatchingRefreshSlot();
      this.findRefreshSlot();
      if (this.refreshSlot || !this.refreshSlotId || typeof MutationObserver === 'undefined') return;

      refreshSlotObservers.set(
        this,
        new MutationObserver(() => {
          this.findRefreshSlot();
          if (this.refreshSlot) this.stopWatchingRefreshSlot();
        })
      );
      refreshSlotObservers.get(this)?.observe(document.body, { childList: true, subtree: true });
    },
    stopWatchingRefreshSlot() {
      refreshSlotObservers.get(this)?.disconnect();
      refreshSlotObservers.delete(this);
    },
    async refreshPortfolio() {
      if (this.refreshing) return;

      this.refreshing = true;
      this.refreshError = '';

      try {
        // The sweep skips test networks, so a selected one is reloaded directly.
        const refreshes: Promise<unknown>[] = [
          forceAssetDiscoverySweep(),
          this.networksStore.loadIndexerNetworkBalance(this.accountsStore.selectedNetwork),
        ];
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
    dismissLayoutNote() {
      this.accountsStore.dismissPortfolioLayoutNote();
    },
    showByNetwork() {
      this.accountsStore.updatePortfolioView({ lens: 'network' });
      this.accountsStore.dismissPortfolioLayoutNote();
    },
  },
});
</script>

<style lang="scss" scoped>
.portfolio-scroll {
  margin-right: -16px;
}

.network-list,
.token-list {
  min-height: 0;
}

.portfolio-actions {
  min-height: 28px;
  padding: 0 16px 4px 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;

  // Refresh moved to the toolbar and nothing to report: no empty row above the list.
  &:empty {
    display: none;
  }
}

// An icon among the list's tools; its word stays for screen readers and as the tooltip.
.portfolio-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: palette($pink-color, var(--fw-link));
  cursor: pointer;
  font: inherit;

  &:hover:not(:disabled) {
    background: var(--fw-raised-2);
  }

  &:disabled {
    cursor: default;
    opacity: 0.55;
  }
}

@media (max-width: 380px) {
  .portfolio-refresh {
    width: 32px;
    height: 32px;
  }
}

.portfolio-refresh--busy .refresh-icon {
  animation: refresh-spin 1s linear infinite;
}

@keyframes refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .portfolio-refresh--busy .refresh-icon {
    animation: none;
  }
}

.refresh-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.refresh-error {
  color: $gray-color;
  font-size: 0.68rem;
  line-height: 1.2;
  text-align: right;
}

.portfolio-empty,
.portfolio-loading {
  min-height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.portfolio-loading {
  flex-direction: column;
  gap: 10px;
  padding-right: 16px;
  color: $gray-color;
  text-align: center;

  .asset-loader {
    margin: 0 0 6px;
  }

  strong {
    color: $plain-white;
  }

  span {
    font-size: 0.78rem;
  }
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
