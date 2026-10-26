import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch, type Ref } from 'vue';
import '@/styles/_fw-dashboard.scss';
import type { PortfolioSummaryInput } from '@/portfolio/assetIdentity';
import { canonicalGroupIndexFor } from '@/portfolio/tokenGroups';
import { aggregatePortfolios, type WalletPortfolio } from '@/portfolio/dashboard/aggregate';
import { buildAllocation } from '@/portfolio/dashboard/allocation';
import {
  allocationEntities,
  buildAggregateNetworkSections,
  buildAggregateTokenRows,
  holdingRefs,
  seedSlots,
  type AggregateTokenRow,
  type GroupOf,
} from '@/portfolio/dashboard/facets';
import { buildWalletHoldings } from '@/portfolio/dashboard/holdings';
import { effectiveScope, slotMapKey, type AllWalletsLens, type DashboardScope } from '@/portfolio/dashboard/preferences';
import { hiddenKeysByAddress } from '@/portfolio/dashboard/hiddenKeys';
import { computeSyncState } from '@/portfolio/dashboard/syncState';
import { rowIcon } from '@/portfolio/dashboard/tokenIcons';
import { usePortfolioDashboardStore } from '@/stores/portfolioDashboard';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';

/** How often the other wallets are read while All wallets is on screen; the wallet list polls at the same pace. */
export const DASHBOARD_REFRESH_MS = 5000;
const CLOCK_TICK_MS = 30_000;

interface DashboardInputs {
  /** What `usePortfolio()` builds the header and the list from, so the selected wallet always agrees with them. */
  summaryInput: Readonly<Ref<PortfolioSummaryInput>>;
  /** The selected wallet's hidden asset keys, 3.0.5 hides included. */
  hiddenKeys: Readonly<Ref<ReadonlySet<string>>>;
}

/**
 * The dashboard's view of the portfolio: the wallets in scope, their sum, the allocation fan and what the sync state
 * is. The selected wallet is computed here from the popup's own balances (as the header is); the other wallets come
 * from the background's read, polled while All wallets is on screen. Nothing here writes a balance or signs.
 */
