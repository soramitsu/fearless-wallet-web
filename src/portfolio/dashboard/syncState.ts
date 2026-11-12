/**
 * The honest state of the numbers on the dashboard. It follows the rules the network sections already use
 * (src/portfolio/syncFreshness.ts): a balance is out of date after 15 minutes, a network that failed or is stale is
 * named, and nothing claims to be live without evidence. An age is shown only for saved balances.
 */
export const SAVED_AFTER_MS = 15 * 60 * 1000;

export type SyncStateKind = 'live' | 'updating' | 'saved' | 'partial' | 'offline';

export interface WalletSyncInput {
  address: string;
  name: string;
  /** The newest balance time of the wallet's counted holdings, in milliseconds; unknown when absent. */
  latestTimestamp?: number;
  staleNetworks: readonly string[];
}

export interface SyncState {
  kind: SyncStateKind;
  /** Wallets whose newest balance is older than the saved threshold, with their age. */
  savedWallets: Array<{ address: string; name: string; ageMs: number }>;
  /** Networks that failed or are stale, across every wallet, once each. */
  staleNetworks: string[];
  /**
   * Networks of the wallet on screen that have not answered since it opened: still answering while `updating`, not
   * responding after the first-load wait.
   */
  pendingNetworks: string[];
  /** The age of the oldest saved wallet; only for `saved`. */
  oldestAgeMs?: number;
}

/** What the selected wallet's own load says (portfolioLoading.ts). */
export interface SelectedWalletLoad {
  pendingNetworks: readonly string[];
  /** Still within the first-load wait. */
  waiting: boolean;
}

export function computeSyncState({
  online,
  wallets,
  now = Date.now(),
}: {
  online: boolean;
  wallets: readonly WalletSyncInput[];
  now?: number;
}): SyncState {
  const savedWallets = wallets
    .filter(({ latestTimestamp }) => latestTimestamp !== undefined && now - latestTimestamp > SAVED_AFTER_MS)
    .map(({ address, name, latestTimestamp }) => ({ address, name, ageMs: now - (latestTimestamp as number) }))
    .sort((a, b) => b.ageMs - a.ageMs);
  const staleNetworks = [...new Set(wallets.flatMap(({ staleNetworks: networks }) => networks))].sort((a, b) => a.localeCompare(b));

  if (!online) return { kind: 'offline', savedWallets, staleNetworks, pendingNetworks: [] };
  if (staleNetworks.length) return { kind: 'partial', savedWallets, staleNetworks, pendingNetworks: [] };
  if (savedWallets.length) return { kind: 'saved', savedWallets, staleNetworks, pendingNetworks: [], oldestAgeMs: savedWallets[0].ageMs };

  return { kind: 'live', savedWallets, staleNetworks, pendingNetworks: [] };
}

/**
 * The state with the selected wallet's networks that have not answered since it opened. While the first-load wait
 * runs the wallet is `updating`: its total may still grow, so it is not called live. After the wait those networks are
 * listed as not responding, and the state is what the wallet's holdings say: a registry keeps networks that no longer
 * run, and a network the wallet never held anything on would otherwise keep every total "partial". Offline stays
 * offline.
 */
export function withSelectedWalletLoad(state: SyncState, load: SelectedWalletLoad | undefined): SyncState {
  if (!load?.pendingNetworks.length || state.kind === 'offline') return state;
  if (load.waiting) return { ...state, kind: 'updating', pendingNetworks: [...load.pendingNetworks] };

  return { ...state, pendingNetworks: [...load.pendingNetworks] };
}
