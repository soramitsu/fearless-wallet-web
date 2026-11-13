import { afterEach, describe, expect, it, vi } from 'vitest';
import { Metadata, TypeRegistry } from '@polkadot/types';
import polkadotMetadata from '@polkadot/types-support/metadata/static-polkadot';
import kusamaMetadata from '@polkadot/types-support/metadata/static-kusama';
import {
  indexedDbMetadataStorage,
  isUsableMetadataHex,
  normalizeGenesisHash,
  resetSubstrateMetadataDatabaseForTests,
  SubstrateMetadataCache,
  SUBSTRATE_METADATA_DATABASE_NAME,
  SUBSTRATE_METADATA_STORE_NAME,
  type SubstrateMetadataRecord,
  type SubstrateMetadataStorage,
} from '@extension-base/stores/SubstrateMetadataCache';
import type { HexString } from '@polkadot/util/types';

const POLKADOT = '0x91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3';
const KUSAMA = '0xb0a8d493285c2df73290dfb7e61f870f17b41801197a149ca93654499ea3dafe';

/** The records as IndexedDB keeps them: structured clones, keyed by genesis hash. */
function memoryStorage(records = new Map<string, unknown>()) {
  const storage: SubstrateMetadataStorage & { records: Map<string, unknown> } = {
    records,
    get: vi.fn(async (key: string) => structuredClone(records.get(key))),
    put: vi.fn(async (key: string, record: SubstrateMetadataRecord) => { records.set(key, structuredClone(record)); }),
    delete: vi.fn(async (key: string) => { records.delete(key); }),
    keys: vi.fn(async () => [...records.keys()]),
  };
  return storage;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetSubstrateMetadataDatabaseForTests();
});

