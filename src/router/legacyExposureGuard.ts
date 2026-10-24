import type { LegacyExposureStatus } from '@extension-base/services/legacy-exposure-service';
import { getLegacyExposureStatus } from '@/extension/messaging/legacy-exposure';

const LEGACY_EXPOSURE_ROUTE_NAMES = {
  Notice: 'SecurityNotice',
  Guide: 'SecurityNoticeGuide',
  Welcome: 'Welcome',
} as const;

type LegacyExposureState = LegacyExposureStatus['state'];

type LegacyExposureRedirect = {
  name: string;
  query?: { redirect: string };
};

type LegacyExposureRedirectInput = {
  state: LegacyExposureState | undefined;
  routeName: string | symbol | null | undefined;
  fullPath: string;
};

// `allow` ends the guard at once: the notice itself must not be sent on to the per-account
// password prompt, which would be sent back here.
function resolveLegacyExposureRedirect({
  state,
  routeName,
  fullPath,
}: LegacyExposureRedirectInput): LegacyExposureRedirect | 'allow' | null {
  const name = typeof routeName === 'string' ? routeName : '';
  const isNoticeRoute = name === LEGACY_EXPOSURE_ROUTE_NAMES.Notice;

  if (state === 'notice_pending') {
    return isNoticeRoute ? 'allow' : { name: LEGACY_EXPOSURE_ROUTE_NAMES.Notice, query: { redirect: fullPath } };
  }

  if (state === 'acknowledged') return null;

  // Nothing to tell this user: the notice and its guide lead back to the wallet.
  return isNoticeRoute || name === LEGACY_EXPOSURE_ROUTE_NAMES.Guide ? { name: LEGACY_EXPOSURE_ROUTE_NAMES.Welcome } : null;
}

// The record is written once, so neither of these states changes back; every navigation after
// the first one in a window skips the background.
let settledState: LegacyExposureState | undefined;

// A background that cannot answer must never keep the user out of the wallet, so a failure reads
// as "nothing to show". Enrollment is held back by the background itself, not by this guard.
async function readLegacyExposureState(): Promise<LegacyExposureState | undefined> {
  if (settledState) return settledState;

  try {
    const { state } = await getLegacyExposureStatus();

    if (state === 'acknowledged' || state === 'not_exposed') settledState = state;

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
