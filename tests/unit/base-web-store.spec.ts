import BaseWebStore from '@extension-base/stores/BaseWeb';
import { describe, expect, it, vi } from 'vitest';

class TestWebStore extends BaseWebStore<Record<string, unknown>> {}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

describe('BaseWebStore', () => {
  it('loads persisted account entries by their keys, not cursor array indices', async () => {
    const store = new TestWebStore('fw');
    const account = { address: 'public-account', meta: { name: 'Wallet' } };
    vi.spyOn(store, 'getAllItemsWithKeys').mockResolvedValue([
      { key: 'fw:account:public-account', value: account },
      { key: 'unrelated:key', value: { ignored: true } },
    ]);
    const update = vi.fn();
    await store.allMap(update);
    expect(update).toHaveBeenCalledWith({ 'account:public-account': account });
  });
  it('uses the schema initializer when enumerating a fresh database', async () => {
    const store = new TestWebStore('fw');
    const cursor = {} as IDBRequest;
    const transaction = { objectStore: () => ({ openCursor: () => cursor }) };
    const open = vi.spyOn(store, 'openDatabase').mockResolvedValue({
      transaction: () => transaction,
    } as unknown as IDBDatabase);
    const pending = store.getAllItemsWithKeys();
    await Promise.resolve();
    cursor.onsuccess!({ target: { result: null } } as unknown as Event);
    await expect(pending).resolves.toEqual([]);
    expect(open).toHaveBeenCalledOnce();
  });
  it('waits for IndexedDB reads before invoking the store callback', async () => {
    const store = new TestWebStore('test');
    const read = deferred<unknown>();
    const update = vi.fn();

    vi.spyOn(store, 'readFromDB').mockReturnValue(read.promise);
    store.get('authUrls', update);

    expect(store.readFromDB).toHaveBeenCalledWith('test:authUrls');
    expect(update).not.toHaveBeenCalled();

    const value = { dapp: { isAllowed: true } };

    read.resolve(value);
    await vi.waitFor(() => expect(update).toHaveBeenCalledWith(value));
  });
});

function writeHarness() {
  const request = { onsuccess: null as (() => void) | null };
  const transaction = {
    error: null as Error | null,
    oncomplete: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onabort: null as (() => void) | null,
    objectStore: vi.fn(() => ({ put: vi.fn(() => request), delete: vi.fn(() => request) })),
  };
  const database = { transaction: vi.fn(() => transaction) } as unknown as IDBDatabase;
  return { transaction, request, database };
}

describe('BaseWebStore durable mutations', () => {
  it.each(['set', 'remove'] as const)('acknowledges %s only after transaction commit', async (method) => {
    const store = new TestWebStore('fw');
    const open = deferred<IDBDatabase>();
    const { database, transaction, request } = writeHarness();
    vi.spyOn(store, 'openDatabase').mockReturnValue(open.promise);
    const update = vi.fn();
    if (method === 'set') store.set('account:fixture', { name: 'Wallet' }, update);
    else store.remove('account:fixture', update);
    const settled = vi.fn();
    const flush = BaseWebStore.flush().then(settled);
    expect(update).not.toHaveBeenCalled();
    open.resolve(database);
    await vi.waitFor(() => expect(database.transaction).toHaveBeenCalled());
    request.onsuccess?.();
    expect(update).not.toHaveBeenCalled();
    expect(settled).not.toHaveBeenCalled();
    transaction.oncomplete?.();
    await flush;
    expect(update).toHaveBeenCalledOnce();
    expect(settled).toHaveBeenCalledOnce();
  });

  it('serializes mutations across store instances and waits for every commit', async () => {
    const first = new TestWebStore('fw');
    const second = new TestWebStore('other');
    const a = writeHarness();
    const b = writeHarness();
    const openA = vi.spyOn(first, 'openDatabase').mockResolvedValue(a.database);
    const openB = vi.spyOn(second, 'openDatabase').mockResolvedValue(b.database);
    first.set('account:a', { a: 1 });
    second.remove('account:b');
    const settled = vi.fn();
    const flush = BaseWebStore.flush().then(settled);
    await vi.waitFor(() => expect(openA).toHaveBeenCalledOnce());
    expect(openB).not.toHaveBeenCalled();
    a.transaction.oncomplete?.();
    await vi.waitFor(() => expect(b.database.transaction).toHaveBeenCalled());
    expect(settled).not.toHaveBeenCalled();
    b.transaction.oncomplete?.();
    await flush;
    expect(settled).toHaveBeenCalledOnce();
  });

  it('retains an earlier failure until flush and waits for later writes to settle', async () => {
    const store = new TestWebStore('fw');
    const next = writeHarness();
    vi.spyOn(store, 'openDatabase').mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValue(next.database);
    const failedCallback = vi.fn();
    store.set('account:failed', {}, failedCallback);
    store.set('account:next', {});
    const failure = vi.fn();
    const flush = BaseWebStore.flush().catch(failure);
    await vi.waitFor(() => expect(next.database.transaction).toHaveBeenCalled());
    expect(failure).not.toHaveBeenCalled();
    next.transaction.oncomplete?.();
    await flush;
    expect(failure).toHaveBeenCalledWith(expect.objectContaining({ message: 'database unavailable' }));
    expect(failedCallback).not.toHaveBeenCalled();
    await expect(BaseWebStore.flush()).resolves.toBeUndefined();
  });

  it('rejects transaction aborts instead of acknowledging the account change', async () => {
    const store = new TestWebStore('fw');
    const { database, transaction } = writeHarness();
    vi.spyOn(store, 'openDatabase').mockResolvedValue(database);
    const update = vi.fn();
    store.set('account:fixture', {}, update);
    const flush = BaseWebStore.flush();
    const rejected = expect(flush).rejects.toThrow('disk failure');
    await vi.waitFor(() => expect(database.transaction).toHaveBeenCalled());
    transaction.error = new Error('disk failure');
    transaction.onabort?.();
    await rejected;
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects reads when opening IndexedDB fails instead of leaving them pending', async () => {
    const store = new TestWebStore('fw');
    vi.spyOn(store, 'openDatabase').mockRejectedValue(new Error('open failed'));
    await expect(store.getByKey('account:fixture')).rejects.toThrow('open failed');
  });
});

