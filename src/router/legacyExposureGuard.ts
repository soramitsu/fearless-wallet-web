import type { LegacyExposureStatus } from '@extension-base/services/legacy-exposure-service';
import { getLegacyExposureStatus } from '@/extension/messaging/legacy-exposure';

const LEGACY_EXPOSURE_ROUTE_NAMES = {
  Notice: 'SecurityNotice',
  Guide: 'SecurityNoticeGuide',
  Welcome: 'Welcome',
} as const;

type LegacyExposureState = LegacyExposureStatus['state'] | 'guide_available';

type LegacyExposureRedirect = {
  name: string;
  query?: { redirect: string };
};

type LegacyExposureRedirectInput = {
  state: LegacyExposureState | undefined;
  routeName: string | symbol | null | undefined;
  fullPath: string;
  /** The selected wallet is an old or imported, recovery-only one. */
  walletRecoveryOnly?: boolean;
};

// `allow` ends the guard at once: the notice itself must not be sent on to the per-account
// password prompt, which would be sent back here.
function resolveLegacyExposureRedirect({
  state,
  routeName,
  fullPath,
  walletRecoveryOnly = false,
}: LegacyExposureRedirectInput): LegacyExposureRedirect | 'allow' | null {
  const name = typeof routeName === 'string' ? routeName : '';
  const isNoticeRoute = name === LEGACY_EXPOSURE_ROUTE_NAMES.Notice;

  if (state === 'notice_pending') {
    return isNoticeRoute ? 'allow' : { name: LEGACY_EXPOSURE_ROUTE_NAMES.Notice, query: { redirect: fullPath } };
  }

  if (state === 'acknowledged') return null;
  if (state === 'guide_available') return isNoticeRoute ? { name: LEGACY_EXPOSURE_ROUTE_NAMES.Guide } : null;
  // The recovery banner's one action: an old or imported wallet is shown how to move its funds whatever the exposure
  // record says (a profile from before 3.0.1 reads as not exposed).
  if (walletRecoveryOnly && name === LEGACY_EXPOSURE_ROUTE_NAMES.Guide) return null;

  // Nothing to tell this user: the notice and its guide lead back to the wallet.
  return isNoticeRoute || name === LEGACY_EXPOSURE_ROUTE_NAMES.Guide ? { name: LEGACY_EXPOSURE_ROUTE_NAMES.Welcome } : null;
}

// Only acknowledgement is permanent. A fresh profile can import a key later in this window.
let settledState: LegacyExposureState | undefined;

// A background that cannot answer must never keep the user out of the wallet, so a failure reads
// as "nothing to show". Enrollment is held back by the background itself, not by this guard.
async function readLegacyExposureState(): Promise<LegacyExposureState | undefined> {
  if (settledState) return settledState;

  try {
    const { state, importedWallets } = await getLegacyExposureStatus();

    if (state === 'acknowledged') settledState = state;
    if (state === 'not_exposed' && importedWallets?.length) return 'guide_available';

    return state;
  } catch {
    return undefined;
  }
}

function forgetLegacyExposureState(): void {
  settledState = undefined;
}

export { LEGACY_EXPOSURE_ROUTE_NAMES, forgetLegacyExposureState, readLegacyExposureState, resolveLegacyExposureRedirect };
export type { LegacyExposureRedirect, LegacyExposureRedirectInput, LegacyExposureState };
