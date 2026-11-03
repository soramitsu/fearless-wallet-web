import { chrome } from '@extension-base/utils/crossenv';
import { TimeoutService } from '../timeout-service';
import type State from '@extension-base/background/handlers/State';
import { IS_EXTENSION } from '@/consts/global';
import { MIN30 } from '@/consts/time';

/** Chrome ends an idle MV3 service worker 30 s after its last event or extension API call. */
export const UNLOCKED_HEARTBEAT_MS = 20_000;

/** A local extension API call: it resets Chrome's idle timer and opens no connection. */
export type KeepAlive = () => Promise<unknown>;

/**
 * The unlocked keys live only in the background's memory. Chrome ends its service worker once nothing has called it
 * for 30 s, and with it the keys; Firefox runs the background as an event page with its own lifetime, and the web
 * wallet has no worker to keep.
 */
export function serviceWorkerKeepAlive(): KeepAlive | undefined {
  if (!IS_EXTENSION) return undefined;
  const background = chrome?.runtime?.getManifest?.().background as { service_worker?: string } | undefined;

  return background?.service_worker ? () => chrome.runtime.getPlatformInfo() : undefined;
}

export class KeyringLockService extends TimeoutService {
  private deadline: number | undefined;
  // A lock or a newer session ends the heartbeat of the session before it.
  private session = 0;

  constructor(state: State, private readonly keepAlive = serviceWorkerKeepAlive()) {
    super(state);
    state.keyringService.setSessionExpiryCheck(() => this.lockIfExpired());
    state.keyringService.lockSubject.subscribe(() => {
      this.clearLockTimer();
      state.requestService.cancelSigningRequests();
    });
  }

  setExtensionAutoLockTimeout() {
    this.deadline = Date.now() + MIN30;
    // Expiry must revoke the keys even while an open wallet keeps the worker alive.
    this.lazyNext('extensionAutoLock', () => this.state.keyringService.lockKeyring(), MIN30);
    this.session += 1;
    this.keepUnlocked(this.session);
  }

  lockIfExpired(): void {
    // Timers can be delayed by sleep or background throttling. Key access and
    // request dispatch also enforce the absolute deadline, without extending it.
    if (this.deadline !== undefined && Date.now() >= this.deadline) {
      this.clearLockTimer();
      this.state.keyringService.lockKeyring();
    }
  }

  clearLockTimer() {
    this.deadline = undefined;
    this.session += 1;
    this.clearTimeout('extensionAutoLock');
    this.clearTimeout('unlockedHeartbeat');
  }

  lockTimerIsExist() {
    this.lockIfExpired();
    return this.deadline !== undefined;
  }

  /**
   * Keeps Chrome's worker, and the unlocked keys in it, until the session ends, as before the worker could sleep. It
   * calls a local API and opens nothing: the networks still go quiet once no page or site needs them.
   */
  private keepUnlocked(session: number): void {
    if (!this.keepAlive) return;
    this.lockIfExpired();
    // A lock, the deadline, a newer session or a wallet reset (which clears the password without a lock) ends it.
    if (session !== this.session || this.deadline === undefined || !this.state.keyringService.getPassword()) return;
    Promise.resolve().then(this.keepAlive).catch((error: unknown) => {
      if (session !== this.session) return;
      // Chrome may now end the worker at any moment: lock at once rather than at an unknown time.
      console.error('Could not keep the unlocked wallet', error);
      this.state.keyringService.lockKeyring();
      this.clearLockTimer();
    });
    this.lazyNext('unlockedHeartbeat', () => this.keepUnlocked(session), UNLOCKED_HEARTBEAT_MS);
  }
}