describe('BaseWebStore atomic metadata updates', () => {
  function harness(value: Record<string, unknown> | undefined) {
    const read = { result: value, onsuccess: null as (() => void) | null };
    const put = vi.fn();
    const transaction = {
      error: null as Error | null, oncomplete: null as (() => void) | null,
      onabort: null as (() => void) | null, onerror: null as (() => void) | null,
      objectStore: () => ({ get: () => read, put }), abort: vi.fn(),
    };
    const database = { transaction: vi.fn(() => transaction) } as unknown as IDBDatabase;
    return { database, transaction, read, put };
  }

  it('reads the latest encrypted record after an earlier password write and publishes after commit', async () => {
    const password = new TestWebStore('fw');
    const metadata = new TestWebStore('fw');
    const first = writeHarness();
    const second = harness({ encoded: 'new-password-ciphertext', meta: { name: 'Latest name' }, future: 7 });
    vi.spyOn(password, 'openDatabase').mockResolvedValue(first.database);
    const open = vi.spyOn(metadata, 'openDatabase').mockResolvedValue(second.database);
    password.set('account:a', { encoded: 'new-password-ciphertext' });
    const publish = vi.fn();
    const pending = metadata.updateAndWait('account:a', (current) => current ? {
      ...current, meta: { ...current.meta as object, bitcoinAddress: 'new-public-address' },
    } : undefined, publish);
    await vi.waitFor(() => expect(first.database.transaction).toHaveBeenCalledOnce());
    expect(open).not.toHaveBeenCalled();
    first.transaction.oncomplete?.();
    await vi.waitFor(() => expect(second.database.transaction).toHaveBeenCalledOnce());
    expect(second.database.transaction).toHaveBeenCalledWith('fw-wallet', 'readwrite');
    second.read.onsuccess?.();
    expect(second.put).toHaveBeenCalledWith({ encoded: 'new-password-ciphertext', future: 7,
      meta: { name: 'Latest name', bitcoinAddress: 'new-public-address' } }, 'fw:account:a');
    expect(publish).not.toHaveBeenCalled();
    second.transaction.oncomplete?.();
    await pending;
    await BaseWebStore.flush();
    expect(publish).toHaveBeenCalledOnce();
  });

  it('does not poison the unlock flush or publish optional account fields when a write aborts', async () => {
    const store = new TestWebStore('fw');
    const h = harness({ encoded: 'old-key' });
    vi.spyOn(store, 'openDatabase').mockResolvedValue(h.database);
    const publish = vi.fn();
    const pending = store.updateAndWait('account:a', (current) => current, publish, false);
    const rejected = expect(pending).rejects.toThrow('read-only database');
    await vi.waitFor(() => expect(h.database.transaction).toHaveBeenCalled());
    h.read.onsuccess?.();
    h.transaction.error = new Error('read-only database');
    h.transaction.onabort?.();
    await rejected;
    await expect(BaseWebStore.flush()).resolves.toBeUndefined();
    expect(publish).not.toHaveBeenCalled();
  });

  it('keeps deleted accounts absent and does not publish a skipped mutation', async () => {
    const store = new TestWebStore('fw');
    const h = harness(undefined);
    vi.spyOn(store, 'openDatabase').mockResolvedValue(h.database);
    const publish = vi.fn();
    const pending = store.updateAndWait('account:deleted', (current) => current, publish);
    await vi.waitFor(() => expect(h.database.transaction).toHaveBeenCalled());
    h.read.onsuccess?.();
    h.transaction.oncomplete?.();
    await expect(pending).resolves.toBeUndefined();
    await BaseWebStore.flush();
    expect(h.put).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
