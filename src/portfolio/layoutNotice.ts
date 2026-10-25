/**
 * The one-time note that explains the By token layout to people who used an earlier version (portfolio contract §6,
 * addendum "All three apps"). It is stored once per install in `account_portfolio-layout-v1`:
 *
 * - `firstRunAt`: when a build with this layout first started. Written once, when the popup's store is created, which
 *   happens before onboarding, so a wallet created on a fresh install is always younger than it.
 * - `noteDismissed`: the user closed the note.
 *
 * A wallet whose keyring `whenCreated` is older than `firstRunAt` existed before the upgrade. A wallet without
 * `whenCreated` (a keyring entry that never had one) counts as older: showing the note once to someone who did not
 * need it is harmless, hiding it from someone who upgraded is not. The value is a convenience preference: a corrupt
 * or missing record never blocks anything and reads as "first run now".
 */
export type PortfolioLayoutRecord = {
  firstRunAt: number;
  noteDismissed?: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A stored record, or `undefined` when nothing usable is stored. */
export function parsePortfolioLayoutRecord(value: unknown): PortfolioLayoutRecord | undefined {
  if (!isRecord(value) || typeof value.firstRunAt !== 'number' || !Number.isFinite(value.firstRunAt)) return undefined;

  return { firstRunAt: value.firstRunAt, ...(value.noteDismissed === true ? { noteDismissed: true } : {}) };
}

/** Whether the wallet on screen existed before the first run of a build with the By token layout. */
export function walletPredatesLayout(
  account: { whenCreated?: unknown } | undefined,
  record: PortfolioLayoutRecord
): boolean {
  if (!account) return false;
  if (typeof account.whenCreated !== 'number' || !Number.isFinite(account.whenCreated)) return true;

  return account.whenCreated < record.firstRunAt;
}

export function shouldShowLayoutNote(
  account: { whenCreated?: unknown } | undefined,
  record: PortfolioLayoutRecord
): boolean {
  return record.noteDismissed !== true && walletPredatesLayout(account, record);
}
