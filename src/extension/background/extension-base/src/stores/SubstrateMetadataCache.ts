import type { HexString } from '@polkadot/util/types';

/**
 * Runtime metadata of the Substrate networks, saved so that a connection does not download it again (0.3-1.5 MB a
 * network, about 23.5 MB for every network) each time the worker starts or the wallet wakes up.
 *
 * One record per chain, keyed by its genesis hash: saving a newer runtime replaces the older one, so only the latest
 * spec of each chain is kept. Metadata is rebuildable data. It lives in a database of its own, away from the wallet's
 * records, and anything unexpected in it is a miss: the record is deleted and the node's own metadata is used.
 */
export const SUBSTRATE_METADATA_DATABASE_NAME = 'fw-substrate-metadata';
export const SUBSTRATE_METADATA_STORE_NAME = 'runtime-metadata';
const SUBSTRATE_METADATA_DATABASE_VERSION = 1;
const RECORD_FORMAT = 1;

// "meta" followed by the version byte. The wallet's @polkadot/api reads metadata versions 14 to 16.
const METADATA_MAGIC = '0x6d657461';
const METADATA_VERSIONS = new Set([14, 15, 16]);
const MIN_METADATA_HEX_LENGTH = 2 + 2 * 1024;
const MAX_METADATA_HEX_LENGTH = 2 + 2 * 16 * 1024 * 1024;
const GENESIS_HASH = /^0x[0-9a-f]{64}$/;
const HEX_DIGITS = /^0x[0-9a-f]+$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

/** What `new ApiPromise({ metadata })` takes: the metadata of one runtime under `${genesisHash}-${specVersion}`. */
export interface CachedMetadata {
  key: string;
  hex: HexString;
}

export interface SubstrateMetadataRecord {
  format: typeof RECORD_FORMAT;
  genesisHash: string;
  specVersion: number;
  hex: HexString;
  /** SHA-256 of `${key}:${hex}`: a record changed or cut short on disk is never decoded. */
  digest: string;
  savedAt: number;
}

