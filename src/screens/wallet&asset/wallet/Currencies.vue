<template>
  <Scroll class="portfolio-scroll">
    <!-- One list, found two ways: the search looks at token and network names, the chips narrow it to one network. -->
    <div class="list-tools" data-testid="portfolioListTools">
      <AssetSearchField
        :value="filterValue ?? ''"
        data-testid="searchInput"
        @change="$emit('update:filterValue', $event)"
      />

      <NetworkFilterChips
        :options="networkOptions"
        :labels="networkFilterLabels"
        :selected="accountsStore.selectedNetwork"
        :groupLabel="networkGroupLabel"
        :showMore="true"
        @select="selectNetwork"
        @more="networkPickerOpen = true"
      />
    </div>

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
      <PortfolioLayoutNote v-if="showLayoutNote" :customOrderKept="tokenSort === 'custom'" @dismiss="dismissLayoutNote" />

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
        <!-- A search that finds nothing on the chosen network may find it on another one. -->
        <button
          v-if="offerAllNetworks"
          type="button"
          class="empty-action"
          data-testid="searchAllNetworks"
          @click="selectNetwork(allNetworks)"
        >
          {{ $t('walletHome.search.searchAll') }}
        </button>
        <!-- Nothing held here yet: any token can still be added to the list, at zero. -->
        <button v-else-if="offerAddTokens" type="button" class="empty-action" data-testid="emptyAddTokens" @click="openManageAssets">
          {{ $t('walletHome.list.addTokens') }}
        </button>
      </div>

      <!-- One list: what the wallet holds, found on its own, then the tokens the owner added at zero. -->
      <div v-if="tokenRows.length" class="token-list" data-testid="portfolioTokenList">
        <PortfolioTokenRow v-for="row in tokenRows" :key="row.id" :row="row" :search="searchQuery" />
      </div>

      <!-- Detected tokens are never grouped: they stay with the network they were found on. -->
      <div v-if="detectedSections.length" class="network-list" data-testid="portfolioDetectedList">
        <PortfolioNetworkSection
          v-for="section in detectedSections"
          :key="section.key"
          :section="section"
          :forceExpanded="searching"
          :search="searchQuery"
        />
      </div>

      <button
        v-if="!showEmptyState && !searching"
        type="button"
        class="add-tokens"
        data-testid="addTokens"
        @click="openManageAssets"
      >
        <Icon icon="circle-plus" width="18px" height="18px" :hover="false" class="add-tokens-icon" />
        <span>{{ $t('walletHome.list.addTokens') }}</span>
      </button>

      <PortfolioExclusions
        :hiddenCount="summary.hiddenCount"
        :unpricedCount="summary.unpricedCount"
        :poolStakesExcluded="summary.poolStakesExcluded"
        :testnetCount="testnetsNotShownCount"
        :unverifiedCount="unverifiedNotListedCount"
        @manageHidden="reviewHidden"
        @showTestnets="showTestnets"
        @reviewUnverified="reviewUnverified"
      />
    </template>

    <!-- Every network, with Popular and Favorites: the same list the header's network button opens. -->
    <NetworkPicker v-if="networkPickerOpen" :type="accountsStore.selectedNetwork" @handlerClose="networkPickerOpen = false" />
  </Scroll>
</template>

