import { afterEach, describe, expect, it, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/bootstrap/webPasswordStore', () => ({ requestWebPasswordStorage: request }));
afterEach(() => { vi.resetModules(); request.mockReset(); });

describe('encrypted password record persistence', () => {
  it('serializes overlapping mutations and flushes every queued write', async () => {
    const { default: Store } = await import('@extension-base/stores/KeyringStoreWeb');
    let finish!: () => void;
    request.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; })).mockResolvedValue(null);
    const store = new Store();
    const written = vi.fn();
    const removed = vi.fn();
    store.set({} as never, written);
    store.remove(removed);
    let flushed = false;
    const flush = Store.flush().then(() => { flushed = true; });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request).toHaveBeenLastCalledWith('set', '{}');
    expect(flushed).toBe(false);
    expect(written).not.toHaveBeenCalled();
    finish();
    await flush;
    expect(request.mock.calls.map(([operation]) => operation)).toEqual(['set', 'remove']);
    expect(written).toHaveBeenCalledOnce();
    expect(removed).toHaveBeenCalledOnce();
    const read = vi.fn();
    store.get(read);
    expect(read).toHaveBeenCalledWith(null);
  });

  it('reports a failed batch and allows a subsequent retry', async () => {
    const { default: Store } = await import('@extension-base/stores/KeyringStoreWeb');
    request.mockRejectedValueOnce(new Error('Storage unavailable')).mockResolvedValue(null);
    const store = new Store();
    const saved = vi.fn();
    store.set({} as never, saved);
    await expect(Store.flush()).rejects.toThrow('Storage unavailable');
    expect(saved).not.toHaveBeenCalled();
    store.set({} as never, saved);
    await Store.flush();
    expect(saved).toHaveBeenCalledOnce();
  });
});
