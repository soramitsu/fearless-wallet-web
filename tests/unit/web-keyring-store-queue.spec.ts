import { afterEach, describe, expect, it, vi } from 'vitest';
afterEach(() => { vi.resetModules(); vi.restoreAllMocks(); });
async function writeSpy() {
  const { default: BaseWebStore } = await import('@extension-base/stores/BaseWeb');
  return vi.spyOn(BaseWebStore.prototype, 'replaceAndWait');
}

describe('encrypted password record persistence', () => {
  it('serializes overlapping mutations and flushes every queued write', async () => {
    const { default: Store } = await import('@extension-base/stores/KeyringStoreWeb');
    const request = await writeSpy();
    let finish!: () => void;
    request.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; })).mockResolvedValue(undefined);
    const store = new Store();
    const written = vi.fn();
    const removed = vi.fn();
    store.set({ passwordHash: 'public-first-hash' }, written);
    store.remove(removed);
    let flushed = false;
    const flush = Store.flush().then(() => { flushed = true; });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request).toHaveBeenLastCalledWith({ webPasswordRecord: { version: 1, serialized: '{"passwordHash":"public-first-hash"}' } }, [], false);
    expect(flushed).toBe(false);
    expect(written).not.toHaveBeenCalled();
    finish();
    await flush;
    expect(request.mock.calls.map(([records]) => records.webPasswordRecord)).toEqual([
      { version: 1, serialized: '{"passwordHash":"public-first-hash"}' }, { version: 1, serialized: null },
    ]);
    expect(written).toHaveBeenCalledOnce();
    expect(removed).toHaveBeenCalledOnce();
    const read = vi.fn();
    store.get(read);
    expect(read).toHaveBeenCalledWith(null);
  });

  it('reports a failed batch and allows a subsequent retry', async () => {
    const { default: Store } = await import('@extension-base/stores/KeyringStoreWeb');
    const request = await writeSpy();
    request.mockRejectedValueOnce(new Error('Storage unavailable')).mockResolvedValue(undefined);
    const store = new Store();
    const saved = vi.fn();
    store.set({ passwordHash: 'public-retried-hash' }, saved);
    await expect(Store.flush()).rejects.toThrow('Storage unavailable');
    expect(saved).not.toHaveBeenCalled();
    store.set({ passwordHash: 'public-retried-hash' }, saved);
    await Store.flush();
    expect(saved).toHaveBeenCalledOnce();
  });
});
