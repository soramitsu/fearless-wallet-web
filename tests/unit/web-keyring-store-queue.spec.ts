import { afterEach, describe, expect, it, vi } from 'vitest';
const { request, write, readRecords, removeDB } = vi.hoisted(() => ({ request: vi.fn(), write: vi.fn(), readRecords: vi.fn(), removeDB: vi.fn() }));
vi.mock('@/bootstrap/webPasswordStore', () => ({ requestWebPasswordStorage: request }));
vi.mock('@extension-base/stores/WalletStorage', () => ({ PASSWORD_STORAGE_KEY: 'fw:keyring', writeWalletRecords: write, readWalletRecords: readRecords }));
vi.mock('@extension-base/stores/BaseWeb', () => ({ default: class { removeFromDB = removeDB; } }));
afterEach(() => { vi.resetModules(); vi.resetAllMocks(); });

describe('encrypted password record persistence', () => {
  it('serializes overlapping mutations and flushes every queued write', async () => {
    const { default: Store } = await import('@extension-base/stores/KeyringStoreWeb');
    let finish!: () => void;
    write.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; })).mockResolvedValue(null);
    request.mockResolvedValue(null);
    removeDB.mockResolvedValue(undefined);
    const store = new Store();
    const written = vi.fn();
    const removed = vi.fn();
    store.set({} as never, written);
    store.remove(removed);
    let flushed = false;
    const flush = Store.flush().then(() => { flushed = true; });
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write).toHaveBeenLastCalledWith({ 'fw:keyring': {} });
    expect(flushed).toBe(false);
    expect(written).not.toHaveBeenCalled();
    finish();
    await flush;
    expect(removeDB).toHaveBeenCalledExactlyOnceWith('fw:keyring');
    expect(request).toHaveBeenCalledExactlyOnceWith('remove');
    expect(written).toHaveBeenCalledOnce();
    expect(removed).toHaveBeenCalledOnce();
    const read = vi.fn();
    store.get(read);
    expect(read).toHaveBeenCalledWith(null);
  });

  it('reports a failed batch and allows a subsequent retry', async () => {
    const { default: Store } = await import('@extension-base/stores/KeyringStoreWeb');
    write.mockRejectedValueOnce(new Error('Storage unavailable')).mockResolvedValue(null);
    const store = new Store();
    const saved = vi.fn();
    store.set({} as never, saved);
    await expect(Store.flush()).rejects.toThrow('Storage unavailable');
    expect(saved).not.toHaveBeenCalled();
    store.set({} as never, saved);
    await Store.flush();
    expect(saved).toHaveBeenCalledOnce();
  });
  it('initializes from the authoritative durable verifier and updates cache only after commit', async () => {
    const { default: Store } = await import('@extension-base/stores/KeyringStoreWeb');
    const password = { passwordHash: 'durable fixture hash' };
    readRecords.mockResolvedValue({ 'fw:keyring': password });
    await Store.initialize();
    const read = vi.fn();
    new Store().get(read);
    expect(read).toHaveBeenCalledWith(password);
    const replacement = { passwordHash: 'atomically committed fixture hash' };
    Store.applyCommittedPassword(replacement);
    new Store().get(read);
    expect(read).toHaveBeenLastCalledWith(replacement);
    expect(request).not.toHaveBeenCalled();
  });

});
