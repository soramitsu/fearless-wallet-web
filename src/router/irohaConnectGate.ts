import type { NavigationGuardWithThis } from 'vue-router';
import { isIrohaConnectEnabled } from '@/util/releaseFeatures';

export const IROHA_CONNECT_UNAVAILABLE_NOTICE = 'iroha-connect-unavailable';

// A stale deep link, popup route or unlock redirect lands on Settings with a
// notice that nothing was signed while release builds compile IrohaConnect off.
export const createIrohaConnectRouteGuard =
  (settingsRouteName: string): NavigationGuardWithThis<undefined> =>
  (_to, _from, next) => {
    if (isIrohaConnectEnabled()) return next();

    return next({ name: settingsRouteName, query: { notice: IROHA_CONNECT_UNAVAILABLE_NOTICE } });
  };
