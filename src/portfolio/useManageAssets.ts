import { computed } from 'vue';
import type { TokenGroup } from '@extension-base/background/types/types';
import { buildPortfolioSections, type PortfolioAsset } from '@/portfolio/assetIdentity';
import { buildManageEntries, preferenceForSwitch, type ManageAssetEntry, type ManageListRules } from '@/portfolio/manageAssets';
import { usePortfolio } from '@/portfolio/usePortfolio';
import { surfacesDiscoveredAssets } from '@/portfolio/useWalletTokenRows';
import { useAccountsStore } from '@/stores/accounts';
import { useExtensionStore } from '@/stores/extension';
import { useNetworksStore } from '@/stores/networks';

/**
 * Every asset the selected wallet can hold, placed where Manage assets lists it (`manageAssets.ts`), and the one write
 * its switches make. It reads the same preferences, wallet scope and zero list as the wallet's list, so a switch says
 * exactly whether that list shows the asset.
 */
export function useManageAssets(portfolio: ReturnType<typeof usePortfolio> = usePortfolio()) {
  const accountsStore = useAccountsStore();
  const networksStore = useNetworksStore();
  const extensionStore = useExtensionStore();
  const { effectivePreferences, preferenceSource, addressForNetwork, walletScope, zeroRule } = portfolio;

  const rules = computed<ManageListRules>(() => ({ surfaceDiscoveredAssets: surfacesDiscoveredAssets(extensionStore.features) }));
  const networksByName = computed(() => new Map(networksStore.allNetworks.map((network) => [network.name, network])));

  // Wallet-wide, whatever network the list is narrowed to: Manage is where anything can be found.
  const sections = computed(() =>
    buildPortfolioSections({
      groups: accountsStore.balances as unknown as TokenGroup[],
      networks: networksStore.allNetworks,
      prices: networksStore.assetsPrice.tokenPriceMap,
      priceChanges: networksStore.assetsPrice.tokenPriceChange,
      preferences: effectivePreferences.value,
      preferenceSource,
      scanStates: accountsStore.networkScanStates,
      addressForNetwork,
      mode: 'manage',
      showTestnets: accountsStore.portfolioView.showTestnets,
      walletScope: walletScope.value,
    })
  );

  const entries = computed<ManageAssetEntry[]>(() =>
    buildManageEntries({
      sections: sections.value,
      rules: rules.value,
      // The tokens every app shows a new wallet at zero, and the main token of a network the owner starred.
      isPopular: (asset) => {
        const network = networksByName.value.get(asset.networkName);

        return network ? zeroRule.value(network, asset.key) : false;
      },
      networkRank: (name) => {
        const rank = networksByName.value.get(name)?.rank;

        return Number.isFinite(rank) ? Number(rank) : Number.POSITIVE_INFINITY;
      },
    })
  );

  /** Puts the asset in the wallet's list or takes it out, with the lightest choice that does it. */
  function setListed(asset: PortfolioAsset, listed: boolean): void {
    accountsStore.setAssetPreference({ key: asset.key, preference: preferenceForSwitch(asset, listed, rules.value) });
  }

  return { entries, rules, setListed };
}