export function usePortfolioDashboard({ summaryInput, hiddenKeys }: DashboardInputs) {
  const store = usePortfolioDashboardStore();
  const accountsStore = useAccountsStore();
  const networksStore = useNetworksStore();

  const canAggregate = computed(() => accountsStore.accounts.length >= 2);
  /** All wallets only exists with two or more wallets; one wallet always reads as itself. */
  const scope = computed<DashboardScope>(() => effectiveScope(store.preferences.scope, accountsStore.accounts.length));
  const lens = computed<AllWalletsLens>(() =>
    scope.value === 'all' ? store.preferences.lens : accountsStore.portfolioView.lens === 'network' ? 'network' : 'token'
  );

  const groupIndex = computed(() => canonicalGroupIndexFor(networksStore.allNetworks));
  const groupOf = computed<GroupOf>(() => (assetKey) => {
    const member = groupIndex.value.memberOfKey.get(assetKey);
    const group = member ? groupIndex.value.groups.get(member.groupId) : undefined;

    return group ? { id: group.id, symbol: group.symbol, name: group.name } : undefined;
  });

  const selectedAddress = computed(() => accountsStore.selectedWallet.address);
  const selected = computed<WalletPortfolio>(() => ({
    ...buildWalletHoldings(
      selectedAddress.value,
      { ...summaryInput.value, scanStates: accountsStore.networkScanStates },
      [...hiddenKeys.value]
    ),
    name: accountsStore.selectedWallet.name,
  }));

  /**
   * Until the first read of the other wallets has arrived, All wallets would be a partial sum that passes for the whole:
   * it says nothing yet, and the read is tried again every few seconds. A later failure keeps the last answer instead.
   */
  const pending = computed(() => scope.value === 'all' && store.readAt === 0);

  const portfolios = computed<WalletPortfolio[]>(() => {
    if (scope.value === 'wallet') return [selected.value];

    const read = new Map(store.holdings.map((holding) => [holding.address, holding]));

    return accountsStore.accounts.map(({ address, name }): WalletPortfolio => {
      if (address === selectedAddress.value) return selected.value;

      const holding = read.get(address);

      if (!holding) {
        return { address, name, total: '0', changeAmount: '0', changePercent: '0', hiddenCount: 0, unpricedCount: 0, unavailableCount: 0, poolStakesExcluded: false, holdings: [], staleNetworks: [] };
      }

      // A read that failed leaves the last answer on screen, so it can be no fresher than when it was read.
      const latestTimestamp =
        store.status === 'error' && store.readAt ? Math.min(holding.latestTimestamp ?? store.readAt, store.readAt) : holding.latestTimestamp;

      return { ...holding, name, ...(latestTimestamp ? { latestTimestamp } : {}) };
    });
  });

  const aggregate = computed(() => aggregatePortfolios(portfolios.value));
  const refs = computed(() => holdingRefs(portfolios.value));
  const tokenRows = computed(() => buildAggregateTokenRows(refs.value, groupOf.value));
  const networkSections = computed(() => buildAggregateNetworkSections(refs.value, groupOf.value));
  /** A Tokens-lens row's logo: polkaswap.io's for a SORA asset, otherwise the registry's (tokenIcons.ts). */
  const iconOf = (row: AggregateTokenRow): string => rowIcon(row.children, (name) => networksStore.getNetwork(name));

  const slotKey = computed(() => slotMapKey(scope.value, lens.value, selectedAddress.value));
  const allocation = computed(() =>
    buildAllocation(
      allocationEntities(lens.value, refs.value, groupOf.value),
      store.preferences.slots[slotKey.value] ?? seedSlots(lens.value, refs.value, groupOf.value)
    )
  );

  // A colour follows its entity from one visit to the next; an empty answer never wipes what was kept.
  watch(
    allocation,
    ({ slots }) => {
      if (Object.keys(slots).length) store.setSlots(slotKey.value, slots);
    },
    { immediate: true }
  );

  const now = ref(Date.now());
  const syncState = computed(() =>
    computeSyncState({
      online: store.online,
      now: now.value,
      wallets: portfolios.value.map(({ address, name, latestTimestamp, staleNetworks }) => ({ address, name, latestTimestamp, staleNetworks })),
    })
  );

  const refresh = () =>
    store.refresh(hiddenKeysByAddress(accountsStore.accounts, accountsStore.assetPreferencesForAllAccounts, networksStore.allNetworks));

  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  let clockTimer: ReturnType<typeof setInterval> | undefined;
  const goOnline = () => store.setOnline(true);
  const goOffline = () => store.setOnline(false);
  const stopRefreshing = () => {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  };
  let active = false;
  const startRefreshing = () => {
    stopRefreshing();
    if (!active || scope.value !== 'all') return;

    void refresh();
    refreshTimer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void refresh();
    }, DASHBOARD_REFRESH_MS);
  };

  watch(scope, startRefreshing);
  const start = () => {
    // Under keep-alive both mounted and activated fire on the first show.
    if (active) return;

    active = true;
    startRefreshing();
    clearInterval(clockTimer);
    clockTimer = setInterval(() => (now.value = Date.now()), CLOCK_TICK_MS);
    now.value = Date.now();
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    store.setOnline(navigator.onLine);
  };
  const stop = () => {
    active = false;
    stopRefreshing();
    clearInterval(clockTimer);
    window.removeEventListener('online', goOnline);
    window.removeEventListener('offline', goOffline);
  };

  // The wallet screen stays alive under keep-alive while another screen is open: nothing is read for a hidden one.
  onMounted(start);
  onActivated(start);
  onDeactivated(stop);
  onBeforeUnmount(stop);

  return {
    scope,
    lens,
    canAggregate,
    pending,
    portfolios,
    aggregate,
    refs,
    tokenRows,
    networkSections,
    iconOf,
    allocation,
    syncState,
    groupIndex,
    groupOf,
    refresh,
  };
}
