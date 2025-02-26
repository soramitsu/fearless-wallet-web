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
      callback();

      this.clearTimeout(key);
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
