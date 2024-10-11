import { TimeoutService } from '../timeout-service';
import type State from '@extension-base/background/handlers/State';
import { MIN30 } from '@/consts/time';

export class KeyringLockService extends TimeoutService {
  constructor(state: State) {
    super(state);
  }

  setExtensionAutoLockTimeout() {
    this.lazyNext('extensionAutoLock', () => null, MIN30);
  }

  clearLockTimer() {
    this.clearTimeout('extensionAutoLock');
  }

  lockTimerIsExist() {
    return this.timeouts.extensionAutoLock !== null;
  }
}
