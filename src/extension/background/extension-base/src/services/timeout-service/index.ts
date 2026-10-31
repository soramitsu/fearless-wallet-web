import type State from '@extension-base/background/handlers/State';

type Timeouts = {
  [key in string]: NodeJS.Timeout | null;
};

export class TimeoutService {
  protected timeouts: Timeouts = {};

  constructor(protected state: State) {}

  lazyNext = (key: string, callback: () => void, delay = 1000) => {
    this.clearTimeout(key);

    const lazy = setTimeout(() => {
      // Release this timer before invoking user code, which may schedule the same key again.
      this.clearTimeout(key);
      callback();
    }, delay);

    this.timeouts[key] = lazy;
  };

  clearTimeout(key: string) {
    if (this.timeouts[key]) {
      clearTimeout(this.timeouts[key] as NodeJS.Timeout);

      this.timeouts[key] = null;
    }
  }
}
