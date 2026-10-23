/**
 * The honest state of the numbers on the dashboard. It follows the rules the network sections already use
 * (src/portfolio/syncFreshness.ts): a balance is out of date after 15 minutes, a network that failed or is stale is
 * named, and nothing claims to be live without evidence. An age is shown only for saved balances.
 */
export const SAVED_AFTER_MS = 15 * 60 * 1000;

export type SyncStateKind = 'live' | 'saved' | 'partial' | 'offline';

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
  /** The age of the oldest saved wallet; only for `saved`. */
  oldestAgeMs?: number;
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

  if (!online) return { kind: 'offline', savedWallets, staleNetworks };
  if (staleNetworks.length) return { kind: 'partial', savedWallets, staleNetworks };
  if (savedWallets.length) return { kind: 'saved', savedWallets, staleNetworks, oldestAgeMs: savedWallets[0].ageMs };

  return { kind: 'live', savedWallets, staleNetworks };
}
