import { isOpenClient } from '@extension-base/background/handlers/helpers';
import type State from '@extension-base/background/handlers/State';
import { MIN30 } from '@/consts/time';

export class TimeoutService {
  private extensionAutoLockTimer: NodeJS.Timeout | null = null;

  constructor(private state: State) {}

  setTimeoutOperation(callback: () => any, delay = 1000) {
    return setTimeout(callback, delay);
  }

  setExtensionAutoLockTimeout() {
    const callback = async () => {
      const isOpen = await isOpenClient();

      if (isOpen) return this.clearLockTimer();

      this.state.keyringService.lockKeyring();
    };

    this.clearLockTimer();

    this.extensionAutoLockTimer = this.setTimeoutOperation(callback, MIN30);

    return true;
  }

  clearLockTimer() {
    if (this.extensionAutoLockTimer) {
      clearTimeout(this.extensionAutoLockTimer);

      this.extensionAutoLockTimer = null;
    }
  }

  lockTimerIsExist() {
    return this.extensionAutoLockTimer !== null;
  }
}
