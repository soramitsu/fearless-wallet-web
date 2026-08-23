import { StorageWeb } from '@extension-base/stores/StorageWeb';
import { describe, expect, it, vi } from 'vitest';

function createDatabaseHarness() {
  const put = vi.fn();
  const transaction = {
    error: null as Error | null,
    objectStore: vi.fn(() => ({ put })),
    onabort: null as ((event: Event) => void) | null,
    oncomplete: null as ((event: Event) => void) | null,
    onerror: null as ((event: Event) => void) | null,
  };
  const database = {
    transaction: vi.fn(() => transaction),
  };

  return { database, put, transaction };
}

describe('StorageWeb', () => {
  it('resolves set only after the IndexedDB transaction commits', async () => {
    const { database, put, transaction } = createDatabaseHarness();
    const storage = new StorageWeb();
    const settled = vi.fn();

    vi.spyOn(storage, 'openDatabase').mockResolvedValue(database as unknown as IDBDatabase);
    const write = storage.set({ balances: {} });

    void write.then(settled);
    await Promise.resolve();
    expect(put).toHaveBeenCalledOnce();
    expect(settled).not.toHaveBeenCalled();

    transaction.oncomplete?.(new Event('complete'));
    await expect(write).resolves.toBeUndefined();
    expect(settled).toHaveBeenCalledOnce();
  });

  it('rejects set when the IndexedDB transaction fails', async () => {
    const { database, transaction } = createDatabaseHarness();
    const storage = new StorageWeb();
    const error = new Error('disk failure');

    vi.spyOn(storage, 'openDatabase').mockResolvedValue(database as unknown as IDBDatabase);
    const write = storage.set({ balances: {} });

    await Promise.resolve();
    transaction.error = error;
    transaction.onerror?.(new Event('error'));

    await expect(write).rejects.toThrow('disk failure');
  });

  it('rejects get when IndexedDB cannot be opened', async () => {
    const storage = new StorageWeb();

    vi.spyOn(storage, 'openDatabase').mockRejectedValue(new Error('database unavailable'));

    await expect(storage.get(['balances'])).rejects.toThrow('database unavailable');
  });
});