describe('Substrate runtime metadata cache', () => {
  it('misses for a chain with nothing saved', async () => {
    const storage = memoryStorage();
    const cache = new SubstrateMetadataCache(storage);

    await expect(cache.read(POLKADOT)).resolves.toBeUndefined();
    expect(storage.get).toHaveBeenCalledWith(POLKADOT);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('hits with the saved runtime under the key @polkadot/api looks it up by', async () => {
    const storage = memoryStorage();
    const cache = new SubstrateMetadataCache(storage);

    await expect(cache.write(POLKADOT, 1002005, polkadotMetadata)).resolves.toBe(true);
    const cached = await cache.read(POLKADOT);

    expect(cached).toEqual({ key: `${POLKADOT}-1002005`, hex: polkadotMetadata });
    // What is read back decodes to the runtime that was saved.
    expect(new Metadata(new TypeRegistry(), cached!.hex).toHex()).toBe(polkadotMetadata);
    expect(storage.records.get(POLKADOT)).toMatchObject({ format: 1, genesisHash: POLKADOT, specVersion: 1002005 });
  });

  it('keeps only the latest spec of a chain: an upgraded runtime replaces the old one', async () => {
    const storage = memoryStorage();
    const cache = new SubstrateMetadataCache(storage);

    await cache.write(POLKADOT, 1002005, polkadotMetadata);
    await cache.write(KUSAMA, 9430, kusamaMetadata);
    await cache.write(POLKADOT, 1003000, kusamaMetadata);

    expect([...storage.records.keys()].sort()).toEqual([POLKADOT, KUSAMA].sort());
    await expect(cache.read(POLKADOT)).resolves.toEqual({ key: `${POLKADOT}-1003000`, hex: kusamaMetadata });
    await expect(cache.read(KUSAMA)).resolves.toEqual({ key: `${KUSAMA}-9430`, hex: kusamaMetadata });
  });

  it('removes a record changed on disk and reads it as a miss', async () => {
    const storage = memoryStorage();
    const cache = new SubstrateMetadataCache(storage);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await cache.write(POLKADOT, 1002005, polkadotMetadata);
    const saved = storage.records.get(POLKADOT) as SubstrateMetadataRecord;
    // One digit of the metadata flipped: still well-formed hex of a supported version, but not what was saved.
    const index = 4000;
    const flipped = `${saved.hex.slice(0, index)}${saved.hex[index] === '0' ? '1' : '0'}${saved.hex.slice(index + 1)}` as HexString;
    storage.records.set(POLKADOT, { ...saved, hex: flipped });

    await expect(cache.read(POLKADOT)).resolves.toBeUndefined();
    expect(storage.records.has(POLKADOT)).toBe(false);
  });

  it.each([
    ['cut short', (record: SubstrateMetadataRecord) => ({ ...record, hex: record.hex.slice(0, 5000) })],
    ['claimed for another spec', (record: SubstrateMetadataRecord) => ({ ...record, specVersion: record.specVersion + 1 })],
    ['saved under another chain', (record: SubstrateMetadataRecord) => ({ ...record, genesisHash: KUSAMA })],
    ['not metadata', (record: SubstrateMetadataRecord) => ({ ...record, hex: `0x00000000${record.hex.slice(10)}` })],
    ['an unsupported metadata version', (record: SubstrateMetadataRecord) => ({ ...record, hex: `0x6d6574610d${record.hex.slice(12)}` })],
    ['an odd-length hex', (record: SubstrateMetadataRecord) => ({ ...record, hex: `${record.hex}0` })],
    ['an unknown record format', (record: SubstrateMetadataRecord) => ({ ...record, format: 2 })],
    ['missing its digest', (record: SubstrateMetadataRecord) => ({ ...record, digest: undefined })],
    ['a spec version that is not a number', (record: SubstrateMetadataRecord) => ({ ...record, specVersion: '1002005' })],
    ['a string', () => 'metadata'],
    ['null', () => null],
  ])('removes a corrupt record (%s) and reads it as a miss', async (_case, corrupt) => {
    const storage = memoryStorage();
    const cache = new SubstrateMetadataCache(storage);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await cache.write(POLKADOT, 1002005, polkadotMetadata);
    storage.records.set(POLKADOT, corrupt(storage.records.get(POLKADOT) as SubstrateMetadataRecord));

    await expect(cache.read(POLKADOT)).resolves.toBeUndefined();
    expect(storage.delete).toHaveBeenCalledWith(POLKADOT);
    expect(storage.records.has(POLKADOT)).toBe(false);
  });

  /** The record as if it had been saved that way: its digest matches, so only the checks of its content can refuse it. */
  async function resigned(record: SubstrateMetadataRecord, hex: string): Promise<SubstrateMetadataRecord> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${record.genesisHash}-${record.specVersion}:${hex}`));
    return { ...record, hex: hex as HexString, digest: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('') };
  }

  it.each([
    ['an unsupported metadata version', (hex: string) => `0x6d6574610d${hex.slice(12)}`],
    ['no metadata magic', (hex: string) => `0x00000000${hex.slice(10)}`],
    ['an odd length', (hex: string) => `${hex}0`],
    ['characters that are not hex', (hex: string) => `${hex.slice(0, -2)}zz`],
    ['upper-case hex', (hex: string) => `0x${hex.slice(2).toUpperCase()}`],
    ['too little metadata to be a runtime', (hex: string) => hex.slice(0, 1000)],
  ])('refuses a record whose digest matches but whose metadata has %s', async (_case, alter) => {
    const storage = memoryStorage();
    const cache = new SubstrateMetadataCache(storage);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await cache.write(POLKADOT, 1002005, polkadotMetadata);
    const saved = storage.records.get(POLKADOT) as SubstrateMetadataRecord;
    storage.records.set(POLKADOT, await resigned(saved, alter(saved.hex)));

    await expect(cache.read(POLKADOT)).resolves.toBeUndefined();
    expect(storage.records.has(POLKADOT)).toBe(false);
    // The same metadata is refused when saving.
    await expect(cache.write(POLKADOT, 1002005, alter(polkadotMetadata))).resolves.toBe(false);
  });

  it('reads a miss, without throwing, when its storage fails', async () => {
    const storage = memoryStorage();
    const cache = new SubstrateMetadataCache(storage);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(storage.get).mockRejectedValueOnce(new Error('disk unavailable'));
    vi.mocked(storage.put).mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'));

    await expect(cache.read(POLKADOT)).resolves.toBeUndefined();
    await expect(cache.write(POLKADOT, 1002005, polkadotMetadata)).resolves.toBe(false);
    expect(storage.records.size).toBe(0);
  });

  it('saves nothing it could not read back', async () => {
    const storage = memoryStorage();
    const cache = new SubstrateMetadataCache(storage);

    await expect(cache.write('0x1234', 1, polkadotMetadata)).resolves.toBe(false);
    await expect(cache.write(POLKADOT, -1, polkadotMetadata)).resolves.toBe(false);
    await expect(cache.write(POLKADOT, 1.5, polkadotMetadata)).resolves.toBe(false);
    await expect(cache.write(POLKADOT, 1, '0x6d6574610e00')).resolves.toBe(false);
    await expect(cache.write(POLKADOT, 1, polkadotMetadata.toUpperCase())).resolves.toBe(false);
    await expect(cache.read('0x1234')).resolves.toBeUndefined();
    expect(storage.put).not.toHaveBeenCalled();
    expect(storage.get).not.toHaveBeenCalled();
  });

  it('is off where the wallet has no IndexedDB or no Web Crypto digest', async () => {
    vi.stubGlobal('indexedDB', undefined);
    expect(new SubstrateMetadataCache().enabled).toBe(false);
    await expect(new SubstrateMetadataCache().read(POLKADOT)).resolves.toBeUndefined();
    await expect(new SubstrateMetadataCache().write(POLKADOT, 1, polkadotMetadata)).resolves.toBe(false);

    const storage = memoryStorage();
    vi.stubGlobal('crypto', {});
    expect(new SubstrateMetadataCache(storage).enabled).toBe(false);
    await expect(new SubstrateMetadataCache(storage).write(POLKADOT, 1, polkadotMetadata)).resolves.toBe(false);
  });

  it('prunes the chains no longer listed and keeps the others', async () => {
    const storage = memoryStorage();
    const cache = new SubstrateMetadataCache(storage);

    await cache.write(POLKADOT, 1002005, polkadotMetadata);
    await cache.write(KUSAMA, 9430, kusamaMetadata);

    await expect(cache.prune([POLKADOT.toUpperCase().replace('0X', '0x'), 'not a hash'])).resolves.toBe(1);
    expect([...storage.records.keys()]).toEqual([POLKADOT]);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(storage.keys).mockRejectedValueOnce(new Error('disk unavailable'));
    await expect(cache.prune([])).resolves.toBe(0);
  });

  it('keys chains by lower-case genesis hash', () => {
    expect(normalizeGenesisHash(POLKADOT.slice(2).toUpperCase())).toBe(POLKADOT);
    expect(normalizeGenesisHash(POLKADOT)).toBe(POLKADOT);
    expect(normalizeGenesisHash('0x1234')).toBeUndefined();
    expect(normalizeGenesisHash(1)).toBeUndefined();
    expect(isUsableMetadataHex(polkadotMetadata)).toBe(true);
    expect(isUsableMetadataHex(kusamaMetadata)).toBe(true);
    expect(isUsableMetadataHex('0x6d657461')).toBe(false);
  });
});

/** Enough of IndexedDB for one database of plain key-value stores. */
function fakeIndexedDb({ failOpen = false } = {}) {
  const stores = new Map<string, Map<IDBValidKey, unknown>>();
  let version = 0;
  const opened: Array<IDBDatabase & { close: ReturnType<typeof vi.fn> }> = [];
  const later = (callback: () => void) => setTimeout(callback, 0);
  const open = vi.fn((name: string, requested: number) => {
    expect(name).toBe(SUBSTRATE_METADATA_DATABASE_NAME);
    const request = {} as IDBOpenDBRequest & { result: IDBDatabase; error: DOMException | null };
    const db = {
      get version() { return version; },
      objectStoreNames: { contains: (store: string) => stores.has(store) },
      createObjectStore: vi.fn((store: string) => stores.set(store, new Map())),
      close: vi.fn(),
      onversionchange: null,
      onclose: null,
      transaction: (storeName: string) => {
        const transaction = { error: null } as unknown as IDBTransaction;
        const records = stores.get(storeName)!;
        const run = <T>(operation: () => T) => {
          const result = {} as IDBRequest<T>;
          later(() => {
            Object.defineProperty(result, 'result', { value: operation() });
            transaction.oncomplete?.({} as Event);
          });
          return result;
        };
        Object.assign(transaction, {
          objectStore: () => ({
            get: (key: IDBValidKey) => run(() => structuredClone(records.get(key))),
            put: (value: unknown, key: IDBValidKey) => run(() => { records.set(key, structuredClone(value)); return key; }),
            delete: (key: IDBValidKey) => run(() => { records.delete(key); }),
            getAllKeys: () => run(() => [...records.keys(), 42]),
          }),
        });
        return transaction;
      },
    } as unknown as IDBDatabase & { close: ReturnType<typeof vi.fn> };
    opened.push(db);
    later(() => {
      if (failOpen) {
        Object.defineProperty(request, 'error', { value: new DOMException('denied', 'UnknownError') });
        request.onerror?.({} as Event);
        return;
      }
      Object.defineProperty(request, 'result', { value: db });
      if (requested > version) {
        version = requested;
        request.onupgradeneeded?.({} as IDBVersionChangeEvent);
      }
      request.onsuccess?.({} as Event);
    });
    return request;
  });
  vi.stubGlobal('indexedDB', { open });
  return { open, opened, stores };
}

describe('Substrate runtime metadata in IndexedDB', () => {
  it('keeps records in a database of its own, opened once', async () => {
    const fake = fakeIndexedDb();
    const cache = new SubstrateMetadataCache(indexedDbMetadataStorage());

    await expect(cache.write(POLKADOT, 1002005, polkadotMetadata)).resolves.toBe(true);
    await expect(cache.read(POLKADOT)).resolves.toEqual({ key: `${POLKADOT}-1002005`, hex: polkadotMetadata });
    await expect(cache.read(KUSAMA)).resolves.toBeUndefined();
    expect(fake.open).toHaveBeenCalledTimes(1);
    expect([...fake.stores.keys()]).toEqual([SUBSTRATE_METADATA_STORE_NAME]);
    expect([...fake.stores.get(SUBSTRATE_METADATA_STORE_NAME)!.keys()]).toEqual([POLKADOT]);

    await expect(cache.prune([])).resolves.toBe(1);
    expect(fake.stores.get(SUBSTRATE_METADATA_STORE_NAME)!.size).toBe(0);
  });

  it('opens the database again after another context upgrades it', async () => {
    const fake = fakeIndexedDb();
    const cache = new SubstrateMetadataCache(indexedDbMetadataStorage());

    await cache.write(POLKADOT, 1002005, polkadotMetadata);
    fake.opened[0].onversionchange?.({} as IDBVersionChangeEvent);
    expect(fake.opened[0].close).toHaveBeenCalled();
    await expect(cache.read(POLKADOT)).resolves.toMatchObject({ key: `${POLKADOT}-1002005` });
    expect(fake.open).toHaveBeenCalledTimes(2);
  });

  it('reads a miss when the database cannot be opened, and tries again next time', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failing = fakeIndexedDb({ failOpen: true });
    const cache = new SubstrateMetadataCache(indexedDbMetadataStorage());

    await expect(cache.read(POLKADOT)).resolves.toBeUndefined();
    await expect(cache.read(POLKADOT)).resolves.toBeUndefined();
    expect(failing.open).toHaveBeenCalledTimes(2);
  });

  it('has no storage where indexedDB is missing', () => {
    vi.stubGlobal('indexedDB', undefined);
    expect(indexedDbMetadataStorage()).toBeUndefined();
  });
});
