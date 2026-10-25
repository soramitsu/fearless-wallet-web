import { beforeEach, describe, expect, it, vi } from 'vitest';

// chrome.storage.local over a plain object, answering on a later task like the real API.
const mockChrome = vi.hoisted(() => {
  const storage: Record<string, unknown> = {};
  const later = (done: () => void) => setTimeout(done, 0);
  return {
    storage,
    runtime: { lastError: undefined as undefined | { message: string } },
    local: {
      get: vi.fn((keys: string[] | null, done: (result: Record<string, unknown>) => void) => later(() =>
        done(keys ? Object.fromEntries(keys.filter((key) => key in storage).map((key) => [key, structuredClone(storage[key])])) : { ...storage }))),
      set: vi.fn((items: Record<string, unknown>, done: () => void) => later(() => {
        Object.assign(storage, structuredClone(items));
        done();
      })),
      remove: vi.fn((key: string, done: () => void) => later(() => {
        delete storage[key];
        done();
      })),
    },
  };
});
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: mockChrome.runtime, storage: { local: mockChrome.local } },
}));

import { tonStore } from '@extension-base/stores/TonStore';
import LegacyPasswordPromptStore from '@extension-base/stores/LegacyPasswordPromptStore';

beforeEach(() => {
  Object.keys(mockChrome.storage).forEach((key) => delete mockChrome.storage[key]);
});

describe('stores behind the key access services', () => {
  it('rewrites one TON record in place, keeping fields the caller does not set', async () => {
    // A 3.0.5 record (no meta) with a copy staged by an interrupted password change and a field from
    // a future version.
    mockChrome.storage['fw:ton:UQfixture'] = {
      name: 'TON', address: 'UQfixture', cipherSeed: 'current', pendingCipherSeed: 'staged', publicKeyHex: '00', futureField: 1,
    };
    const published = vi.fn();

    await tonStore.updateAndWait('UQfixture', (current) => current && { ...current, name: 'Savings' }, published);

    expect(mockChrome.storage['fw:ton:UQfixture']).toEqual({
      name: 'Savings', address: 'UQfixture', cipherSeed: 'current', pendingCipherSeed: 'staged', publicKeyHex: '00', futureField: 1,
    });
    expect(published).toHaveBeenCalledWith(mockChrome.storage['fw:ton:UQfixture']);
    expect(await tonStore.updateAndWait('UQmissing', (current) => current && { ...current, name: 'x' })).toBeUndefined();
    expect(mockChrome.storage).not.toHaveProperty('fw:ton:UQmissing');
  });

  it('keeps the "Skip for now" choice under fw:legacyPasswordPrompt', async () => {
    const store = new LegacyPasswordPromptStore();

    await store.setAndWait('legacyPasswordPrompt', { deferredAt: 1_700_000_000_000 });
    expect(mockChrome.storage).toEqual({ 'fw:legacyPasswordPrompt': { deferredAt: 1_700_000_000_000 } });
    expect(await new LegacyPasswordPromptStore().getAndWait('legacyPasswordPrompt')).toEqual({ deferredAt: 1_700_000_000_000 });

    store.remove('legacyPasswordPrompt');
    await vi.waitFor(() => expect(mockChrome.storage).toEqual({}));
  });
});
