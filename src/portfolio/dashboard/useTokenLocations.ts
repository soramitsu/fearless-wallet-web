import { computed, ref, watch, type Ref } from 'vue';
import type { TokenGroup } from '@extension-base/background/types/types';
import { SORA_NETWORK_NAME, SORA_XOR_ASSET_ID } from '@/consts/sora';
import { usePortfolio } from '@/portfolio/usePortfolio';
import { locationActions, type LocationActions } from '@/portfolio/dashboard/actions';
import { needsWalletSwitch } from '@/portfolio/dashboard/handoff';
import { buildTokenLocations, type LocationHolding } from '@/portfolio/dashboard/locations';
import { derivePolkaswapFacts, polkaswapChecks, type PolkaswapChecks } from '@/portfolio/dashboard/polkaswapChecks';
import { SORA_CHAIN_ID } from '@/portfolio/dashboard/readiness';
import { tokenIcon, type TokenIconSubject } from '@/portfolio/dashboard/tokenIcons';
import { useReadiness } from '@/portfolio/dashboard/useReadiness';
import { usePortfolioDashboard } from '@/portfolio/dashboard/usePortfolioDashboard';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';
import { useSendKillSwitchStore } from '@/stores/sendKillSwitch';
import { isNetworkTransferEnabled } from '@/util/releaseFeatures';

/**
 * Where one token lives, for the Where it lives screen: its holdings in every wallet of the scope, how each stands to a
 * swap on Polkaswap, the checks behind a swap, and the actions that follow. The data is the dashboard's own, so the
 * screen adds up to the same total; nothing here writes, signs or moves anything.
 */
export function useTokenLocations(tokenKey: Ref<string>, preferredHolding: Ref<string | undefined>) {
  const accountsStore = useAccountsStore();
  const networksStore = useNetworksStore();
  const sendKillSwitchStore = useSendKillSwitchStore();
  const portfolio = usePortfolio();
  const dashboard = usePortfolioDashboard({ summaryInput: portfolio.summaryInput, hiddenKeys: portfolio.hiddenKeys });

  const locations = computed(() => buildTokenLocations(tokenKey.value, dashboard.refs.value, dashboard.groupOf.value, dashboard.aggregate.value.total));
  const { actions, readinessOf } = useReadiness();

  const selectedAddress = computed(() => accountsStore.selectedWallet.address);
  const facts = computed(() =>
    derivePolkaswapFacts({
      account: accountsStore.accounts.find(({ address }) => address === selectedAddress.value),
      balances: accountsStore.balances as unknown as TokenGroup[],
      soraNetwork: networksStore.allNetworks.find(({ name }) => name.toLowerCase() === SORA_NETWORK_NAME.toLowerCase()),
      soraNetworkName: SORA_NETWORK_NAME,
      soraXorAssetId: SORA_XOR_ASSET_ID,
      showDisclaimer: accountsStore.showPolkaswapAlert,
    })
  );
  /** The checks behind a swap in the holding's wallet. Only the selected wallet's are known here. */
  const checksFor = (holding: LocationHolding): PolkaswapChecks =>
    polkaswapChecks({ facts: needsWalletSwitch(holding.address, selectedAddress.value) ? undefined : facts.value, actions: actions.value });

  const canSendOn = (networkName: string): boolean =>
    isNetworkTransferEnabled(networksStore.getNetwork(networkName), sendKillSwitchStore.vetoes);
  const actionsFor = (holding: LocationHolding): LocationActions =>
    locationActions({
      readiness: readinessOf(holding),
      switchFirst: needsWalletSwitch(holding.address, selectedAddress.value),
      canSend: canSendOn(holding.networkName),
      swapBlockers: checksFor(holding).blockers,
    });

  // The holding the panel below the orbit shows: the one asked for, otherwise the largest.
  const selectedId = ref<string | null>(null);
  watch(
    [locations, preferredHolding],
    ([current, preferred]) => {
      if (!current) {
        selectedId.value = null;

        return;
      }
      if (selectedId.value && current.holdings.some(({ id }) => id === selectedId.value)) return;

      selectedId.value = current.holdings.find(({ id }) => id === preferred)?.id ?? current.holdings[0].id;
    },
    { immediate: true }
  );
  const selectedHolding = computed(() => locations.value?.holdings.find(({ id }) => id === selectedId.value));
  const selectedNetwork = computed(() => selectedHolding.value?.networkName ?? null);
  const selectHolding = (id: string): void => {
    selectedId.value = id;
  };
  /** A satellite picks its network's largest holding. */
  const selectNetwork = (name: string): void => {
    const largest = locations.value?.networks.find((network) => network.name === name)?.holdings[0];

    if (largest) selectedId.value = largest.id;
  };

  // Icons and names, from the registry the popup loaded; a SORA token wears polkaswap.io's logo (tokenIcons.ts).
  const networkOf = (name: string) => networksStore.getNetwork(name);
  const networkIconOf = (name: string): string => networkOf(name)?.icon ?? '';
  const tokenIconOf = (holding: TokenIconSubject): string => tokenIcon(holding, networkOf);
  const roleOf = (holding: { key: string }): string | undefined => dashboard.groupIndex.value.memberOfKey.get(holding.key)?.role;
  const soraNetwork = computed(() => networksStore.allNetworks.find(({ chainId }) => String(chainId) === SORA_CHAIN_ID));

  return {
    scope: dashboard.scope,
    pending: dashboard.pending,
    locations,
    selectedId,
    selectedHolding,
    selectedNetwork,
    selectHolding,
    selectNetwork,
    readinessOf,
    checksFor,
    actionsFor,
    selectedAddress,
    soraNetwork,
    networkIconOf,
    tokenIconOf,
    roleOf,
    /** Whether Polkaswap can trade this wallet's SORA assets at all, for the swap targets. */
    facts,
  };
}