/** Where the records are kept: IndexedDB in the wallet, a Map in the unit tests. */
export interface SubstrateMetadataStorage {
  get(genesisHash: string): Promise<unknown>;
  put(genesisHash: string, record: SubstrateMetadataRecord): Promise<void>;
  delete(genesisHash: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** The key @polkadot/api looks a runtime up by: lower-case genesis hash and decimal spec version. */
export function substrateMetadataKey(genesisHash: string, specVersion: number | string): string {
  return `${genesisHash}-${specVersion}`;
}

/** The chain's genesis hash in the form the records are keyed by, or undefined for anything else. */
export function normalizeGenesisHash(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const hash = (value.startsWith('0x') ? value : `0x${value}`).toLowerCase();

  return GENESIS_HASH.test(hash) ? hash : undefined;
}

/** Metadata the wallet can decode: hex of a supported version, within sane size limits. */
export function isUsableMetadataHex(hex: unknown): hex is HexString {
  if (typeof hex !== 'string' || hex.length < MIN_METADATA_HEX_LENGTH || hex.length > MAX_METADATA_HEX_LENGTH) return false;
  if (hex.length % 2 !== 0 || !hex.startsWith(METADATA_MAGIC) || !HEX_DIGITS.test(hex)) return false;

  return METADATA_VERSIONS.has(Number.parseInt(hex.slice(METADATA_MAGIC.length, METADATA_MAGIC.length + 2), 16));
}

function isSpecVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

async function metadataDigest(key: string, hex: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${key}:${hex}`));

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function recordOf(value: unknown, genesisHash: string): SubstrateMetadataRecord | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as SubstrateMetadataRecord;

  return record.format === RECORD_FORMAT && record.genesisHash === genesisHash && isSpecVersion(record.specVersion) &&
    typeof record.digest === 'string' && SHA256_HEX.test(record.digest) && isUsableMetadataHex(record.hex)
    ? record
    : undefined;
}

export class SubstrateMetadataCache {
  private readonly storage?: SubstrateMetadataStorage;

  /** `storage` defaults to IndexedDB; null keeps nothing. */
  constructor(storage?: SubstrateMetadataStorage | null) {
    this.storage = storage === undefined ? indexedDbMetadataStorage() : storage ?? undefined;
  }

  get enabled(): boolean {
    return !!this.storage && typeof globalThis.crypto?.subtle?.digest === 'function';
  }

  /**
   * The chain's saved runtime, or undefined. A record that is malformed, cut short or does not match its digest is
   * deleted and read as a miss, so the connection downloads the node's metadata as it did before.
   */
  async read(genesisHash: string): Promise<CachedMetadata | undefined> {
    const hash = normalizeGenesisHash(genesisHash);

    if (!hash || !this.enabled) return undefined;

    try {
      const value = await this.storage!.get(hash);

      if (value === undefined) return undefined;
      const record = recordOf(value, hash);
      const key = record && substrateMetadataKey(hash, record.specVersion);

      if (record && key && await metadataDigest(key, record.hex) === record.digest) return { key, hex: record.hex };
      console.warn('[Metadata] Saved runtime metadata is unusable and was removed', hash);
      await this.remove(hash);
    } catch (error) {
      console.warn('[Metadata] Saved runtime metadata could not be read', hash, error);
    }

    return undefined;
  }

  /** Saves the chain's runtime, replacing the one saved before. Returns whether it was saved. */
  async write(genesisHash: string, specVersion: number, hex: string): Promise<boolean> {
    const hash = normalizeGenesisHash(genesisHash);

    if (!hash || !this.enabled || !isSpecVersion(specVersion) || !isUsableMetadataHex(hex)) return false;

    try {
      const key = substrateMetadataKey(hash, specVersion);
      const digest = await metadataDigest(key, hex);

      await this.storage!.put(hash, { format: RECORD_FORMAT, genesisHash: hash, specVersion, hex, digest, savedAt: Date.now() });

      return true;
    } catch (error) {
      console.warn('[Metadata] Runtime metadata could not be saved', hash, error);

      return false;
    }
  }

  async remove(genesisHash: string): Promise<void> {
    const hash = normalizeGenesisHash(genesisHash);

    if (!hash || !this.storage) return;
    await this.storage.delete(hash).catch((error: unknown) => console.warn('[Metadata] Runtime metadata could not be removed', hash, error));
  }

  /** Deletes the records of chains outside `genesisHashes`, such as networks the registry no longer lists. */
  async prune(genesisHashes: Iterable<string>): Promise<number> {
    if (!this.storage) return 0;
    const keep = new Set(Array.from(genesisHashes, normalizeGenesisHash).filter((hash): hash is string => !!hash));

    try {
      const stale = (await this.storage.keys()).filter((key) => !keep.has(key));

      await Promise.all(stale.map((key) => this.storage!.delete(key)));

      return stale.length;
    } catch (error) {
      console.warn('[Metadata] Saved runtime metadata could not be pruned', error);

      return 0;
    }
  }
}

let connection: Promise<IDBDatabase> | undefined;

function openMetadataDatabase(): Promise<IDBDatabase> {
  if (connection) return connection;

  // A failed, closed or superseded connection is forgotten, so the next read opens the database again.
  const forget = () => {
    if (connection === opened) connection = undefined;
  };
  const opened = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(SUBSTRATE_METADATA_DATABASE_NAME, SUBSTRATE_METADATA_DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SUBSTRATE_METADATA_STORE_NAME)) db.createObjectStore(SUBSTRATE_METADATA_STORE_NAME);
    };
    request.onsuccess = () => {
      const db = request.result;

      db.onversionchange = () => {
        forget();
        db.close();
      };
      db.onclose = forget;
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Runtime metadata database could not be opened.'));
    request.onblocked = () => reject(new Error('Runtime metadata database is blocked.'));
  });

  connection = opened;
  opened.catch(forget);

  return opened;
}

async function inStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openMetadataDatabase();

  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(SUBSTRATE_METADATA_STORE_NAME, mode);
    const request = run(transaction.objectStore(SUBSTRATE_METADATA_STORE_NAME));
    const fail = () => reject(transaction.error ?? request.error ?? new Error('Runtime metadata transaction failed.'));

    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = fail;
    transaction.onabort = fail;
  });
}

/** IndexedDB, where the worker or the web wallet has it; undefined (no cache) where it does not. */
export function indexedDbMetadataStorage(): SubstrateMetadataStorage | undefined {
  if (typeof indexedDB === 'undefined') return undefined;

  return {
    get: (genesisHash) => inStore('readonly', (store) => store.get(genesisHash)),
    put: async (genesisHash, record) => { await inStore('readwrite', (store) => store.put(record, genesisHash)); },
    delete: async (genesisHash) => { await inStore('readwrite', (store) => store.delete(genesisHash)); },
    keys: async () => (await inStore('readonly', (store) => store.getAllKeys())).filter((key): key is string => typeof key === 'string'),
  };
}

/** The worker's cache: SubstrateApiHandler reads and saves runtimes, NetworkService prunes retired chains. */
export const substrateMetadataCache = new SubstrateMetadataCache();

/** Test hook: forgets the open database so a test can install another indexedDB. */
export function resetSubstrateMetadataDatabaseForTests(): void {
  connection = undefined;
}
