// Shared motion switches for the wallet's feel (brand kit v3, SPEC part 3): every animation here stops under the
// system's reduced motion and the wallet's Reduced paint, and the slow decorative ones also stop at Lite.

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const effectsTier = (): string | undefined => globalThis.document?.documentElement.dataset.fwEffects;

/** Motion that carries meaning (a number counting to its value, a list arriving): off under reduced motion. */
export const motionAllowed = (): boolean => !prefersReducedMotion() && effectsTier() !== 'reduced';

/** The first reveal of the balance in this page counts up from zero; later changes count from the last value. */
let balanceRevealed = false;
export function claimFirstBalanceReveal(): boolean {
  if (balanceRevealed) return false;
  balanceRevealed = true;
  return true;
}

/** Asset rows animate in once per page: rows created within this window after the first one. */
const ENTRANCE_WINDOW_MS = 1500;
let entranceOpenedAt: number | undefined;
export function claimListEntrance(now = Date.now()): boolean {
  if (!motionAllowed()) return false;
  entranceOpenedAt ??= now;
  return now - entranceOpenedAt <= ENTRANCE_WINDOW_MS;
}

/** Test hook: a fresh page. */
export function resetFeelMotion(): void {
  balanceRevealed = false;
  entranceOpenedAt = undefined;
}
