import { TimeoutService } from '../timeout-service';
import type State from '@extension-base/background/handlers/State';
import { MIN30 } from '@/consts/time';

export class KeyringLockService extends TimeoutService {
  private deadline: number | undefined;

  constructor(state: State) {
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
    this.clearTimeout('extensionAutoLock');
  }

  lockTimerIsExist() {
    this.lockIfExpired();
    return this.deadline !== undefined;
  }
}
