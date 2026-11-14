import { logger as createLogger } from '@polkadot/util';

/**
 * How long the wallet keeps its node connections after the last wallet page closed, the last site request was
 * answered and the last session or waiting request ended. Chrome stops an idle MV3 worker 30 s after that.
 */
export const QUIET_AFTER_MS = 60_000;

export interface WorkerSleepHost {
  /** A WalletConnect or Iroha Connect session, or a request waiting for the person, still needs the networks. */
  hasOpenWork(): boolean;
  /** Closes the node connections, balance subscriptions and jobs that keep the worker running. */
  quiet(): Promise<void>;
  /** Opens them again. */
  restore(): Promise<void>;
}

export interface WorkerSleepTimers {
  setTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimer(timer: ReturnType<typeof setTimeout>): void;
}

const TIMERS: WorkerSleepTimers = {
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: (timer) => clearTimeout(timer),
};

/**
 * Lets the extension's worker stop while nothing needs the wallet. Its node connections, balance subscriptions and
 * jobs kept it running for as long as a wallet existed; this closes them after QUIET_AFTER_MS without an open wallet
 * page, a request being handled or open work, and Chrome then ends the idle worker. The wallet starts quiet: the
 * first page or request opens them.
 *
 * Closing and opening run one after the other, so a page or request that arrives while the connections close waits
 * until they have closed and then opens them again.
 */
export class WorkerSleepService {
  private readonly logger = createLogger('WorkerSleep');
  private pages = 0;
  private holds = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private sleeping: boolean;
  private transition: Promise<void> = Promise.resolve();

  constructor(
    private readonly host: WorkerSleepHost,
    readonly enabled: boolean,
    private readonly quietAfterMs = QUIET_AFTER_MS,
    private readonly timers: WorkerSleepTimers = TIMERS
  ) {
    this.sleeping = enabled;
  }

  /** Whether the connections are closed, or were never opened. */
  get isQuiet(): boolean {
    return this.sleeping;
  }

  /** Whether a wallet page (popup, side panel or tab) is open. */
  get hasOpenPages(): boolean {
    return this.pages > 0;
  }

  /** A wallet page (popup, side panel or tab) keeps the connections open until its port closes. */
  pageOpened(closed: Promise<unknown>): void {
    this.pages += 1;
    this.cancelQuiet();
    void this.wake().catch(() => undefined);
    void closed.then(() => {
      this.pages -= 1;
      this.scheduleQuiet();
    });
  }

  /**
   * Keeps the connections as they are while some work runs: a request being handled, an alarm, a discovery sweep.
   * It does not open them. The returned function ends the hold.
   */
  hold(): () => void {
    let held = true;

    this.holds += 1;
    this.cancelQuiet();

    return () => {
      if (!held) return;
      held = false;
      this.holds -= 1;
      this.scheduleQuiet();
    };
  }

  /** Opens the connections if they are closed, after any closing in progress. Resolves once they are open. */
  wake(): Promise<void> {
    if (!this.enabled) return Promise.resolve();

    const restore = this.transition.then(async () => {
      if (!this.sleeping) return;
      await this.host.restore();
      // A failed restore leaves the wallet asleep, so the next page message or site request tries again.
      this.sleeping = false;
    });

    this.transition = restore.catch((error: unknown) => this.logger.error('Could not reconnect the wallet', error));

    return restore;
  }

  /** Looks at the open work again: open work opens the connections; with none they close once nothing else is open. */
  refresh(): void {
    if (!this.enabled) return;
    if (this.host.hasOpenWork()) void this.wake().catch(() => undefined);
    this.scheduleQuiet();
  }

  private present(): boolean {
    return this.pages > 0 || this.holds > 0;
  }

  private cancelQuiet(): void {
    if (this.timer === undefined) return;
    this.timers.clearTimer(this.timer);
    this.timer = undefined;
  }

  // While nothing is present a check is always pending. It closes the connections once there is no open work either.
  private scheduleQuiet(): void {
    if (!this.enabled || this.present()) return;
    this.cancelQuiet();
    this.timer = this.timers.setTimer(() => this.onIdle(), this.quietAfterMs);
  }

  private onIdle(): void {
    this.timer = undefined;

    // Closing runs even when the connections are already closed: work done meanwhile (a sweep) or a failed restore may
    // have opened some.
    this.transition = this.transition
      .then(async () => {
        if (this.present()) return;
        // Open work is checked again later rather than watched: it ends in many places, and nothing closes till then.
        if (this.host.hasOpenWork()) {
          this.scheduleQuiet();
          return;
        }
        this.sleeping = true;
        await this.host.quiet();
      })
      .catch((error: unknown) => this.logger.error('Could not close the wallet connections', error));
  }
}
