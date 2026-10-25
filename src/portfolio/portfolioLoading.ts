import { APIItemState, NETWORK_STATUS } from '@extension-base/api/types/networks';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { FPNumber } from '@/sora/number';
import { isTestnetNetwork } from '@/portfolio/zeroRule';

/**
 * How long the portfolio may show "Loading your balances" while nothing the wallet holds has arrived. After that
 * the list says what it found so far, and keeps saying how many networks it is still checking.
 */
export const PORTFOLIO_FIRST_LOAD_TIMEOUT_MS = 20_000;

/**
 * - `loading`: nothing the wallet holds has arrived yet and its networks are still answering. An empty list or a
 *   $0.00 total would be a guess, so neither is shown.
 * - `syncing`: holdings are shown, or the wait is over, while some networks have not answered yet.
 * - `settled`: every network of the wallet that is being loaded has answered (or failed) at least once.
 */
export type PortfolioLoadState = 'loading' | 'syncing' | 'settled';

export interface PortfolioLoadStatus {
  state: PortfolioLoadState;
  /** Networks of this wallet that are being loaded and have not answered once. */
  pendingCount: number;
}

export interface PortfolioLoadInput {
  groups: TokenGroup[];
  networks: NetworkJson[];
  /** Networks the wallet holds an account for. */
  walletScope?: (network: NetworkJson) => boolean;
  isTestnet?: (network: NetworkJson) => boolean;
  /** The first-load wait (`PORTFOLIO_FIRST_LOAD_TIMEOUT_MS` since the popup opened or the wallet changed) is over. */
  timedOut?: boolean;
}

const hasAmount = (value: unknown): boolean => {
  try {
    const amount = new FPNumber(String(value ?? '0').trim());
    return amount.isFinity() && amount.isGreaterThan(FPNumber.ZERO);
  } catch {
    return false;
  }
};

/**
 * Whether the portfolio of the wallet on screen is still loading. The background answers the first balance request
 * at once with a placeholder for every registry asset (state PENDING, no timestamp), and a user who upgrades from
 * 3.0.5 has no balance cache, so "every row is zero" is not yet "this wallet holds nothing" (audit EXT-G-06).
 *
 * A network has answered once any of its balances loaded or failed, now or in an earlier session (a cached balance
 * keeps its timestamp). Only networks the background is loading count as pending: active ones of this wallet that are
 * not testnets and not known to be disconnected, so a network that never connects cannot hold the list hostage.
 */
export function getPortfolioLoadStatus({
  groups,
  networks,
  walletScope = () => true,
  isTestnet = (network) => isTestnetNetwork(network),
  timedOut = false,
}: PortfolioLoadInput): PortfolioLoadStatus {
  const networkByName = new Map(networks.map((network) => [network.name.toLowerCase(), network]));
  const answered = new Set<string>();
  const waiting = new Set<string>();
  let hasHoldings = false;

  groups.forEach(({ balances }) =>
    balances.forEach((balance) => {
      const network = networkByName.get(balance.name.toLowerCase());
      if (!network || isTestnet(network)) return;

      hasHoldings ||= hasAmount(balance.total ?? balance.free ?? balance.transferable);

      if (balance.state !== APIItemState.PENDING || balance.timestamp !== undefined) answered.add(network.name);
      else if (
        walletScope(network) &&
        network.active !== false &&
        network.networkStatus !== NETWORK_STATUS.DISCONNECTED
      ) {
        waiting.add(network.name);
      }
    })
  );

  const pendingCount = [...waiting].filter((name) => !answered.has(name)).length;
  // Before the first balance message, or before the network list, nothing is known either way.
  const unknown = groups.length === 0 || networks.length === 0;

  if (!hasHoldings && !timedOut && (unknown || pendingCount > 0)) return { state: 'loading', pendingCount };

  return { state: pendingCount > 0 ? 'syncing' : 'settled', pendingCount };
}
