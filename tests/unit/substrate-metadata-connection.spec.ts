import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import polkadotMetadata from '@polkadot/types-support/metadata/static-polkadot';
import kusamaMetadata from '@polkadot/types-support/metadata/static-kusama';
import {
  METADATA_SAVE_DELAY_MS,
  SubstrateApiHandler,
} from '@extension-base/services/network-service/handlers/SubstrateApiHandler';
import {
  SubstrateMetadataCache,
  type SubstrateMetadataRecord,
  type SubstrateMetadataStorage,
} from '@extension-base/stores/SubstrateMetadataCache';
import type { NetworkJson } from '@extension-base/types';
import { SORA_NETWORK_NAME } from '@/consts/sora';

const GENESIS = '0x91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3';

type Listener = (value?: unknown) => void;

const io = vi.hoisted(() => ({
  apis: [] as Array<{
    options: { metadata?: Record<string, string> };
    emit(event: string, value?: unknown): void;
    chain: { genesisHash: string; specVersion: number; hex: string };
    disconnect: ReturnType<typeof vi.fn>;
    runtimeMetadata: { toHex: ReturnType<typeof vi.fn> };
  }>,
  // What the node the next connection reaches reports.
  chain: { genesisHash: '', specVersion: 0, hex: '' },
}));

vi.mock('@polkadot/rpc-provider', () => ({
  WsProvider: class {
    disconnect = vi.fn().mockResolvedValue(undefined);
  },
}));
vi.mock('@polkadot/api', () => ({
  ApiPromise: class {
    private readonly listeners = new Map<string, Listener[]>();
    readonly chain = { ...io.chain };
    readonly isReadyOrError = new Promise(() => undefined);
    readonly disconnect = vi.fn().mockResolvedValue(undefined);
    readonly genesisHash = { toHex: () => this.chain.genesisHash };
    readonly runtimeVersion = { specVersion: { toNumber: () => this.chain.specVersion } };
    readonly runtimeMetadata = { toHex: vi.fn(() => this.chain.hex) };
    constructor(readonly options: { metadata?: Record<string, string> }) { io.apis.push(this as never); }
    on(event: string, listener: Listener) {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
      return this;
    }
    emit(event: string, value?: unknown) { this.listeners.get(event)?.forEach((listener) => listener(value)); }
  },
}));
// The SORA handler holds its connection itself; this one opens it as createConnection does, with the options given.
vi.mock('@extension-base/services/network-service/handlers/SoraApiHandler', async () => {
  const { ApiPromise } = await import('@polkadot/api');
  type Api = { on(event: string, listener: Listener): unknown };
  return { SoraApiHandler: class {
    static current?: Api;
    static initApi(_endpoint: string, listeners: Array<[string, Listener]>, _chainId?: string, metadata?: Record<string, string>) {
      const api = new (ApiPromise as unknown as new (options: object) => Api)(metadata ? { metadata } : {});
      listeners.forEach(([event, listener]) => api.on(event, listener));
      this.current = api;
    }
    static getApiInstance() { return this.current; }
    static async initialize() {}
  } };
});

function memoryStorage() {
  const records = new Map<string, SubstrateMetadataRecord>();
  const storage: SubstrateMetadataStorage & { records: typeof records } = {
    records,
    get: vi.fn(async (key: string) => structuredClone(records.get(key))),
    put: vi.fn(async (key: string, record: SubstrateMetadataRecord) => { records.set(key, structuredClone(record)); }),
    delete: vi.fn(async (key: string) => { records.delete(key); }),
    keys: vi.fn(async () => [...records.keys()]),
  };
  return storage;
}

const polkadot = { name: 'Polkadot', chainId: GENESIS.slice(2), genesisHash: GENESIS, ecosystem: 'substrate',
  nodes: [{ name: 'node', url: 'wss://polkadot.invalid' }] } as unknown as NetworkJson;

