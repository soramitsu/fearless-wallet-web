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
            :forceExpanded="searching || hiddenOnly"
            :search="searchQuery"
            :canSend="canSendFrom(row)"
            @send="openGroupPicker($event, 'send')"
            @receive="openGroupPicker($event, 'receive')"
          />

          <PortfolioZeroNetworks
            v-if="splitTokenRows.zeroOnly.length"
            :label="zeroTokensLabel"
            :expanded="zeroNetworksExpanded"
            @toggle="setZeroNetworksExpanded"
          >
            <PortfolioTokenRow
              v-for="row in splitTokenRows.zeroOnly"
              :key="row.id"
              :row="row"
              :manage="showAssetsManagementForm"
              :forceExpanded="searching || hiddenOnly"
            :search="searchQuery"
              :canSend="canSendFrom(row)"
              @send="openGroupPicker($event, 'send')"
              @receive="openGroupPicker($event, 'receive')"
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

    <!-- Teleported to the body, so the list's scroll box cannot clip it. -->
    <PortfolioGroupNetworkPicker
      v-if="groupPicker"
      :action="groupPicker.action"
      :symbol="groupPicker.symbol"
      :options="groupPicker.options"
      @pick="pickGroupNetwork"
      @close="groupPicker = null"
    />
  </Scroll>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import PortfolioNetworkSection from './PortfolioNetworkSection.vue';
import PortfolioZeroNetworks from './PortfolioZeroNetworks.vue';
import PortfolioExclusions from './PortfolioExclusions.vue';
import PortfolioHiddenFundsNotice from './PortfolioHiddenFundsNotice.vue';
import PortfolioLayoutNote from './PortfolioLayoutNote.vue';
import PortfolioTokenRow from './PortfolioTokenRow.vue';
import PortfolioGroupNetworkPicker from './PortfolioGroupNetworkPicker.vue';
import type { NetworkJson } from '@extension-base/types';
import SearchResultStatus from '@/components/SearchResultStatus.vue';
import {
  buildPortfolioSections,
  filterSectionAssets,
  filterSectionsBySearch,
  splitZeroSections,
  type PortfolioNetworkSection as PortfolioSection,
} from '@/portfolio/assetIdentity';
import {
  hiddenFundsSignature,
  resolvePortfolioSort,
  type PortfolioSort,
  type PortfolioViewSettings,
} from '@/portfolio/portfolioViewSettings';
import { shouldShowLayoutNote } from '@/portfolio/layoutNotice';
import { canonicalGroupIndexFor, type CanonicalGroupIndex } from '@/portfolio/tokenGroups';
import {
  buildTokenRows,
  groupReceiveOptions,
  groupSendOptions,
  splitZeroTokenRows,
  type GroupNetworkOption,
  type PortfolioTokenRow as TokenRow,
} from '@/portfolio/tokenLens';
import { usePortfolio } from '@/portfolio/usePortfolio';
import { isTestnetNetwork } from '@/portfolio/zeroRule';
import { isSameString } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { useExtensionStore } from '@/stores/extension';
import { useSendKillSwitchStore } from '@/stores/sendKillSwitch';
import { Components } from '@/router/routes';
import { isNetworkTransferEnabled } from '@/util/releaseFeatures';
import { forceAssetDiscoverySweep } from '@/extension/messaging/asset-discovery';
import { ALL_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { fetchNfts } from '@/extension/messaging/nfts';

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
    PortfolioGroupNetworkPicker,
  },
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
      legacyOrderIndex,
      addressForNetwork,
      walletScope,
      networkFilter,
      isFiltered,
      zeroRule,
      summary,
      filteredSummary,
      loadStatus,
    } = usePortfolio();

    return {
      effectivePreferences,
      preferenceSource,
      legacyOrderIndex,
      addressForNetwork,
      walletScope,
      networkFilter,
      isFiltered,
      zeroRule,
      summary,
      filteredSummary,
      loadStatus,
    };
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
      extensionStore: useExtensionStore(),
      refreshing: false,
      refreshError: '',
      groupPicker: null as null | { action: 'send' | 'receive'; symbol: string; options: GroupNetworkOption[] },
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
    // Manage has no search field, so text typed before never narrows it.
    searchQuery(): string {
      return this.showAssetsManagementForm ? '' : this.filterValue?.trim() ?? '';
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
        search: this.searchQuery,
        isSelectedNetwork: (network: NetworkJson) => isSameString(network.name, this.accountsStore.selectedNetwork),
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
    groupIndex(): CanonicalGroupIndex {
      return canonicalGroupIndexFor(this.networksStore.allNetworks);
    },
    // The 3.0.5 custom order is kept for wallets that had one (D7) until the user picks Value.
    tokenSort(): PortfolioSort {
      return resolvePortfolioSort(this.viewSettings, this.legacyOrderIndex.size > 0);
    },
    tokenRows(): TokenRow[] {
      const ranks = new Map<string, number>(
        this.networksStore.allNetworks.map(({ name, rank }) => [name, Number.isFinite(rank) ? Number(rank) : Number.POSITIVE_INFINITY])
      );

      return buildTokenRows({
        sections: this.visibleSections,
        index: this.groupIndex,
        networkRank: (name) => ranks.get(name) ?? Number.POSITIVE_INFINITY,
        sort: this.tokenSort,
        legacyOrderIndex: this.legacyOrderIndex,
      });
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
  // The picker lives in the body: a kept-alive list must not leave it open over another screen.
  deactivated() {
    this.groupPicker = null;
  },
  methods: {
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
    canSendOn(networkName: string): boolean {
      const network = this.networksStore.allNetworks.find(({ name }) => name === networkName);

      return Boolean(network) && network!.active !== false && isNetworkTransferEnabled(network, useSendKillSwitchStore().vetoes);
    },
    canSendFrom(row: TokenRow): boolean {
      return groupSendOptions(row, this.canSendOn).length > 0;
    },
    // Send and Receive from a token always ask for the network first, with the wrong-network warning.
    openGroupPicker(row: TokenRow, action: 'send' | 'receive') {
      const options =
        action === 'send'
          ? groupSendOptions(row, this.canSendOn)
          : groupReceiveOptions({
              row,
              group: row.groupId ? this.groupIndex.groups.get(row.groupId) : undefined,
              networks: this.networksStore.allNetworks,
              inScope: this.walletScope,
            });

      this.groupPicker = { action, symbol: row.symbol, options };
    },
    pickGroupNetwork(option: GroupNetworkOption) {
      const action = this.groupPicker?.action;
      this.groupPicker = null;
      if (!action) return;

      this.$router.push({
        name: action === 'send' ? Components.SendForm : Components.ReceiveForm,
        params: { assetId: option.assetId, network: option.networkName },
      });
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
}

.portfolio-refresh {
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: palette($pink-color, var(--fw-link));
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
