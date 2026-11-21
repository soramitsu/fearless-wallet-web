import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import Extension, { SESSION_START_LOCK_WAIT_MS } from '@extension-base/background/handlers/Extension';
import { KeyringLockService } from '@extension-base/services/keyring-service/KeyringLock';
import type State from '@extension-base/background/handlers/State';
import type { RequestChangePassword } from '@extension-base/background/types/types';

vi.mock('@polkadot/phishing', () => ({ checkIfDenied: vi.fn(async () => false) }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));

const PASSWORD = 'Public-fixture-password-1';
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

// The keyring as the lock and unlock handlers see it. Unlocking and locking each start a new authentication
// revision; the verifier upgrade, like the real one, refuses once its revision has changed and locks the wallet
// when its own storage write fails.
function fixture() {
  const lockSubject = new Subject<void>();
  let password = '';
  let revision = 0;
  const upgrades: Array<{ store: () => void; fail: (error: Error) => void }> = [];
  const keyringService = {
    lockSubject,
    setSessionExpiryCheck: vi.fn(),
    tonKeyring: { hasStorageIssues: false },
    getPassword: () => password,
    unlockKeyring: vi.fn(({ password: typed }: { password: string }) => {
      if (typed !== PASSWORD) return false;
      revision += 1;
      password = typed;
      return true;
    }),
    lockKeyring: vi.fn(() => {
      const wasUnlocked = !!password;
      revision += 1;
      password = '';
      if (wasUnlocked) lockSubject.next();
      return true;
    }),
    waitForPasswordVerifierUpgrade: vi.fn(() => {
      const started = revision;
      return new Promise<void>((resolve, reject) => {
        upgrades.push({
          store: () => (revision === started
            ? resolve()
            : reject(new Error('Wallet authentication changed during verifier upgrade.'))),
          fail: (error) => {
            if (revision === started) keyringService.lockKeyring();
            reject(error);
          },
        });
      });
    }),
    changeMasterPassword: vi.fn<(request: RequestChangePassword) => Promise<boolean>>(),
  };
  const state = { keyringService, requestService: { cancelSigningRequests: vi.fn() } } as unknown as State;
  const keyringLockService = new KeyringLockService(state);
  Object.assign(state, { keyringLockService });

  return {
    extension: new Extension(state),
    keyringService,
    keyringLockService,
    upgrades,
    password: () => password,
    // What the keyring does once a new master password is stored.
    publishPassword: (next: string) => { revision += 1; password = next; },
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-07T00:00:00Z')); });
afterEach(() => vi.useRealTimers());

// Every wallet page asks the background for a non-forced lock when it opens (App.vue). A session that is still
// being started has no deadline yet; until 4.2.7 that lock ended it and the unlock failed with
// "Wallet authentication changed during verifier upgrade."
describe('a wallet page that opens while the wallet is unlocking', () => {
  it('does not end the unlock: the session starts with its deadline and the page keeps it', async () => {
    const f = fixture();
    const unlock = f.extension.unlockKeyring({ password: PASSWORD });
    // The password is accepted, but the stronger verifier is still being stored: no deadline yet.
    expect(f.keyringLockService.lockTimerIsExist()).toBe(false);

    const pageLock = f.extension.lockKeyring(false);
    await settle();
    expect(f.keyringService.lockKeyring).not.toHaveBeenCalled();

    f.upgrades[0].store();
    await expect(unlock).resolves.toBe(true);
    await expect(pageLock).resolves.toBe(false);
    expect(f.password()).toBe(PASSWORD);
    expect(f.keyringLockService.lockTimerIsExist()).toBe(true);
    expect(f.keyringService.lockKeyring).not.toHaveBeenCalled();
  });

  it('locks once an unlock whose verifier could not be stored has failed, and extends no session', async () => {
    const f = fixture();
    const unlock = f.extension.unlockKeyring({ password: PASSWORD });
    const pageLock = f.extension.lockKeyring(false);

    f.upgrades[0].fail(new Error('Storage failed'));
    await expect(unlock).rejects.toThrow('Storage failed');
    await expect(pageLock).resolves.toBe(true);
    expect(f.password()).toBe('');
    expect(f.keyringLockService.lockTimerIsExist()).toBe(false);
  });

  it('still lets Lock end an unlock at once', async () => {
    const f = fixture();
    const unlock = f.extension.unlockKeyring({ password: PASSWORD });

    expect(f.extension.lockKeyring(true)).toBe(true);
    expect(f.password()).toBe('');

    f.upgrades[0].store();
    await expect(unlock).rejects.toThrow('Wallet authentication changed during verifier upgrade.');
    expect(f.keyringLockService.lockTimerIsExist()).toBe(false);
  });

  it('waits for a newer unlock that started while it waited', async () => {
    const f = fixture();
    const first = f.extension.unlockKeyring({ password: PASSWORD });
    const pageLock = f.extension.lockKeyring(false);
    // Another page unlocks: the first unlock's revision is gone.
    const second = f.extension.unlockKeyring({ password: PASSWORD });

    f.upgrades[0].store();
    await expect(first).rejects.toThrow('Wallet authentication changed during verifier upgrade.');
    await settle();
    expect(f.keyringService.lockKeyring).not.toHaveBeenCalled();

    f.upgrades[1].store();
    await expect(second).resolves.toBe(true);
    await expect(pageLock).resolves.toBe(false);
    expect(f.keyringLockService.lockTimerIsExist()).toBe(true);
  });

  it('ends an unlock stuck past the wait, as a page start did before', async () => {
    const f = fixture();
    const unlock = f.extension.unlockKeyring({ password: PASSWORD });
    const pageLock = f.extension.lockKeyring(false);

    await vi.advanceTimersByTimeAsync(SESSION_START_LOCK_WAIT_MS - 1);
    expect(f.keyringService.lockKeyring).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(pageLock).resolves.toBe(true);
    expect(f.password()).toBe('');

    // A later page start does not wait for it again.
    expect(f.extension.lockKeyring(false)).toBe(true);

    f.upgrades[0].store();
    await expect(unlock).rejects.toThrow('Wallet authentication changed during verifier upgrade.');
    expect(f.keyringLockService.lockTimerIsExist()).toBe(false);
  });

  it('does not end the creation of the first wallet password', async () => {
    const f = fixture();
    let finish!: (stored: boolean) => void;
    f.keyringService.changeMasterPassword.mockImplementation(({ newPassword }) => new Promise<boolean>((resolve) => {
      finish = (stored) => {
        if (stored) f.publishPassword(newPassword);
        resolve(stored);
      };
    }));
    const change = f.extension.changeMasterPassword({ oldPassword: '', newPassword: PASSWORD });
    const pageLock = f.extension.lockKeyring(false);
    await settle();
    expect(f.keyringService.lockKeyring).not.toHaveBeenCalled();

    finish(true);
    await expect(change).resolves.toBe(true);
    await expect(pageLock).resolves.toBe(false);
    expect(f.password()).toBe(PASSWORD);
    expect(f.keyringLockService.lockTimerIsExist()).toBe(true);
  });

  it('answers at once when no session is starting', () => {
    const f = fixture();
    expect(f.extension.lockKeyring(false)).toBe(true);
    expect(f.keyringService.lockKeyring).toHaveBeenCalledOnce();
  });
});
