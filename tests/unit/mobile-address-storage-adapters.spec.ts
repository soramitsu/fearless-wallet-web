import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicAddressJson } from '@extension-base/stores/Addresses';

const fixture = vi.hoisted(() => ({
  extension: true, failRead: false, failWrite: false,
  data: {} as Record<string, PublicAddressJson>, writes: [] as (() => void)[],
  published: [] as PublicAddressJson[],
  runtime: { lastError: undefined as { message: string } | undefined },
}));
vi.mock('@subwallet/keyring/pair/nobody', () => ({ nobody: () => { throw new Error('Unused development pair'); } }));
vi.mock('@/consts/global', () => ({ get IS_EXTENSION() { return fixture.extension; } }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {
  runtime: fixture.runtime,
  storage: { local: {
    get: (_keys, callback) => {
      fixture.runtime.lastError = fixture.failRead ? { message: 'Public read failed' } : undefined;
      callback(structuredClone(fixture.data));
      fixture.runtime.lastError = undefined;
    },
    set: (data, callback) => {
      const snapshot = structuredClone(data);
      fixture.writes.push(() => {
        fixture.runtime.lastError = fixture.failWrite ? { message: 'Public write failed' } : undefined;
        if (!fixture.failWrite) Object.assign(fixture.data, snapshot);
        callback();
        fixture.runtime.lastError = undefined;
      });
    },
  } },
} }));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {
  addresses: { add: (_store, _address, _raw, json) => fixture.published.push(json) },
  contracts: { add: (_store, _address, _raw, json) => fixture.published.push(json) },
} }));
// Public 32-byte account identity. The companion service suite exercises real keyring publication.
const address = '0x' + '44'.repeat(32);
const key = 'fw:address:' + address;
const observe = (promise: Promise<void>) => promise.then(() => 'resolved', () => 'rejected');

describe.each([true, false])('public address storage adapter (extension: %s)', (extension) => {
  let save: () => Promise<void>, flush: () => Promise<void>;
  beforeEach(async () => {
    vi.resetModules();
    fixture.extension = extension;
    fixture.failRead = false;
    fixture.failWrite = false;
    fixture.data = {};
    fixture.writes = [];
    fixture.published = [];
    const { default: BaseWebStore } = await import('@extension-base/stores/BaseWeb');
    const { default: BaseExtensionStore } = await import('@extension-base/stores/BaseExtension');
    flush = () => (extension ? BaseExtensionStore : BaseWebStore).flush();
    vi.spyOn(BaseWebStore.prototype, 'openDatabase').mockResolvedValue({ transaction: () => {
      const transaction = {
        oncomplete: undefined as (() => void) | undefined,
        onabort: undefined as (() => void) | undefined,
        error: undefined as Error | undefined,
        abort: () => transaction.onabort?.(),
        objectStore: () => ({
          get: (key: string) => {
            const request = { onsuccess: undefined as (() => void) | undefined, result: structuredClone(fixture.data[key]) };
            queueMicrotask(() => {
              if (fixture.failRead) { transaction.error = new Error('Public read failed'); transaction.onabort?.(); }
              else request.onsuccess?.();
            });
            return request;
          },
          put: (value: PublicAddressJson, key: string) => {
            const snapshot = structuredClone(value);
            fixture.writes.push(() => {
              if (fixture.failWrite) { transaction.error = new Error('Public write failed'); transaction.onabort?.(); }
              else { fixture.data[key] = snapshot; transaction.oncomplete?.(); }
            });
          },
        }),
      };
      return transaction;
    } } as unknown as IDBDatabase);
    const { updatePublicAddress } = await import('@extension-base/services/keyring-service/AddressMetadata');
    const { default: AddressesStore } = await import('@extension-base/stores/Addresses');
    expect(new AddressesStore()).toBeInstanceOf(extension ? BaseExtensionStore : BaseWebStore);
    save = () => updatePublicAddress(address, 'address', (meta) => ({ ...meta, name: 'Public persisted wallet' }));
  });
  afterEach(async () => {
    await flush();
    vi.restoreAllMocks();
  });

  it('waits for browser acknowledgement before publication and completion', async () => {
    let done = false;
    const result = save().then(() => { done = true; });
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(done).toBe(false);
    expect(fixture.published).toEqual([]);
    fixture.writes.shift()!();
    await result;
    expect(fixture.published).toEqual([fixture.data[key]]);
  });

  it('rejects a read failure, preserves originals, and permits retry', async () => {
    fixture.data[key] = { address, meta: { name: 'Original', wcTopic: 'public-session' } };
    const original = structuredClone(fixture.data);
    fixture.failRead = true;
    expect(await observe(save())).toBe('rejected');
    expect(fixture.data).toEqual(original);
    expect(fixture.published).toEqual([]);
    fixture.failRead = false;
    const retry = save();
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    fixture.writes.shift()!();
    await retry;
    expect(fixture.data[key].meta.wcTopic).toBe('public-session');
  });

  it('rejects write failure or transaction abort without publication and permits retry', async () => {
    fixture.failWrite = true;
    const result = observe(save());
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    fixture.writes.shift()!();
    expect(await result).toBe('rejected');
    expect(fixture.data).toEqual({});
    expect(fixture.published).toEqual([]);
    fixture.failWrite = false;
    const retry = save();
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    fixture.writes.shift()!();
    await retry;
    expect(fixture.published).toHaveLength(1);
  });
});
