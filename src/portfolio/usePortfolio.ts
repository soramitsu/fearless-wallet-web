import { computed } from 'vue';
import type { NetworkJson } from '@extension-base/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import {
  buildPortfolioSummary,
  scopeNetworksToWallet,
  type PortfolioSummary,
  type PortfolioSummaryInput,
} from '@/portfolio/assetIdentity';
import { usePortfolioPreferences } from '@/portfolio/usePortfolioPreferences';
import { createZeroDefaultRule } from '@/portfolio/zeroRule';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import { isSameString } from '@/helpers';
import BaseApi from '@/util/BaseApi';
import { isNetworkTransferEnabled } from '@/util/releaseFeatures';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';
import { useSendKillSwitchStore } from '@/stores/sendKillSwitch';

/**
 * Everything the portfolio header and list share: the effective preferences, the wallet scope, the display filter,
 * the one zero rule, and the wallet-wide summary. The header and the list read the same summary, so they agree.
 */
export function usePortfolio() {
  const accountsStore = useAccountsStore();
  const networksStore = useNetworksStore();
  const sendKillSwitchStore = useSendKillSwitchStore();
  const { effectivePreferences, preferenceSource, legacyOrderIndex, hiddenKeys } = usePortfolioPreferences();

  const addressForNetwork = (network: NetworkJson): string => {
    try {
      return BaseApi.formatAddress(accountsStore.selectedWallet, network.name);
    } catch {
      return accountsStore.selectedWallet.address;
    }
  };

  const isFavourite = (network: NetworkJson): boolean => {
    const { address } = accountsStore.selectedWallet;
    return Boolean(network.favorite?.includes(address) || network.favorite?.includes(addressForNetwork(network)));
  };

  const walletScope = computed(() =>
    scopeNetworksToWallet(
      accountsStore.accounts.find(({ address }) => address === accountsStore.selectedWallet.address),
      accountsStore.selectedWallet
    )
  );

  /** The Popular / Favourites / single-network selection, as a strict network filter. */
  const networkFilter = computed<(network: NetworkJson) => boolean>(() => {
    const selected = accountsStore.selectedNetwork;

    if (selected === POPULAR_NETWORKS) return (network) => network.rank !== undefined;
    if (selected === FAVORITE_NETWORKS) return isFavourite;
    if (isSameString(selected, ALL_NETWORKS)) return () => true;
    return (network) => isSameString(network.name, selected);
  });

  const isFiltered = computed(() => !isSameString(accountsStore.selectedNetwork, ALL_NETWORKS));

  const zeroRule = computed(() => {
    const selected = accountsStore.selectedNetwork;
    const singleNetwork = ![ALL_NETWORKS, POPULAR_NETWORKS, FAVORITE_NETWORKS].some((group) => isSameString(group, selected));

    return createZeroDefaultRule({
      networks: networksStore.allNetworks,
      isFavourite,
      isOnlySelectedNetwork: (network) => singleNetwork && isSameString(network.name, selected),
      isSendVetoed: (network) => !isNetworkTransferEnabled(network, sendKillSwitchStore.vetoes),
    });
  });

  const summaryInput = computed<PortfolioSummaryInput>(() => ({
    groups: accountsStore.balances as unknown as TokenGroup[],
    networks: networksStore.allNetworks,
    prices: networksStore.assetsPrice.tokenPriceMap,
    priceChanges: networksStore.assetsPrice.tokenPriceChange,
    preferences: effectivePreferences.value,
    addressForNetwork,
    walletScope: walletScope.value,
    preferenceSource,
  }));

  /** Wallet-wide in every lens and under every filter (portfolio contract §3). */
  const summary = computed<PortfolioSummary>(() => buildPortfolioSummary(summaryInput.value));

  /** The filtered part of the total, shown as "Showing {network} · {value}" while a network filter is active. */
  const filteredTotal = computed<string | null>(() =>
    isFiltered.value ? buildPortfolioSummary({ ...summaryInput.value, networkFilter: networkFilter.value }).total : null
  );

  return {
    effectivePreferences,
    preferenceSource,
    legacyOrderIndex,
    hiddenKeys,
    addressForNetwork,
    walletScope,
    networkFilter,
    isFiltered,
    zeroRule,
    summary,
    filteredTotal,
  };
}
