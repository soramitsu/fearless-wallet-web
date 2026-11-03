import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUIET_AFTER_MS, WorkerSleepService } from '@extension-base/services/worker-sleep-service';

const deferred = <T = void>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
};
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function fixture(enabled = true) {
  const order: string[] = [];
  const host = {
    openWork: false,
    hasOpenWork: vi.fn(() => host.openWork),
    quiet: vi.fn(async () => { order.push('quiet'); }),
    restore: vi.fn(async () => { order.push('restore'); }),
  };
  const sleep = new WorkerSleepService(host, enabled);
  const page = () => {
    const closed = deferred();
    sleep.pageOpened(closed.promise);
    return () => closed.resolve();
  };
  return { host, sleep, order, page };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('the extension worker going quiet', () => {
  it('starts quiet and opens the connections for the first wallet page', async () => {
    const { host, sleep, page } = fixture();
    expect(sleep.isQuiet).toBe(true);

    page();
    await settle();

    expect(host.restore).toHaveBeenCalledOnce();
    expect(sleep.isQuiet).toBe(false);
  });

  it('closes them a minute after the last wallet page closes, and not before', async () => {
    const { host, sleep, page } = fixture();
    const closePopup = page();
    const closeSidePanel = page();
    await settle();

    closePopup();
    await settle();
    await vi.advanceTimersByTimeAsync(5 * QUIET_AFTER_MS);
    expect(host.quiet).not.toHaveBeenCalled();

    closeSidePanel();
    await settle();
    await vi.advanceTimersByTimeAsync(QUIET_AFTER_MS - 1);
    expect(host.quiet).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(host.quiet).toHaveBeenCalledOnce();
    expect(sleep.isQuiet).toBe(true);
  });

  it('opens them again when a page comes back, and closes them again once it has gone', async () => {
    const { host, page, order } = fixture();
    page()();
    await vi.advanceTimersByTimeAsync(QUIET_AFTER_MS);

    page()();
    await vi.advanceTimersByTimeAsync(QUIET_AFTER_MS);

    expect(order).toEqual(['restore', 'quiet', 'restore', 'quiet']);
    expect(host.restore).toHaveBeenCalledTimes(2);
  });

  it('counts the minute from the end of the last site request', async () => {
    const { host, sleep } = fixture();
    const release = sleep.hold();
    await sleep.wake();

    await vi.advanceTimersByTimeAsync(3 * QUIET_AFTER_MS);
    expect(host.quiet).not.toHaveBeenCalled();

    release();
    release();
    await vi.advanceTimersByTimeAsync(QUIET_AFTER_MS / 2);
    // A second request half a minute later starts the minute again.
    sleep.hold()();
    await vi.advanceTimersByTimeAsync(QUIET_AFTER_MS - 1);
    expect(host.quiet).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(host.quiet).toHaveBeenCalledOnce();
  });

  it('keeps them while a session or a waiting request is open, and checks again later', async () => {
    const { host, sleep, page } = fixture();
    host.openWork = true;
    page()();
    await vi.advanceTimersByTimeAsync(10 * QUIET_AFTER_MS);
    expect(host.quiet).not.toHaveBeenCalled();
    expect(host.hasOpenWork.mock.calls.length).toBeGreaterThanOrEqual(10);

    host.openWork = false;
    await vi.advanceTimersByTimeAsync(QUIET_AFTER_MS);

    expect(host.quiet).toHaveBeenCalledOnce();
    expect(sleep.isQuiet).toBe(true);
  });

  it('opens them for a session or request that appears while quiet', async () => {
    const { host, sleep } = fixture();
    host.openWork = true;

    sleep.refresh();
    await settle();

    expect(host.restore).toHaveBeenCalledOnce();
    host.openWork = false;
    sleep.refresh();
    await vi.advanceTimersByTimeAsync(QUIET_AFTER_MS);
    expect(host.quiet).toHaveBeenCalledOnce();
  });

  it('closes what work done while quiet opened, such as a discovery sweep', async () => {
    const { host, sleep } = fixture();
    const release = sleep.hold();
    await settle();
    expect(host.restore).not.toHaveBeenCalled();

    release();
    await vi.advanceTimersByTimeAsync(QUIET_AFTER_MS);

    expect(host.quiet).toHaveBeenCalledOnce();
    expect(host.restore).not.toHaveBeenCalled();
  });

  it('never closes anything in the web wallet', async () => {
    const { host, sleep, page } = fixture(false);
    expect(sleep.isQuiet).toBe(false);

    page()();
    sleep.hold()();
    await sleep.wake();
    sleep.refresh();
    await vi.advanceTimersByTimeAsync(10 * QUIET_AFTER_MS);

    expect(host.restore).not.toHaveBeenCalled();
    expect(host.quiet).not.toHaveBeenCalled();
  });
});

describe('races with the connections closing', () => {
  async function closing() {
    const f = fixture();
    const teardown = deferred();
    f.host.quiet.mockImplementationOnce(async () => {
      f.order.push('quiet');
      await teardown.promise;
      f.order.push('quiet done');
    });
    f.page()();
    await vi.advanceTimersByTimeAsync(QUIET_AFTER_MS);
    expect(f.order).toEqual(['restore', 'quiet']);
    return { ...f, finishTeardown: teardown.resolve };
  }

  it('reopens them for a wallet page that connects during teardown, once the teardown is done', async () => {
    const { host, page, order, finishTeardown, sleep } = await closing();

    page();
    await settle();
    expect(host.restore).toHaveBeenCalledOnce();

    finishTeardown();
    await settle();

    expect(order).toEqual(['restore', 'quiet', 'quiet done', 'restore']);
    expect(sleep.isQuiet).toBe(false);
    // The page is still open: nothing closes.
    await vi.advanceTimersByTimeAsync(10 * QUIET_AFTER_MS);
    expect(host.quiet).toHaveBeenCalledOnce();
  });

  it('answers a site request that arrives during teardown only after the connections reopen', async () => {
    const { order, finishTeardown, sleep } = await closing();
    const handled = vi.fn();
    const release = sleep.hold();
    const request = sleep.wake().then(() => { order.push('handled'); handled(); });

    await settle();
    expect(handled).not.toHaveBeenCalled();

    finishTeardown();
    await request;
    release();

    expect(order).toEqual(['restore', 'quiet', 'quiet done', 'restore', 'handled']);
  });

  it('does not close them under a request that arrived just before the idle check ran', async () => {
    const { host, sleep, page } = fixture();
    const busy = deferred();
    host.restore.mockImplementationOnce(async () => { await busy.promise; });
    page()();
    await settle();
    // The minute passes while the first restore is still running; then a request comes in.
    await vi.advanceTimersByTimeAsync(QUIET_AFTER_MS);
    const release = sleep.hold();
    busy.resolve();
    await settle();

    expect(host.quiet).not.toHaveBeenCalled();
    release();
    await vi.advanceTimersByTimeAsync(QUIET_AFTER_MS);
    expect(host.quiet).toHaveBeenCalledOnce();
  });

  it('keeps them through a signing approval that runs after the request window closed', async () => {
    const { host, sleep, page } = fixture();
    // A site's eth_sendTransaction is queued, and its approval window is open.
    host.openWork = true;
    const closeApprovalWindow = page();
    await settle();

    // The person approves; the window closes while the wallet signs and sends.
    const approving = sleep.hold();
    closeApprovalWindow();
    await vi.advanceTimersByTimeAsync(5 * QUIET_AFTER_MS);
    expect(host.quiet).not.toHaveBeenCalled();

    // The transaction is sent and the request settles.
    host.openWork = false;
    approving();
    sleep.refresh();
    await vi.advanceTimersByTimeAsync(QUIET_AFTER_MS - 1);
    expect(host.quiet).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(host.quiet).toHaveBeenCalledOnce();
  });

  it('reports a failed restore to the waiting request and tries again for the next one', async () => {
    const { host, sleep } = fixture();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    host.restore.mockRejectedValueOnce(new Error('storage busy'));

    await expect(sleep.wake()).rejects.toThrow('storage busy');
    // The failed attempt counts as awake: the next idle minute closes what it opened, and a later page restores.
    sleep.hold()();
    await vi.advanceTimersByTimeAsync(QUIET_AFTER_MS);
    expect(host.quiet).toHaveBeenCalledOnce();

    await sleep.wake();
    expect(host.restore).toHaveBeenCalledTimes(2);
  });
});
