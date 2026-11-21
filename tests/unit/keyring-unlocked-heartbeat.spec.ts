import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import {
  KeyringLockService,
  serviceWorkerKeepAlive,
  UNLOCKED_HEARTBEAT_MS,
  type KeepAlive,
} from '@extension-base/services/keyring-service/KeyringLock';
import { QUIET_AFTER_MS, WorkerSleepService } from '@extension-base/services/worker-sleep-service';
import type State from '@extension-base/background/handlers/State';
import { MIN30 } from '@/consts/time';

const CHROME_MANIFEST = { background: { service_worker: 'background.js', type: 'module' } };
const env = vi.hoisted(() => ({
  extension: true,
  manifest: {} as unknown,
  getPlatformInfo: vi.fn(async () => ({ os: 'mac', arch: 'arm64' })),
}));
vi.mock('@/consts/global', () => ({ get IS_EXTENSION() { return env.extension; } }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getManifest: () => env.manifest, getPlatformInfo: env.getPlatformInfo } },
}));

const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

function fixture(keepAlive?: KeepAlive) {
  const lockSubject = new Subject<void>();
  let password = 'public-test-password';
  let checkExpiry = () => {};
  const keyringService = {
    lockSubject,
    setSessionExpiryCheck: (check: () => void) => { checkExpiry = check; },
    getPassword: () => { checkExpiry(); return password; },
    // As the keyring does: only locking an unlocked wallet notifies.
    lockKeyring: vi.fn(() => {
      const wasUnlocked = !!password;
      password = '';
      if (wasUnlocked) lockSubject.next();
      return true;
    }),
  };
  const requestService = { cancelSigningRequests: vi.fn() };
  const state = { keyringService, requestService } as unknown as State;
  const service = keepAlive ? new KeyringLockService(state, keepAlive) : new KeyringLockService(state);
  return {
    service,
    keyringService,
    requestService,
    password: () => password,
    // A wallet reset clears the password without a lock.
    reset: () => { password = ''; },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-03T00:00:00Z'));
  env.extension = true;
  env.manifest = CHROME_MANIFEST;
  env.getPlatformInfo.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('an unlocked wallet in Chrome keeps its worker until the session ends', () => {
  it('calls a local API at unlock and every 20 s, and still locks at the 30-minute deadline', async () => {
    const keepAlive = vi.fn<KeepAlive>(async () => undefined);
    const f = fixture(keepAlive);
    f.service.setExtensionAutoLockTimeout();
    await settle();
    expect(keepAlive).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(MIN30 - 1);
    expect(keepAlive).toHaveBeenCalledTimes(MIN30 / UNLOCKED_HEARTBEAT_MS);
    expect(f.password()).not.toBe('');

    await vi.advanceTimersByTimeAsync(1);
    expect(f.password()).toBe('');
    expect(f.requestService.cancelSigningRequests).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(MIN30);
    expect(keepAlive).toHaveBeenCalledTimes(MIN30 / UNLOCKED_HEARTBEAT_MS);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops at a manual lock', async () => {
    const keepAlive = vi.fn<KeepAlive>(async () => undefined);
    const f = fixture(keepAlive);
    f.service.setExtensionAutoLockTimeout();
    await settle();
    f.keyringService.lockKeyring();

    await vi.advanceTimersByTimeAsync(MIN30);
    expect(keepAlive).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops after a wallet reset, which clears the password without a lock', async () => {
    const keepAlive = vi.fn<KeepAlive>(async () => undefined);
    const f = fixture(keepAlive);
    f.service.setExtensionAutoLockTimeout();
    await settle();
    f.reset();

    await vi.advanceTimersByTimeAsync(UNLOCKED_HEARTBEAT_MS * 3);
    expect(keepAlive).toHaveBeenCalledOnce();
  });

  it('locks before calling again once the machine slept past the deadline', async () => {
    const keepAlive = vi.fn<KeepAlive>(async () => undefined);
    const f = fixture(keepAlive);
    f.service.setExtensionAutoLockTimeout();
    await settle();

    // Timers do not run while the machine sleeps; the clock does.
    vi.setSystemTime(Date.now() + MIN30 + 1);
    await vi.advanceTimersByTimeAsync(UNLOCKED_HEARTBEAT_MS);
    expect(f.password()).toBe('');
    expect(f.requestService.cancelSigningRequests).toHaveBeenCalledOnce();
    expect(keepAlive).toHaveBeenCalledOnce();
  });

  it('keeps one heartbeat when a password change starts a new session', async () => {
    const keepAlive = vi.fn<KeepAlive>(async () => undefined);
    const f = fixture(keepAlive);
    f.service.setExtensionAutoLockTimeout();
    await vi.advanceTimersByTimeAsync(UNLOCKED_HEARTBEAT_MS / 2);
    f.service.setExtensionAutoLockTimeout();

    await vi.advanceTimersByTimeAsync(UNLOCKED_HEARTBEAT_MS * 3);
    // One call at each session start, then one every 20 s from the second only.
    expect(keepAlive).toHaveBeenCalledTimes(5);
  });

  it("locks at once when the call fails, but an older session's late failure leaves a newer one alone", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let failFirst!: (error: Error) => void;
    const keepAlive = vi.fn<KeepAlive>()
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { failFirst = reject; }))
      .mockResolvedValue(undefined);
    const f = fixture(keepAlive);
    f.service.setExtensionAutoLockTimeout();
    await settle();
    f.service.setExtensionAutoLockTimeout();
    await settle();

    failFirst(new Error('late answer for the replaced session'));
    await settle();
    expect(f.keyringService.lockKeyring).not.toHaveBeenCalled();
    expect(f.password()).not.toBe('');

    keepAlive.mockRejectedValueOnce(new Error('Extension context invalidated.'));
    await vi.advanceTimersByTimeAsync(UNLOCKED_HEARTBEAT_MS);
    expect(f.password()).toBe('');
    expect(f.requestService.cancelSigningRequests).toHaveBeenCalledOnce();
    const calls = keepAlive.mock.calls.length;
    await vi.advanceTimersByTimeAsync(MIN30);
    expect(keepAlive).toHaveBeenCalledTimes(calls);
  });

  it('leaves the network sleep alone: the connections still close after the idle minute', async () => {
    const keepAlive = vi.fn<KeepAlive>(async () => undefined);
    const f = fixture(keepAlive);
    const host = { hasOpenWork: vi.fn(() => false), quiet: vi.fn(async () => undefined), restore: vi.fn(async () => undefined) };
    const sleep = new WorkerSleepService(host, true);
    // The popup's unlock request opened the connections and was answered.
    const release = sleep.hold();
    await sleep.wake();
    f.service.setExtensionAutoLockTimeout();
    release();

    await vi.advanceTimersByTimeAsync(QUIET_AFTER_MS);
    expect(host.quiet).toHaveBeenCalledOnce();
    expect(sleep.isQuiet).toBe(true);
    const calls = keepAlive.mock.calls.length;
    await vi.advanceTimersByTimeAsync(UNLOCKED_HEARTBEAT_MS * 2);
    expect(keepAlive).toHaveBeenCalledTimes(calls + 2);
    expect(host.restore).toHaveBeenCalledOnce();
  });
});

describe('which background gets the heartbeat', () => {
  it("keeps Chrome's service worker, and only once a wallet unlocks", async () => {
    const f = fixture();
    await vi.advanceTimersByTimeAsync(MIN30);
    expect(env.getPlatformInfo).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    f.service.setExtensionAutoLockTimeout();
    await settle();
    expect(env.getPlatformInfo).toHaveBeenCalledOnce();
  });

  it("leaves Firefox's event page and the web wallet as they are", () => {
    expect(serviceWorkerKeepAlive()).toBeTypeOf('function');
    env.manifest = { background: { scripts: ['background.js'], type: 'module' } };
    expect(serviceWorkerKeepAlive()).toBeUndefined();
    env.manifest = CHROME_MANIFEST;
    env.extension = false;
    expect(serviceWorkerKeepAlive()).toBeUndefined();
  });
});