function connect(storage = memoryStorage()) {
  const cache = new SubstrateMetadataCache(storage);
  const reads = vi.spyOn(cache, 'read');
  const handler = new SubstrateApiHandler({} as never, { currentAccount: undefined } as never, cache);
  /** Waits until every cache read a connection started has landed and been applied to its options. */
  const settled = async () => {
    await Promise.all(reads.mock.results.map(({ value }) => value));
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { cache, handler, settled, storage };
}

describe('Substrate connections and saved runtime metadata', () => {
  beforeEach(() => {
    io.apis = [];
    io.chain = { genesisHash: GENESIS, specVersion: 1002005, hex: polkadotMetadata };
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('gives a new connection the runtime saved for its chain (hit), and saves nothing again', async () => {
    const { cache, handler, settled, storage } = connect();
    await cache.write(GENESIS, 1002005, polkadotMetadata);
    vi.mocked(storage.put).mockClear();

    await handler.initApi(polkadot);
    await settled();

    expect(io.apis).toHaveLength(1);
    expect(io.apis[0].options.metadata).toEqual({ [`${GENESIS}-1002005`]: polkadotMetadata });

    vi.useFakeTimers();
    io.apis[0].emit('ready');
    // Once ready, the runtime is decoded: the hex is not kept in memory.
    await vi.waitFor(() => expect(io.apis[0].options.metadata).toEqual({}));
    await vi.advanceTimersByTimeAsync(METADATA_SAVE_DELAY_MS);
    expect(io.apis[0].runtimeMetadata.toHex).not.toHaveBeenCalled();
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('downloads the runtime of a chain with nothing saved (miss), then saves it once ready', async () => {
    const { handler, settled, storage } = connect();

    await handler.initApi(polkadot);
    await settled();
    expect(io.apis[0].options.metadata).toEqual({});

    vi.useFakeTimers();
    io.apis[0].emit('ready');
    await vi.advanceTimersByTimeAsync(METADATA_SAVE_DELAY_MS - 1);
    expect(storage.put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(storage.records.get(GENESIS)).toMatchObject({ specVersion: 1002005, hex: polkadotMetadata }));
  });

  it('replaces the saved runtime once the chain has upgraded (spec upgrade)', async () => {
    const { cache, handler, settled, storage } = connect();
    await cache.write(GENESIS, 1002004, kusamaMetadata);
    io.chain = { genesisHash: GENESIS, specVersion: 1002005, hex: polkadotMetadata };

    await handler.initApi(polkadot);
    await settled();
    // Offered under the old spec's key, which @polkadot/api does not use for the upgraded runtime.
    expect(Object.keys(io.apis[0].options.metadata!)).toEqual([`${GENESIS}-1002004`]);

    vi.useFakeTimers();
    io.apis[0].emit('ready');
    await vi.advanceTimersByTimeAsync(METADATA_SAVE_DELAY_MS);
    await vi.waitFor(() => expect(storage.records.get(GENESIS)?.specVersion).toBe(1002005));
    vi.useRealTimers();
    await expect(cache.read(GENESIS)).resolves.toEqual({ key: `${GENESIS}-1002005`, hex: polkadotMetadata });
    expect(storage.records.size).toBe(1);
  });

  it('removes a saved runtime the API cannot set up, and connects again without it (corrupt entry)', async () => {
    const { cache, handler, settled, storage } = connect();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await cache.write(GENESIS, 1002005, polkadotMetadata);

    await handler.initApi(polkadot);
    await settled();
    const first = io.apis[0];
    expect(first.options.metadata).toHaveProperty(`${GENESIS}-1002005`);

    // A node error is not the saved runtime's fault: it is kept.
    first.emit('error', new Error('WebSocket closed'));
    await settled();
    expect(storage.records.has(GENESIS)).toBe(true);
    expect(io.apis).toHaveLength(1);

    first.emit('error', new Error('FATAL: Unable to initialize the API: MagicNumber mismatch: expected 0x6d657461'));
    await vi.waitFor(() => expect(io.apis).toHaveLength(2));
    expect(storage.records.has(GENESIS)).toBe(false);
    expect(handler.api.polkadot.api).toBe(io.apis[1]);
    // The replacement downloads the node's own metadata.
    expect(io.apis[1].options.metadata).toBeUndefined();
    expect(first.disconnect).toHaveBeenCalled();

    // Only once: the replacement's own errors do not loop.
    io.apis[1].emit('error', new Error('FATAL: Unable to initialize the API: again'));
    first.emit('error', new Error('FATAL: Unable to initialize the API: again'));
    await settled();
    expect(io.apis).toHaveLength(2);
  });

  it('gives the SORA connection, which its own handler holds, the saved runtime and saves an upgraded one', async () => {
    const { cache, handler, settled, storage } = connect();
    const SORA = '0x7e4e32d0feafd4f9c9414b0be86373f9a1efa904809b683453a9af6856d38ad5';
    const sora = { ...polkadot, name: SORA_NETWORK_NAME, chainId: SORA.slice(2), genesisHash: SORA } as NetworkJson;
    await cache.write(SORA, 99, kusamaMetadata);
    io.chain = { genesisHash: SORA, specVersion: 100, hex: polkadotMetadata };

    await handler.initApi(sora);
    await settled();
    expect(io.apis[0].options.metadata).toEqual({ [`${SORA}-99`]: kusamaMetadata });

    vi.useFakeTimers();
    io.apis[0].emit('connected');
    io.apis[0].emit('ready');
    await vi.advanceTimersByTimeAsync(METADATA_SAVE_DELAY_MS);
    await vi.waitFor(() => expect(storage.records.get(SORA)).toMatchObject({ specVersion: 100, hex: polkadotMetadata }));
    expect(handler.api[SORA_NETWORK_NAME].api).toBe(io.apis[0]);
  });

  it('saves nothing from a node that serves another chain than the registry lists', async () => {
    const { handler, settled, storage } = connect();
    io.chain = { genesisHash: `0x${'ab'.repeat(32)}`, specVersion: 1, hex: polkadotMetadata };

    await handler.initApi(polkadot);
    await settled();
    vi.useFakeTimers();
    io.apis[0].emit('ready');
    await vi.advanceTimersByTimeAsync(METADATA_SAVE_DELAY_MS);
    expect(io.apis[0].runtimeMetadata.toHex).not.toHaveBeenCalled();
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('does not apply a read that lands after the connection was replaced', async () => {
    const { cache, handler, settled, storage } = connect();
    await cache.write(GENESIS, 1002005, polkadotMetadata);
    let release!: () => void;
    const original = vi.mocked(storage.get).getMockImplementation()!;
    vi.mocked(storage.get).mockImplementationOnce(async (key) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return original(key);
    });

    await handler.initApi(polkadot);
    await handler.initApi(polkadot);
    release();
    await settled();

    expect(io.apis[0].options.metadata).toEqual({});
    expect(io.apis[1].options.metadata).toHaveProperty(`${GENESIS}-1002005`);
  });

  it('does not keep a saved runtime that is read only after the connection became ready', async () => {
    const { cache, handler, settled, storage } = connect();
    await cache.write(GENESIS, 1002005, polkadotMetadata);
    let release!: () => void;
    const original = vi.mocked(storage.get).getMockImplementation()!;
    vi.mocked(storage.get).mockImplementationOnce(async (key) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return original(key);
    });

    await handler.initApi(polkadot);
    io.apis[0].emit('ready');
    release();
    await settled();

    expect(io.apis[0].options.metadata).toEqual({});
  });

  it('connects as before where the network has no usable genesis hash or the cache is off', async () => {
    const { handler, storage } = connect();

    await handler.initApi({ ...polkadot, genesisHash: '', chainId: 'custom' } as NetworkJson);
    expect(io.apis[0].options.metadata).toBeUndefined();
    expect(storage.get).not.toHaveBeenCalled();

    const offline = new SubstrateApiHandler({} as never, {} as never, new SubstrateMetadataCache(null));
    await offline.initApi(polkadot);
    expect(io.apis[1].options.metadata).toBeUndefined();
  });

  it('logs and keeps going when the runtime cannot be read back to save', async () => {
    const { handler, settled, storage } = connect();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await handler.initApi(polkadot);
    await settled();
    io.apis[0].runtimeMetadata.toHex.mockImplementation(() => { throw new Error('not decorated'); });
    vi.useFakeTimers();
    io.apis[0].emit('ready');
    await vi.advanceTimersByTimeAsync(METADATA_SAVE_DELAY_MS);
    expect(storage.put).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[Metadata] Runtime metadata could not be saved', GENESIS, expect.any(Error));
  });
});
