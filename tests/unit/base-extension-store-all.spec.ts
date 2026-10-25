import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mockChrome = vi.hoisted(() => ({
  runtime: { lastError: undefined as undefined | { message: string } },
  storage: { local: { set: vi.fn(), get: vi.fn(), remove: vi.fn() } },
}));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: mockChrome }));
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import AccountsStore from '@extension-base/stores/Accounts';
import KeyringStore from '@extension-base/stores/KeyringStore';
import { tonStore } from '@extension-base/stores/TonStore';

class TestStore extends BaseExtensionStore<{ encoded: string }> {}

const fixture = {
  'fw:account:0x01': { encoded: 'first' },
  'fw:account:0x02': { encoded: 'second' },
  'fw:keyring': { passwordHash: '0xabcdef' },
  'other:account:0x03': { encoded: 'not ours' },
};

// Chrome answers on a later task, after the caller has already continued.
function answerLater(result: () => Record<string, unknown> | undefined, error?: string) {
  mockChrome.storage.local.get.mockImplementation((_keys, done) => {
    setTimeout(() => {
      mockChrome.runtime.lastError = error ? { message: error } : undefined;
      done(result());
      mockChrome.runtime.lastError = undefined;
    }, 0);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockChrome.runtime.lastError = undefined;
});
afterEach(() => vi.restoreAllMocks());

describe('extension store full reads', () => {
  it('settles only after every stored record has been delivered', async () => {
    answerLater(() => fixture);
    const seen: string[] = [];
    let settledWith: string[] | undefined;
    const reading = new TestStore('fw').all((key) => seen.push(key)).then(() => { settledWith = [...seen]; });
    await Promise.resolve();
    expect(settledWith).toBeUndefined();
    expect(seen).toEqual([]);
    await reading;
    expect(settledWith).toEqual(['account:0x01', 'account:0x02', 'keyring']);
    expect(mockChrome.storage.local.get).toHaveBeenCalledExactlyOnceWith(null, expect.any(Function));
  });

  it('rejects a failed read instead of reporting an empty store', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    answerLater(() => undefined, 'IO error: LOCK file in use');
    const update = vi.fn();
    await expect(new TestStore('fw').all(update)).rejects.toThrow('IO error: LOCK file in use');
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects when applying the records fails', async () => {
    answerLater(() => fixture);
    await expect(new TestStore('fw').allMap(() => { throw new Error('apply failed'); })).rejects.toThrow('apply failed');
  });

  it('hands the keyring a load promise that tracks the real read', async () => {
    answerLater(() => fixture);
    const store = new AccountsStore();
    const loaded = vi.fn();
    const keys: string[] = [];
    store.all((key) => keys.push(key));
    const tracked = store.allLoaded.then(loaded);
    await Promise.resolve();
    expect(loaded).not.toHaveBeenCalled();
    await tracked;
    expect(keys).toEqual(['account:0x01', 'account:0x02', 'keyring']);

    answerLater(() => undefined, 'read unavailable');
    store.all(vi.fn());
    await expect(store.allLoaded).rejects.toThrow('read unavailable');
  });

  it('exposes the latest TON read so start-up can wait for it or read again', async () => {
    answerLater(() => undefined, 'read unavailable');
    const failed = tonStore.all(vi.fn());
    expect(tonStore.loaded).toBe(failed);
    await expect(tonStore.loaded).rejects.toThrow('read unavailable');

    answerLater(() => ({ 'fw:ton:UQfixture': { name: 'TON', address: 'UQfixture', cipherSeed: 'c', publicKeyHex: '00' } }));
    const accounts: string[] = [];
    const retried = tonStore.all((address) => accounts.push(address));
    expect(tonStore.loaded).toBe(retried);
    await expect(tonStore.loaded).resolves.toBeUndefined();
    expect(accounts).toEqual(['UQfixture']);
  });

  it('never reports a missing master-password record when the read failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    answerLater(() => ({}), 'read unavailable');
    const update = vi.fn();
    new KeyringStore().get(update);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(update).not.toHaveBeenCalled();

    answerLater(() => fixture);
    new KeyringStore().get(update);
    await vi.waitFor(() => expect(update).toHaveBeenCalledWith({ passwordHash: '0xabcdef' }));
  });
});
