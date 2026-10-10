import { computed, watch } from 'vue';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type { AssetPreference } from '@/portfolio/assetIdentity';
import {
  buildLegacy305Groups,
  buildLegacy305JettonGroups,
  mergeAssetPreferences,
  resolveLegacy305Hidden,
  resolveLegacy305Order,
  unmappedLegacy305Ids,
  type AssetPreferenceSource,
  type Legacy305Group,
} from '@/portfolio/legacyPreferences305';
import { accountController } from '@/controllers/accountController';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';

let registryGroupsCache: { fingerprint: string; groups: Legacy305Group[] } | undefined;

/** Everything the 3.0.5 grouping reads from the registry; network status updates leave it unchanged. */
function registryFingerprint(networks: NetworkJson[]): string {
  return JSON.stringify(
    networks.map(({ chainId, name, parentId, ecosystem, disabled, options, assets }) => [
      chainId,
      name,
      parentId,
      ecosystem,
      disabled,
      options,
      assets.map(({ id, currencyId, symbol }) => [id, currencyId, symbol]),
    ])
  );
}

function legacyRegistryGroups(networks: NetworkJson[]): Legacy305Group[] {
  const fingerprint = registryFingerprint(networks);

  if (registryGroupsCache?.fingerprint !== fingerprint) {
    registryGroupsCache = { fingerprint, groups: buildLegacy305Groups(networks) };
  }

  return registryGroupsCache.groups;
}

/**
 * One wallet's hidden asset keys without its balances: explicit hides plus the 3.0.5 registry-group hides.
 * 3.0.5 jetton hides need the wallet's jetton balances and are left out; jettons are unverified and unpriced in
 * almost every case, so they never reach a total. Used to label the wallet list ("incl. hidden").
 */
export function hiddenKeysForWallet(
  address: string,
  explicit: Record<string, AssetPreference>,
  networks: NetworkJson[]
): string[] {
  const derived = resolveLegacy305Hidden({
    legacyHiddenIds: accountController.getLegacy305Preferences(address).hiddenIds,
    registryGroups: legacyRegistryGroups(networks),
  });

  return Object.entries(mergeAssetPreferences(explicit, derived))
    .filter(([, { preference }]) => preference === 'hidden')
    .map(([key]) => key);
}

/**
 * The asset preferences the portfolio renders with: the user's explicit choices, plus the hides and custom order
 * the wallet had in 3.0.5, derived on every read from the untouched legacy keys. Because nothing is migrated,
 * jettons that load late, registry growth and a downgrade to 3.0.5 all keep working.
 */
export function usePortfolioPreferences() {
  const accountsStore = useAccountsStore();
  const networksStore = useNetworksStore();

  // Nothing writes the 3.0.5 keys any more, so one read per wallet is enough.
  const legacy = computed(() => accountController.getLegacy305Preferences(accountsStore.selectedWallet.address));
  const registryGroups = computed(() => legacyRegistryGroups(networksStore.allNetworks));
  const jettonGroups = computed(() =>
    buildLegacy305JettonGroups(accountsStore.balances as unknown as TokenGroup[], networksStore.allNetworks)
  );

  const legacyHidden = computed(() =>
    resolveLegacy305Hidden({
      legacyHiddenIds: legacy.value.hiddenIds,
      registryGroups: registryGroups.value,
      jettonGroups: jettonGroups.value,
    })
  );

  const merged = computed(() => mergeAssetPreferences(accountsStore.assetPreferences, legacyHidden.value));

  const effectivePreferences = computed<Record<string, AssetPreference>>(() =>
    Object.fromEntries(Object.entries(merged.value).map(([key, { preference }]) => [key, preference]))
  );

  const hiddenKeys = computed(
    () =>
      new Set(
        Object.entries(effectivePreferences.value)
          .filter(([, preference]) => preference === 'hidden')
          .map(([key]) => key)
      )
  );

  const legacyOrderIndex = computed(() =>
    resolveLegacy305Order({
      sequence: legacy.value.sequence,
      customSort: legacy.value.customSort,
      registryGroups: registryGroups.value,
      jettonGroups: jettonGroups.value,
    })
  );

  // Diagnostic only: an id that names no network in today's registry cannot be mapped to any asset.
  const unmappedHiddenCount = computed(() =>
    networksStore.allNetworks.length === 0
      ? 0
      : unmappedLegacy305Ids({
          legacyIds: legacy.value.hiddenIds,
          registryGroups: registryGroups.value,
          jettonGroups: jettonGroups.value,
        }).length
  );

  watch(
    unmappedHiddenCount,
    (count) => {
      if (count > 0) console.info(`[portfolio] ${count} hidden assets from 3.0.5 are not in the current registry`);
    },
    { immediate: true }
  );

  const preferenceSource = (key: string): AssetPreferenceSource => merged.value[key]?.source ?? 'auto';

  return { effectivePreferences, preferenceSource, legacyOrderIndex, hiddenKeys };
}
