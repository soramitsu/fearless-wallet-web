import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mockChrome = vi.hoisted(() => ({
  runtime: { lastError: undefined as undefined | { message: string } },
  storage: { local: { set: vi.fn(), get: vi.fn(), remove: vi.fn() } },
}));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: mockChrome }));
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import KeyringStore from '@extension-base/stores/KeyringStore';
class TestStore extends BaseExtensionStore<{ encoded: string }> {}

beforeEach(() => { vi.clearAllMocks(); mockChrome.runtime.lastError = undefined; });
afterEach(async () => { await BaseExtensionStore.flush().catch(() => {}); });
describe('legacy extension migration storage', () => {
  it('waits for Chrome acknowledgement and propagates failure without losing retry', async () => {
    let callback!: () => void;
    mockChrome.storage.local.set.mockImplementation((_value, done) => { callback = done; });
    const store = new TestStore('fw');
    const finished = vi.fn();
    const failed = store.setAndWait('account:fixture', { encoded: 'synthetic-new-ciphertext' }).then(finished);
    const rejected = expect(failed).rejects.toThrow('quota exceeded');
    expect(finished).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(mockChrome.storage.local.set).toHaveBeenCalledTimes(1));
    mockChrome.runtime.lastError = { message: 'quota exceeded' };
    callback();
    await rejected;
    mockChrome.runtime.lastError = undefined;
    const retry = store.setAndWait('account:fixture', { encoded: 'synthetic-new-ciphertext' });
    await vi.waitFor(() => expect(mockChrome.storage.local.set).toHaveBeenCalledTimes(2));
    callback();
    await expect(retry).resolves.toBeUndefined();
    expect(mockChrome.storage.local.set).toHaveBeenLastCalledWith({ 'fw:account:fixture': { encoded: 'synthetic-new-ciphertext' } }, expect.any(Function));
  });

  it('serializes metadata read/commit/publication with password changes across store instances', async () => {
    let record = { encoded: 'old-password' };
    let finish!: () => void;
    mockChrome.storage.local.set.mockImplementation((values, done) => {
      finish = () => { record = values['fw:account:fixture']; done(); };
    });
    mockChrome.storage.local.get.mockImplementation((_keys, done) => done({ 'fw:account:fixture': record }));
    const first = new TestStore('fw');
    const second = new TestStore('fw');
    const password = first.setAndWait('account:fixture', { encoded: 'new-password' });
    const published = vi.fn();
    const metadata = second.updateAndWait('account:fixture', (current) => current ? { ...current, name: 'Renamed' } : undefined, published);
    await vi.waitFor(() => expect(mockChrome.storage.local.set).toHaveBeenCalledTimes(1));
    expect(mockChrome.storage.local.get).not.toHaveBeenCalled();
    finish();
    await password;
    await vi.waitFor(() => expect(mockChrome.storage.local.set).toHaveBeenCalledTimes(2));
    expect(published).not.toHaveBeenCalled();
    finish();
    await metadata;
    await BaseExtensionStore.flush();
    expect(record).toEqual({ encoded: 'new-password', name: 'Renamed' });
    expect(published).toHaveBeenCalledWith(record);
  });

  it('rejects failed metadata reads without writing or publishing an empty replacement', async () => {
    mockChrome.storage.local.get.mockImplementation((_keys, done) => {
      mockChrome.runtime.lastError = { message: 'read unavailable' };
      done({});
      mockChrome.runtime.lastError = undefined;
    });
    const published = vi.fn();
    await expect(new TestStore('fw').updateAndWait('account:fixture', (current) => current, published)).rejects.toThrow('read unavailable');
    expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
    expect(published).not.toHaveBeenCalled();
  });

  it('flushes queued password and account writes before acknowledging the handler', async () => {
    const callbacks: (() => void)[] = [];
    mockChrome.storage.local.set.mockImplementation((_values, done) => callbacks.push(done));
    const passwordSaved = vi.fn();
    const accountSaved = vi.fn();
    new KeyringStore().set({ encoded: 'new-password-fixture' } as never, passwordSaved);
    new TestStore('fw').set('account:fixture', { encoded: 'new-account-fixture' }, accountSaved);
    const flushed = vi.fn();
    const pending = BaseExtensionStore.flush().then(flushed);
    await vi.waitFor(() => expect(callbacks).toHaveLength(1));
    expect(flushed).not.toHaveBeenCalled();
    callbacks[0]();
    await vi.waitFor(() => expect(callbacks).toHaveLength(2));
    expect(passwordSaved).toHaveBeenCalledOnce();
    expect(accountSaved).not.toHaveBeenCalled();
    expect(flushed).not.toHaveBeenCalled();
    callbacks[1]();
    await pending;
    expect(accountSaved).toHaveBeenCalledOnce();
    expect(flushed).toHaveBeenCalledOnce();
  });

  it('reports password storage failure through flush and permits a subsequent retry', async () => {
    mockChrome.storage.local.set.mockImplementationOnce((_values, done) => {
      mockChrome.runtime.lastError = { message: 'password storage unavailable' };
      done();
      mockChrome.runtime.lastError = undefined;
    }).mockImplementation((_values, done) => done());
    const saved = vi.fn();
    const passwordStore = new KeyringStore();
    passwordStore.set({ encoded: 'synthetic-password' } as never, saved);
    await expect(BaseExtensionStore.flush()).rejects.toThrow('password storage unavailable');
    expect(saved).not.toHaveBeenCalled();
    passwordStore.set({ encoded: 'synthetic-password' } as never, saved);
    await expect(BaseExtensionStore.flush()).resolves.toBeUndefined();
    expect(saved).toHaveBeenCalledOnce();
  });
});
