import type {
  LegacyExposureStatus,
  LegacyExposureWallet,
} from '@extension-base/services/legacy-exposure-service';

/** Published builds that sent recovery phrases to an outside server on unlock (3.0.2 had the code
 * but never called it). The notice names them; nothing else depends on these values. */
export const LEGACY_EXPOSURE_VERSIONS = { first: '3.0.1', from: '3.0.3', to: '3.0.5' } as const;

// The part of a portfolio token group the guide reads; the store holds the same shape.
type TokenGroup = {
  groupId: string;
  symbol: string;
  balances: { name: string; total?: string; isUtility?: boolean }[];
};

/** A balance the guide still lists for an old wallet: one asset on one network. */
export type LegacyExposureBalance = {
  groupId: string;
  symbol: string;
  network: string;
  amount: string;
  isUtility: boolean;
};

// The background stores EVM addresses lower-cased and the popup shows them checksummed.
export const sameWalletAddress = (left: string, right: string): boolean =>
  left === right || (left.startsWith('0x') && right.startsWith('0x') && left.toLowerCase() === right.toLowerCase());

/** True for a wallet that was in the app before the update from 3.0.x, removed or not. */
export function isLegacyExposedAddress(status: LegacyExposureStatus | undefined, address: string): boolean {
  if (!status || !address || (status.state !== 'notice_pending' && status.state !== 'acknowledged')) return false;

  return status.wallets.some((wallet) => sameWalletAddress(wallet.address, address));
}

/** Old wallets still in the app that the user has not marked as moved. */
export function walletsStillToMove(status: LegacyExposureStatus | undefined): LegacyExposureWallet[] {
  if (!status || status.state !== 'acknowledged') return [];

  return status.wallets.filter(({ present, movedAt }) => present && !movedAt);
}

/**
 * Every balance above zero on a network with value, one row per asset and network. A network's own
 * coin comes last: it pays the fee for every other asset sent from that network.
 */
export function remainingBalances(
  groups: TokenGroup[],
  isTestnet: (network: string) => boolean = () => false
): LegacyExposureBalance[] {
  const rows = groups.flatMap(({ groupId, symbol, balances }) =>
    balances
      .filter(({ name, total }) => Number(total ?? 0) > 0 && !isTestnet(name))
      .map(
        ({ name, total, isUtility }): LegacyExposureBalance => ({
          groupId,
          symbol: symbol.toUpperCase(),
          network: name,
          amount: total ?? '0',
          isUtility: !!isUtility,
        })
      )
  );

  return rows.sort(
    (left, right) =>
      left.network.localeCompare(right.network) ||
      Number(left.isUtility) - Number(right.isUtility) ||
      left.symbol.localeCompare(right.symbol)
  );
}

// The wallets whose reminder was closed on this device, by the address the background gives them.
const CLOSED_REMINDERS_KEY = 'fearless:legacy-exposure-reminder-closed:v1';

export function readClosedReminders(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(CLOSED_REMINDERS_KEY) ?? '[]');

    return Array.isArray(stored) ? stored.filter((address): address is string => typeof address === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberClosedReminders(addresses: string[]): void {
  try {
    localStorage.setItem(CLOSED_REMINDERS_KEY, JSON.stringify(addresses));
  } catch {
    // The caller keeps the list for this window.
  }
}
