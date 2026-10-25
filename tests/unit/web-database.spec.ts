import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

function databaseHarness(initialVersion: number, initialStores: Record<string, Map<string, unknown>>) {
  let version = initialVersion;
  const stores = new Map(Object.entries(initialStores));
  const versions: (number | undefined)[] = [];
  const databases: IDBDatabase[] = [];
  const open = vi.fn((_name: string, requested?: number) => {
    versions.push(requested);
    const request = {} as IDBOpenDBRequest;
    const database = {
      get version() { return version; },
      objectStoreNames: { contains: (name: string) => stores.has(name) },
      createObjectStore: vi.fn((name: string) => stores.set(name, new Map())),
      close: vi.fn(),
      onversionchange: null,
    } as unknown as IDBDatabase;
    databases.push(database);
    queueMicrotask(() => {
      Object.defineProperty(request, 'result', { value: database });
      const nextVersion = requested ?? (version || 1);
      if (nextVersion > version) {
        version = nextVersion;
        request.onupgradeneeded?.({ target: request } as unknown as IDBVersionChangeEvent);
      }
      request.onsuccess?.({ target: request } as unknown as Event);
    });
    return request;
  });
  vi.stubGlobal('indexedDB', { open });
  return { stores, versions, databases, open };
}

describe('shared web wallet database schema', () => {
  it('creates the store on a fresh origin', async () => {
    const fixture = databaseHarness(0, {});
    const { openWebDatabase } = await import('@extension-base/stores/WebDatabase');
    const db = await openWebDatabase();
    expect(db.version).toBe(1);
    expect(fixture.stores.has('fw-wallet')).toBe(true);
    expect(fixture.versions).toEqual([undefined]);
  });

  it('keeps an existing healthy version and every stored record unchanged', async () => {
    const record = { encrypted: 'existing-account-fixture' };
    const values = new Map([['fw:account:fixture', record]]);
    const fixture = databaseHarness(1, { 'fw-wallet': values });
    const { openWebDatabase } = await import('@extension-base/stores/WebDatabase');
    const db = await openWebDatabase();
    expect(db.version).toBe(1);
    expect(fixture.versions).toEqual([undefined]);
    expect(values.get('fw:account:fixture')).toBe(record);
    expect(db.createObjectStore).not.toHaveBeenCalled();
  });

  it('repairs the old schema-less version 1 without removing unrelated stores or records', async () => {
    const values = new Map([['keep', 'original']]);
    const fixture = databaseHarness(1, { unrelated: values });
    const [{ default: BaseWebStore }, { StorageWeb }] = await Promise.all([
      import('@extension-base/stores/BaseWeb'), import('@extension-base/stores/StorageWeb'),
    ]);
    class Accounts extends BaseWebStore<Record<string, unknown>> {}
    const [accounts, state] = await Promise.all([new Accounts('fw').openDatabase(), new StorageWeb().openDatabase()]);
    expect(accounts).toBe(state);
    expect(accounts.version).toBe(2);
    expect(fixture.versions).toEqual([undefined, 2]);
    expect(fixture.databases[0].close).toHaveBeenCalledOnce();
    expect(fixture.stores.has('fw-wallet')).toBe(true);
    expect(fixture.stores.get('unrelated')).toBe(values);
    expect(values.get('keep')).toBe('original');
  });

  it('closes a cached connection for another context upgrade and reopens the current version', async () => {
    const fixture = databaseHarness(2, { 'fw-wallet': new Map() });
    const { openWebDatabase } = await import('@extension-base/stores/WebDatabase');
    const first = await openWebDatabase();
    first.onversionchange?.({} as IDBVersionChangeEvent);
    expect(first.close).toHaveBeenCalledOnce();
    expect(await openWebDatabase()).not.toBe(first);
    expect(fixture.versions).toEqual([undefined, undefined]);
  });

  it('reports a blocked upgrade and permits a later retry', async () => {
    const requests: IDBOpenDBRequest[] = [];
    vi.stubGlobal('indexedDB', { open: vi.fn(() => { const request = {} as IDBOpenDBRequest; requests.push(request); return request; }) });
    const { openWebDatabase } = await import('@extension-base/stores/WebDatabase');
    const first = openWebDatabase();
    const rejected = expect(first).rejects.toThrow('Close other wallet windows');
    requests[0].onblocked?.({} as IDBVersionChangeEvent);
    await rejected;
    const next = openWebDatabase();
    const db = { objectStoreNames: { contains: () => true }, close: vi.fn() } as unknown as IDBDatabase;
    Object.defineProperty(requests[1], 'result', { value: db });
    requests[1].onsuccess?.({} as Event);
    await expect(next).resolves.toBe(db);
    const abandoned = { close: vi.fn() } as unknown as IDBDatabase;
    Object.defineProperty(requests[0], 'result', { value: abandoned });
    requests[0].onsuccess?.({} as Event);
    expect(abandoned.close).toHaveBeenCalledOnce();
  });

  it('reopens the newer schema when another context completes the upgrade first', async () => {
    const requests: IDBOpenDBRequest[] = [];
    const versions: (number | undefined)[] = [];
    vi.stubGlobal('indexedDB', { open: vi.fn((_name: string, version?: number) => {
      versions.push(version);
      const request = {} as IDBOpenDBRequest;
      requests.push(request);
      return request;
    }) });
    const { openWebDatabase } = await import('@extension-base/stores/WebDatabase');
    const pending = openWebDatabase();
    const malformed = { version: 1, objectStoreNames: { contains: () => false }, close: vi.fn() } as unknown as IDBDatabase;
    Object.defineProperty(requests[0], 'result', { value: malformed });
    requests[0].onsuccess?.({} as Event);
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    Object.defineProperty(requests[1], 'error', { value: new DOMException('Newer version exists', 'VersionError') });
    requests[1].onerror?.({} as Event);
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    const repaired = { version: 3, objectStoreNames: { contains: () => true }, close: vi.fn() } as unknown as IDBDatabase;
    Object.defineProperty(requests[2], 'result', { value: repaired });
    requests[2].onsuccess?.({} as Event);
    await expect(pending).resolves.toBe(repaired);
    expect(versions).toEqual([undefined, 2, undefined]);
  });
});
