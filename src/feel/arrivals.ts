// "What counts as arriving" (brand kit v3, SPEC "Launch, feel and sound" part 2): an asset's balance for an account
// grows compared with a value this page already knew for that same account and asset. Never on the first value seen
// (a new or imported wallet, a first sync, a newly added network, a wallet just switched to), never from a price change
// (amounts are compared, not values), never for a hidden or unverified asset, never while the page is hidden, and at
// most one effect in any 3 s. Nothing here signs, sends or stores anything.
import { APIItemState } from '@extension-base/api/types/networks';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { createAssetKey } from '@/portfolio/assetKey';
import { findRegistryAsset, getPortfolioAssetId, holdingBalance } from '@/portfolio/assetIdentity';
import { isUntrustedAsset } from '@/portfolio/untrustedAssets';
import { FPNumber } from '@/sora/number';

export const ARRIVAL_COOLDOWN_MS = 3000;
/** After a wallet switch the first snapshots may still be the previous wallet's: they only set the baseline. */
export const ARRIVAL_SETTLE_MS = 3000;

export interface Holding {
  /** The portfolio asset key (ecosystem, chain and asset). */
  key: string;
  symbol: string;
  /** The decimal amount held (free + reserved), as the wallet list shows it. */
  amount: string;
  /** Only a loaded balance is a known value; a placeholder or a failed update is not. */
  known: boolean;
  /** Hidden by the owner, unverified or on the untrusted list: tracked, never celebrated. */
  quiet: boolean;
}

export interface Arrival {
  key: string;
  symbol: string;
  /** How much more there is now, as a decimal string. */
  amount: string;
  /** Other assets that grew in the same update. */
  others: number;
}

/** The selected wallet's holdings as the wallet list counts them. */
export function collectHoldings(
  groups: readonly TokenGroup[],
  networks: readonly NetworkJson[],
  hiddenKeys: ReadonlySet<string>
): Holding[] {
  const networkByName = new Map(networks.map((network) => [network.name.toLowerCase(), network]));
  const holdings: Holding[] = [];
  for (const group of groups) {
    for (const balance of group.balances ?? []) {
      const network = networkByName.get(String(balance.name ?? '').toLowerCase());
      if (!network) continue;
      const ecosystem = String(network.ecosystem ?? balance.relayChain ?? group.relayChain ?? 'unknown').toLowerCase();
      const assetId = getPortfolioAssetId(balance);
      const key = createAssetKey({ ecosystem, chainId: String(network.chainId || network.name), assetId });
      const registryAsset = findRegistryAsset(network, balance);
      const verified = balance.assetMetadataTrust === 'verified' || Boolean(registryAsset);
      const untrusted = isUntrustedAsset(network, registryAsset?.id ?? assetId);
      holdings.push({
        key,
        symbol: (registryAsset?.symbol || balance.symbol || group.symbol || '').toUpperCase(),
        amount: holdingBalance(balance),
        known: balance.state === APIItemState.READY,
        quiet: hiddenKeys.has(key) || !verified || untrusted,
      });
    }
  }
  return holdings;
}

const amountOf = (text: string): FPNumber | undefined => {
  const value = new FPNumber(text);
  return value.isNaN() || !value.isFinity() ? undefined : value;
};

export interface ArrivalTracker {
  /**
   * Compares a snapshot of the selected wallet with what the page knew, remembers it, and returns what arrived when
   * that may be shown now. `visible` is false while the page is hidden: the values are remembered, nothing is shown.
   */
  observe(account: string, holdings: readonly Holding[], options: { now: number; visible: boolean; settling: boolean }): Arrival | null;
  /** Forgets every value, as when the wallet changes. */
  reset(now: number): void;
}

export function createArrivalTracker(): ArrivalTracker {
  let account = '';
  let known = new Map<string, FPNumber>();
  let lastEffectAt = -Infinity;
  let settleUntil = -Infinity;

  return {
    reset(now) {
      known = new Map();
      settleUntil = now + ARRIVAL_SETTLE_MS;
    },
    observe(owner, holdings, { now, visible, settling }) {
      if (owner !== account) {
        account = owner;
        known = new Map();
        settleUntil = now + ARRIVAL_SETTLE_MS;
      }
      const grown: Arrival[] = [];
      const seen = new Set<string>();
      for (const holding of holdings) {
        if (!holding.known || seen.has(holding.key)) continue;
        const amount = amountOf(holding.amount);
        if (!amount) continue;
        // The background keeps one balance per key; should two arrive, the first loaded one is the value.
        seen.add(holding.key);
        const before = known.get(holding.key);
        known.set(holding.key, amount);
        if (before === undefined || !amount.gt(before) || holding.quiet) continue;
        grown.push({ key: holding.key, symbol: holding.symbol, amount: amount.sub(before).toString(), others: 0 });
      }
      if (!grown.length || !owner || !visible || settling || now < settleUntil) return null;
      if (now - lastEffectAt < ARRIVAL_COOLDOWN_MS) return null;
      lastEffectAt = now;
      return { ...grown[0], others: grown.length - 1 };
    },
  };
}
