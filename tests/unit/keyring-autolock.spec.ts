import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import { KeyringLockService } from '@extension-base/services/keyring-service/KeyringLock';
import type State from '@extension-base/background/handlers/State';
import { MIN30 } from '@/consts/time';

function fixture() {
  const lockSubject = new Subject<void>();
  let password = 'public-test-password';
  let checkExpiry = () => {};
  const keyringService = {
    lockSubject,
    setSessionExpiryCheck: (check: () => void) => { checkExpiry = check; },
    lockKeyring: vi.fn(() => { password = ''; lockSubject.next(); return true; }),
  };
  const requestService = { cancelSigningRequests: vi.fn() };
  const service = new KeyringLockService({ keyringService, requestService } as unknown as State);
  return { service, keyringService, requestService, checkExpiry: () => checkExpiry(), password: () => password };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T00:00:00Z')); });
afterEach(() => vi.useRealTimers());

describe('wallet session expiry', () => {
  it('locks an already-open wallet and cancels its signing requests at 30 minutes', () => {
    const f = fixture();
    f.service.setExtensionAutoLockTimeout();
    vi.advanceTimersByTime(MIN30 - 1);
    expect(f.password()).not.toBe('');
    expect(f.service.lockTimerIsExist()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(f.password()).toBe('');
    expect(f.keyringService.lockKeyring).toHaveBeenCalledOnce();
    expect(f.requestService.cancelSigningRequests).toHaveBeenCalledOnce();
    expect(f.service.lockTimerIsExist()).toBe(false);
  });

  it('enforces expiry at key access after sleep even if the timer has not fired', () => {
    const f = fixture();
    f.service.setExtensionAutoLockTimeout();
    vi.setSystemTime(Date.now() + MIN30 + 1);
    expect(f.keyringService.lockKeyring).not.toHaveBeenCalled();
    f.checkExpiry();
    expect(f.password()).toBe('');
    expect(f.requestService.cancelSigningRequests).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(f.keyringService.lockKeyring).toHaveBeenCalledOnce();
  });

  it('does not extend the deadline when background requests check the session', () => {
    const f = fixture();
    f.service.setExtensionAutoLockTimeout();
    for (let i = 0; i < 90; i++) {
      vi.advanceTimersByTime(20_000);
      f.checkExpiry();
    }
    expect(f.password()).toBe('');
    expect(f.keyringService.lockKeyring).toHaveBeenCalledOnce();
  });

  it('replaces an old deadline when authentication successfully starts a new session', () => {
    const f = fixture();
    f.service.setExtensionAutoLockTimeout();
    vi.advanceTimersByTime(MIN30 / 2);
    f.service.setExtensionAutoLockTimeout();
    vi.advanceTimersByTime(MIN30 / 2);
    expect(f.keyringService.lockKeyring).not.toHaveBeenCalled();
    vi.advanceTimersByTime(MIN30 / 2);
    expect(f.keyringService.lockKeyring).toHaveBeenCalledOnce();
  });

  it('clears the old timer on manual lock and treats an unarmed timer as absent', () => {
    const f = fixture();
    expect(f.service.lockTimerIsExist()).toBe(false);
    f.service.setExtensionAutoLockTimeout();
    f.keyringService.lockKeyring();
    vi.runAllTimers();
    expect(f.keyringService.lockKeyring).toHaveBeenCalledOnce();
    expect(f.service.lockTimerIsExist()).toBe(false);
  });
});
