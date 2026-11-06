import { computed, type Ref } from 'vue';
import type { NetworkJson } from '@extension-base/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import {
  buildPortfolioSections,
  filterSectionAssets,
  filterSectionsBySearch,
  type PortfolioNetworkSection,
} from '@/portfolio/assetIdentity';
import { resolvePortfolioSort, type PortfolioSort } from '@/portfolio/portfolioViewSettings';
import { canonicalGroupIndexFor, type CanonicalGroupIndex } from '@/portfolio/tokenGroups';
import {
  buildTokenRows,
  groupReceiveOptions,
  groupSendOptions,
  type GroupNetworkOption,
  type PortfolioTokenRow,
} from '@/portfolio/tokenLens';
import { usePortfolio } from '@/portfolio/usePortfolio';
import { isTestnetNetwork } from '@/portfolio/zeroRule';
import { isSameString } from '@/helpers';
import { isNetworkTransferEnabled } from '@/util/releaseFeatures';
import { useAccountsStore } from '@/stores/accounts';
import { useExtensionStore } from '@/stores/extension';
import { useNetworksStore } from '@/stores/networks';
import { useSendKillSwitchStore } from '@/stores/sendKillSwitch';

export interface WalletTokenRowsOptions {
  /** Text typed in the list's search; Manage never searches. */
  search?: Readonly<Ref<string>>;
  /** Manage lists every asset, zero and hidden ones included, with its switch. */
  manage?: Readonly<Ref<boolean>>;
  /** Manage's "Hidden (N)" filter: only hidden assets, wallet-wide. */
  hiddenOnly?: Readonly<Ref<boolean>>;
  /** The caller's own `usePortfolio()`, so a screen that reads the summary too builds it once. */
  portfolio?: ReturnType<typeof usePortfolio>;
}

const NOTHING = computed(() => '');
const OFF = computed(() => false);

/**
 * The selected wallet's assets as the wallet screen lists them: by network (`visibleSections`) and by token
 * (`tokenRows`), under the same filters, so the list, a token's own page and the Send and Receive pickers agree.
 */
export function useWalletTokenRows({
  search = NOTHING,
  manage = OFF,
  hiddenOnly = OFF,
  portfolio = usePortfolio(),
}: WalletTokenRowsOptions = {}) {
  const accountsStore = useAccountsStore();
  const networksStore = useNetworksStore();
  const extensionStore = useExtensionStore();
  const { effectivePreferences, preferenceSource, legacyOrderIndex, addressForNetwork, walletScope, networkFilter, zeroRule } =
    portfolio;

  const viewSettings = computed(() => accountsStore.portfolioView);
  const searchQuery = computed(() => (manage.value ? '' : search.value.trim()));
  const searching = computed(() => Boolean(searchQuery.value));

  /** A test network chosen as the only network is shown even with the Testnets switch off. */
  const selectedTestnet = computed(() => {
    const selected = networksStore.allNetworks.find(({ name }) => isSameString(name, accountsStore.selectedNetwork));

    return Boolean(selected && isTestnetNetwork(selected));
  });
  const showsTestnets = computed(() => viewSettings.value.showTestnets || (!hiddenOnly.value && selectedTestnet.value));

  const portfolioSections = computed<PortfolioNetworkSection[]>(() =>
    buildPortfolioSections({
      groups: accountsStore.balances as unknown as TokenGroup[],
      networks: networksStore.allNetworks,
      prices: networksStore.assetsPrice.tokenPriceMap,
      priceChanges: networksStore.assetsPrice.tokenPriceChange,
      preferences: effectivePreferences.value,
      preferenceSource,
      scanStates: accountsStore.networkScanStates,
      surfaceDiscoveredAssets:
        (extensionStore.features?.assetDiscoveryMode ?? extensionStore.features?.portfolio?.assetDiscoveryMode ?? 'shadow') ===
        'visible',
      addressForNetwork,
      search: searchQuery.value,
      isSelectedNetwork: (network: NetworkJson) => isSameString(network.name, accountsStore.selectedNetwork),
      mode: manage.value ? 'manage' : 'view',
      hideZero: viewSettings.value.hideZero,
      showHidden: viewSettings.value.showHidden,
      showTestnets: showsTestnets.value,
      isDefaultVisibleAtZero: (network, asset) => zeroRule.value(network, asset.key),
      walletScope: walletScope.value,
      // The Hidden list is wallet-wide, like the notice, the footer and the "Hidden (N)" count that open it.
      networkFilter: hiddenOnly.value ? undefined : networkFilter.value,
    })
  );

  const visibleSections = computed<PortfolioNetworkSection[]>(() => {
    const sections = hiddenOnly.value
      ? filterSectionAssets(portfolioSections.value, (asset) => asset.hidden)
      : portfolioSections.value;

    return searching.value ? filterSectionsBySearch(sections, searchQuery.value) : sections;
  });

  const groupIndex = computed<CanonicalGroupIndex>(() => canonicalGroupIndexFor(networksStore.allNetworks));

  // The 3.0.5 custom order is kept for wallets that had one (D7) until the user picks Value.
  const tokenSort = computed<PortfolioSort>(() => resolvePortfolioSort(viewSettings.value, legacyOrderIndex.value.size > 0));

  const tokenRows = computed<PortfolioTokenRow[]>(() => {
    const ranks = new Map<string, number>(
      networksStore.allNetworks.map(({ name, rank }) => [name, Number.isFinite(rank) ? Number(rank) : Number.POSITIVE_INFINITY])
    );

    return buildTokenRows({
      sections: visibleSections.value,
      index: groupIndex.value,
      networkRank: (name) => ranks.get(name) ?? Number.POSITIVE_INFINITY,
      sort: tokenSort.value,
      legacyOrderIndex: legacyOrderIndex.value,
    });
  });

  /** The approved group a row stands for: its own, or the group of its one network when only that one is listed. */
  const groupIdOf = (row: PortfolioTokenRow): string | undefined =>
    row.groupId ?? groupIndex.value.memberOfKey.get((row.children[0] ?? row.zeroChildren[0])?.asset.key ?? '')?.groupId;

  /** A token page's row: the row itself, or the one network of its group still listed under the current filters. */
  const findRow = (id: string): PortfolioTokenRow | undefined => {
    const exact = tokenRows.value.find((row) => row.id === id);
    if (exact || !id.startsWith('group:')) return exact;

    const groupId = id.slice('group:'.length);

    return tokenRows.value.find((row) => groupIdOf(row) === groupId);
  };

  const canSendOn = (networkName: string): boolean => {
    const network = networksStore.allNetworks.find(({ name }) => name === networkName);

    return Boolean(network) && network!.active !== false && isNetworkTransferEnabled(network, useSendKillSwitchStore().vetoes);
  };

  // Send and Receive from a token always ask for the network first, with the wrong-network warning.
  const sendOptions = (row: PortfolioTokenRow): GroupNetworkOption[] => groupSendOptions(row, canSendOn);
  const receiveOptions = (row: PortfolioTokenRow): GroupNetworkOption[] => {
    const groupId = groupIdOf(row);

    return groupReceiveOptions({
      row,
      group: groupId ? groupIndex.value.groups.get(groupId) : undefined,
      networks: networksStore.allNetworks,
      inScope: walletScope.value,
    });
  };

  return {
    viewSettings,
    searchQuery,
    searching,
    showsTestnets,
    portfolioSections,
    visibleSections,
    groupIndex,
    tokenSort,
    tokenRows,
    findRow,
    groupIdOf,
    canSendOn,
    sendOptions,
    receiveOptions,
  };
}