<script lang="ts">
import { computed, defineComponent } from 'vue';
import PortfolioNetworkSection from './PortfolioNetworkSection.vue';
import PortfolioExclusions from './PortfolioExclusions.vue';
import PortfolioHiddenFundsNotice from './PortfolioHiddenFundsNotice.vue';
import PortfolioLayoutNote from './PortfolioLayoutNote.vue';
import PortfolioTokenRow from './PortfolioTokenRow.vue';
import AssetSearchField from './AssetSearchField.vue';
import NetworkFilterChips, { type NetworkFilterLabels, type NetworkFilterOption } from './NetworkFilterChips.vue';
import type { PortfolioNetworkSection as PortfolioSection } from '@/portfolio/assetIdentity';
import SearchResultStatus from '@/components/SearchResultStatus.vue';
import NetworkPicker from '@/screens/wallet&asset/NetworkManagement.vue';
import { hiddenFundsSignature, type PortfolioViewSettings } from '@/portfolio/portfolioViewSettings';
import { shouldShowLayoutNote } from '@/portfolio/layoutNotice';
import { usePortfolio } from '@/portfolio/usePortfolio';
import { useWalletTokenRows } from '@/portfolio/useWalletTokenRows';
import { isSameString } from '@/helpers';
import { isNetworkGroup } from '@/helpers/common';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { refreshWalletBalancesWithin } from '@/portfolio/refreshBalances';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { fetchNfts } from '@/extension/messaging/nfts';

// The Manage assets page (routes.ts, Components.ManageAssets). Named here, not imported: the routes table imports this
// list, and a test that loads the list first would build the router before its routes.
const MANAGE_ASSETS = 'ManageAssets';

// One observer per list while it waits for the toolbar's Refresh place; kept off the reactive state.
const refreshSlotObservers = new WeakMap<object, MutationObserver>();

