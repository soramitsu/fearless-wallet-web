import { EMPTY_IROHA_CONNECT_SNAPSHOT, type IrohaConnectSnapshot } from './types';
import type { Port } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import { isIrohaConnectEnabled } from '@/util/releaseFeatures';

export const IROHA_CONNECT_UNAVAILABLE = 'IrohaConnect is not available in this version.';

// Every IrohaConnect action except the idle subscription refuses before it
// touches the service while the build compiles IrohaConnect off.
export function requireEnabledIrohaConnect<T>(service: T): T {
  if (!isIrohaConnectEnabled()) throw new Error(IROHA_CONNECT_UNAVAILABLE);

  return service;
}

// Release builds report the idle snapshot without subscribing, so no request can
// ever reach the approval popup.
export function subscribeIrohaConnectState(
  { irohaConnectService, subscriptionService }: Pick<State, 'irohaConnectService' | 'subscriptionService'>,
  id: string,
  port?: Port
): IrohaConnectSnapshot {
  if (!isIrohaConnectEnabled()) return { ...EMPTY_IROHA_CONNECT_SNAPSHOT };

  const cb = subscriptionService.createSubscription<'pri(irohaConnect.subscribe)'>(id, port);
  const subscription = irohaConnectService.stateSubject.subscribe(cb);

  subscriptionService.setUnsubscriptionHandle(id, () => subscription.unsubscribe());
  port?.onDisconnect.addListener(() => subscriptionService.cancelSubscription(id));

  return irohaConnectService.snapshot;
}
