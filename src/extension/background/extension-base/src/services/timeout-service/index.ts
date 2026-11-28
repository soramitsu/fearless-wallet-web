import type State from '@extension-base/background/handlers/State';

type Timeouts = {
  [key in string]: NodeJS.Timeout | null;
};

export class TimeoutService {
  protected timeouts: Timeouts = {};
  // When the oldest call still waiting for its key was made.
  private waitingSince: Record<string, number> = {};

  constructor(protected state: State) {}

  /**
   * Runs `callback` once `delay` ms pass without another call for `key`. With `maxWait`, calls that keep arriving
   * cannot postpone it for ever: it runs no later than `maxWait` ms after the first call that is still waiting.
   */
  lazyNext = (key: string, callback: () => void, delay = 1000, maxWait?: number) => {
    const now = Date.now();
    const since = this.timeouts[key] ? this.waitingSince[key] ?? now : now;

    this.clearTimeout(key);

    const wait = maxWait === undefined ? delay : Math.max(0, Math.min(delay, since + maxWait - now));
    const lazy = setTimeout(() => {
      // Release this timer before invoking user code, which may schedule the same key again.
      this.clearTimeout(key);
      callback();
    }, wait);

    this.timeouts[key] = lazy;
    this.waitingSince[key] = since;
  };

  clearTimeout(key: string) {
    if (this.timeouts[key]) {
      clearTimeout(this.timeouts[key] as NodeJS.Timeout);

      this.timeouts[key] = null;
    }

    delete this.waitingSince[key];
  }
}