export default defineComponent({
  name: 'Currencies',
  components: {
    SearchResultStatus,
    PortfolioNetworkSection,
    PortfolioExclusions,
    PortfolioHiddenFundsNotice,
    PortfolioLayoutNote,
    PortfolioTokenRow,
    AssetSearchField,
    NetworkFilterChips,
    NetworkPicker,
  },
  props: {
    filterValue: String,
    /** Where the toolbar keeps a place for Refresh (WalletSettings.vue); without one it stays in the list. */
    refreshSlotId: { type: String, default: '' },
  },
  emits: ['update:filterValue', 'toggleNetworkManagementVisible'],
  setup(props) {
    const portfolio = usePortfolio();
    const { isFiltered, summary, networkTotals, filteredSummary, loadStatus } = portfolio;
    const search = computed(() => props.filterValue ?? '');
    // What the wallet holds and what its owner added: a token with no balance is listed only on request (Manage assets).
    const { searchQuery, searching, showsTestnets, visibleSections, tokenSort, tokenRows } = useWalletTokenRows({
      search,
      zeroDefaults: false,
      portfolio,
    });

    return {
      isFiltered,
      summary,
      networkTotals,
      filteredSummary,
      loadStatus,
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
      networkPickerOpen: false,
      allNetworks: ALL_NETWORKS,
    };
  },
  computed: {
    // Until something the wallet holds has arrived, an empty list would be a guess (first open after an update, a
    // wallet switch).
    showLoader() {
      return this.accountsStore.isBalanceLoading || this.loadStatus.state === 'loading';
    },
    pendingNetworksText(): string {
      const count = this.loadStatus.pendingCount;

      return this.$t('portfolioPage.checkingNetworks', count, { count });
    },
    /**
     * What the list may still be missing: networks of this wallet still being checked, then, once the first-load wait
     * is over, the ones that have not answered; otherwise how far the search of the other networks for tokens is.
     */
    checkingNetworksText(): string {
      const { state, pendingCount, waiting } = this.loadStatus;

      if (state === 'syncing') {
        return waiting
          ? this.pendingNetworksText
          : this.$t('balanceStatus.notResponding', pendingCount, { count: pendingCount });
      }

      const discovery = this.accountsStore.discoveryProgress;

      if (discovery?.running && discovery.total > 0) {
        return this.$t('balanceStatus.discovering', { checked: discovery.checked, total: discovery.total });
      }

      return '';
    },
    viewSettings(): PortfolioViewSettings {
      return this.accountsStore.portfolioView;
    },
    searchResultCount(): number {
      return this.visibleSections.reduce((count, section) => count + section.assets.length + section.detectedAssets.length, 0);
    },
    /**
     * The chips after All: every network the wallet holds something on, largest first (test networks while they are
     * shown), and a network chosen in the full list that holds nothing, first, so the filter on screen is always named.
     */
    networkOptions(): NetworkFilterOption[] {
      const options = this.networkTotals
        .filter(({ isTestnet }) => !isTestnet || this.showsTestnets)
        .map(({ name, icon }) => ({ name, icon }));
      const selected = this.accountsStore.selectedNetwork;

      if (isNetworkGroup(selected) || options.some(({ name }) => isSameString(name, selected))) return options;

      const network = this.networksStore.allNetworks.find(({ name }) => isSameString(name, selected));

      return network ? [{ name: network.name, icon: network.icon }, ...options] : options;
    },
    networkFilterLabels(): NetworkFilterLabels {
      return {
        group: this.$t('walletHome.networkFilter.label'),
        all: this.$t('walletHome.networkFilter.all'),
        more: this.$t('walletHome.networkFilter.more'),
      };
    },
    /** Popular or Favorites, when one of those groups is the filter. */
    networkGroupLabel(): string {
      const selected = this.accountsStore.selectedNetwork;

      if (isSameString(selected, POPULAR_NETWORKS)) return this.$t('header.networkManagement.tabs.popular');
      if (isSameString(selected, FAVORITE_NETWORKS)) return this.$t('header.networkManagement.tabs.favorites');
      return '';
    },
    /** A search found nothing under a network filter: the empty state offers to look on every network. */
    offerAllNetworks(): boolean {
      return this.searching && this.isFiltered && this.visibleSections.length === 0;
    },
    /** Nothing held in view and no search: the empty state offers Manage assets, where any token can be added. */
    offerAddTokens(): boolean {
      return !this.searching && navigator.onLine;
    },
    detectedSections(): PortfolioSection[] {
      return this.visibleSections
        .filter((section) => section.detectedAssets.length > 0)
        .map((section) => ({ ...section, assets: [] }));
    },
    // Once per install, for a wallet that existed before this layout, and once for anyone who had the list grouped by
    // network, which is now the chips' job.
    showLayoutNote(): boolean {
      if (this.viewSettings.lens === 'network') return true;

      const account = this.accountsStore.accounts.find(({ address }) => address === this.accountsStore.selectedWallet.address);

      return shouldShowLayoutNote(account, this.accountsStore.portfolioLayout);
    },
    /** Anything funded anywhere in the wallet, hidden or outside the display filter included. */
    walletHoldsAssets(): boolean {
      const { total, hiddenCount, unpricedCount } = this.summary;

      return hiddenCount > 0 || unpricedCount > 0 || Number(total) > 0;
    },
    // Nothing listed: nothing held in view and nothing added. Funds the user hid in this view are explained by the
    // hidden-funds notice and the "hidden not included · Manage" footer instead, unless the wallet is offline.
    showEmptyState(): boolean {
      if (this.visibleSections.length > 0) return false;
      if (this.searching) return true;

      return this.filteredSummary.hiddenCount === 0 || !navigator.onLine;
    },
    /** Funded tokens found off the verified list that this list leaves out; the footer offers to review them. */
    unverifiedNotListedCount(): number {
      return this.detectedSections.length ? 0 : this.summary.unverifiedHeldCount ?? 0;
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
      return this.summary.hiddenCount > 0 && this.viewSettings.hiddenFundsNoticeAck !== this.hiddenFundsSignature;
    },
    // The header total covers the whole wallet, so a filtered view without a balance says so instead of "empty".
    showsFilteredEmpty(): boolean {
      return this.isFiltered && this.walletHoldsAssets;
    },
    emptyTitle() {
      if (!navigator.onLine) return this.$t('portfolioPage.offline');
      if (this.offerAllNetworks) return this.$t('walletHome.search.noMatchOn', { network: this.networkGroupLabel || this.accountsStore.selectedNetwork });
      if (this.searching) return this.$t('portfolioPage.noMatchingAssets');
      if (this.showsFilteredEmpty) return this.$t('portfolioPage.noBalanceInView');
      // Networks that have not answered yet may still hold something: after an update this is not an empty wallet.
      if (this.loadStatus.pendingCount > 0) return this.$t('portfolioPage.noAssetsDetected');
      return this.$t('portfolioPage.emptyWalletTitle');
    },
    emptyDescription() {
      if (!navigator.onLine) return this.$t('portfolioPage.offlineDescription');
      if (this.searching) return this.$t('portfolioPage.searchDescription');
      if (this.showsFilteredEmpty) return this.$t('portfolioPage.scanDescription');
      return this.$t('portfolioPage.emptyWalletDescription');
    },
  },
  watch: {
    // A network picked in the full list is the answer: the list closes on it.
    'accountsStore.selectedNetwork'() {
      this.networkPickerOpen = false;
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
        // The wallet's networks are read again and the others searched; a selected test network, which the search
        // skips, is also read directly.
        const refreshes: Promise<unknown>[] = [
          refreshWalletBalancesWithin(),
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
    // Hidden assets are reviewed in Manage assets, which opens on them.
    reviewHidden() {
      this.$router.push({ name: MANAGE_ASSETS, query: { focus: 'hidden' } }).catch(() => undefined);
    },
    // So are the tokens found that are not verified.
    reviewUnverified() {
      this.$router.push({ name: MANAGE_ASSETS, query: { focus: 'unverified' } }).catch(() => undefined);
    },
    // Add tokens: Manage opens ready to search, on the network the list is narrowed to, if it is narrowed to one.
    openManageAssets() {
      const network = this.isFiltered && !isNetworkGroup(this.accountsStore.selectedNetwork) ? this.accountsStore.selectedNetwork : '';

      this.$router.push({ name: MANAGE_ASSETS, query: { focus: 'search', ...(network ? { search: network } : {}) } }).catch(() => undefined);
    },
    keepHidden() {
      this.accountsStore.updatePortfolioView({ hiddenFundsNoticeAck: this.hiddenFundsSignature });
    },
    showTestnets() {
      this.accountsStore.updatePortfolioView({ showTestnets: true });
    },
    // The same filter the header's network button sets, kept per wallet; one network also has its balance read again.
    selectNetwork(network: string) {
      if (isSameString(network, this.accountsStore.selectedNetwork)) return;

      this.accountsStore.setSelectedNetwork(network);
      if (!isNetworkGroup(network)) void this.networksStore.loadIndexerNetworkBalance(network).catch(() => undefined);
    },
    // A list kept grouped by network becomes the one list for good once its note is read.
    dismissLayoutNote() {
      if (this.viewSettings.lens === 'network') this.accountsStore.updatePortfolioView({ lens: 'token' });
      this.accountsStore.dismissPortfolioLayoutNote();
    },
  },
});
</script>

<style lang="scss" scoped>
.portfolio-scroll {
  margin-right: -16px;
}

// Search and the network chips sit above the list and scroll with it; the list keeps clear of the page gutter.
.list-tools {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 2px 16px 8px 0;
}

.empty-action {
  min-height: 36px;
  margin-top: 4px;
  padding: 0 16px;
  border: $default-border;
  border-radius: 18px;
  background: $secondary-background-color;
  color: $plain-white;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    border-color: palette($pink-lavender-color, var(--fw-select-edge));
  }

  &:focus-visible {
    outline: 2px solid palette($pink-lavender-color, var(--fw-focus));
    outline-offset: 2px;
  }
}

.network-list,
.token-list {
  min-height: 0;
}

// Under the list, where wallets put "Import tokens": Manage assets, where any token can be added at zero.
.add-tokens {
  display: flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  min-height: 40px;
  margin: 6px 16px 0 0;
  padding: 0 12px;
  border: 0;
  border-radius: 20px;
  background: transparent;
  color: var(--fw-link);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: var(--fw-raised-2);
  }

  &:focus-visible {
    outline: 2px solid palette($pink-lavender-color, var(--fw-focus));
    outline-offset: 2px;
  }
}

.add-tokens-icon {
  flex: none;
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
