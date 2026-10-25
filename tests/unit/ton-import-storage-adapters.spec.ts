import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import type { TonStoreAccount } from '@extension-base/stores/TonStore';
import type { TonSeedOwner, TonSeedVault } from '@extension-base/services/keyring-service/TonSeedVault';

const fixture = vi.hoisted(() => ({
  extension: true,
  readError: false,
  writeError: false,
  data: {} as Record<string, TonStoreAccount>,
  writes: [] as Array<() => void>,
  runtime: { lastError: undefined as { message: string } | undefined, getURL: (path: string) => path },
}));
vi.mock('@/consts/global', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  get IS_EXTENSION() { return fixture.extension; },
}));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: {
    runtime: fixture.runtime,
    storage: { local: {
      get: (_keys: unknown, callback: (data: Record<string, TonStoreAccount>) => void) => {
        fixture.runtime.lastError = fixture.readError ? { message: 'Public read unavailable' } : undefined;
        callback(structuredClone(fixture.data));
        fixture.runtime.lastError = undefined;
      },
      set: (data: Record<string, TonStoreAccount>, callback: () => void) => {
        fixture.writes.push(() => {
          fixture.runtime.lastError = fixture.writeError ? { message: 'Public write unavailable' } : undefined;
          if (!fixture.writeError) Object.assign(fixture.data, structuredClone(data));
          callback();
          fixture.runtime.lastError = undefined;
        });
      },
    } },
  },
}));

const vector = vectors.vectors[0];
const address = vector.expected.ton.addressNonBounceable;
const publicKeyHex = vector.expected.ton.publicKeyHex;
const key = `fw:ton:${address}`;
const P1 = 'Public import password fixture';
const P0 = 'Public previous password fixture';
const record = { name: 'Public TON import', address, publicKeyHex };
const observe = (promise: Promise<void>) => promise.then(() => 'resolved', () => 'rejected');

describe.each([true, false])('TON import through real store adapter (extension: %s)', (extension) => {
  let owner: TonSeedOwner;
  let vault: TonSeedVault;
  let flush: () => Promise<void>;
  let encrypt: (seed: string, password: string) => string;
  let importAccount: () => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    fixture.extension = extension;
    fixture.data = {};
    fixture.writes = [];
    fixture.readError = false;
    fixture.writeError = false;
    const { default: BaseWebStore } = await import('@extension-base/stores/BaseWeb');
    const { default: BaseExtensionStore } = await import('@extension-base/stores/BaseExtension');
    flush = () => (extension ? BaseExtensionStore : BaseWebStore).flush();
    vi.spyOn(BaseWebStore.prototype, 'openDatabase').mockResolvedValue({
      transaction: () => {
        const transaction = {
          oncomplete: undefined as (() => void) | undefined,
          onabort: undefined as (() => void) | undefined,
          error: undefined as Error | undefined,
          objectStore: () => ({
            get: (key: string) => {
              const read = {
                onsuccess: undefined as (() => void) | undefined,
                result: structuredClone(fixture.data[key]),
              };
              queueMicrotask(() => {
                if (fixture.readError) {
                  transaction.error = new Error('Public read unavailable');
                  transaction.onabort?.();
                } else read.onsuccess?.();
              });
              return read;
            },
            put: (value: TonStoreAccount, key: string) => {
              const snapshot = structuredClone(value);
              fixture.writes.push(() => {
                if (fixture.writeError) {
                  transaction.error = new Error('Public write unavailable');
                  transaction.onabort?.();
                } else {
                  fixture.data[key] = snapshot;
                  transaction.oncomplete?.();
                }
              });
            },
          }),
        };
        return transaction;
      },
    } as unknown as IDBDatabase);
    const module = await import('@extension-base/services/keyring-service/TonSeedVault');
    const { tonStore } = await import('@extension-base/stores/TonStore');
    expect(tonStore).toBeInstanceOf(extension ? BaseExtensionStore : BaseWebStore);
    encrypt = module.encryptTonSeed;
    owner = {
      accountSubject: { value: {} },
      setAccounts: (saved) => {
        (owner.accountSubject as { value: Record<string, unknown> }).value = {
          ...owner.accountSubject.value,
          [saved.address]: { ...saved, publicKey: Buffer.from(saved.publicKeyHex, 'hex') },
        };
      },
    };
    vault = new module.TonSeedVault(owner);
    importAccount = () => vault.importAccount(record, vector.mnemonic, () => P1);
  });
  afterEach(async () => {
    await flush().catch(() => undefined);
    vi.restoreAllMocks();
  });

  it('publishes only after the Chrome callback or IndexedDB transaction completes', async () => {
    let answered = false;
    const pending = importAccount().then(() => { answered = true; });
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    expect(answered).toBe(false);
    expect(owner.accountSubject.value).toEqual({});
    expect(fixture.data[key]).toBeUndefined();
    fixture.writes[0]();
    await pending;
    expect(owner.accountSubject.value[address].cipherSeed).toBe(fixture.data[key].cipherSeed);
    await expect(vault.decryptVerified(address, () => P1)).resolves.toBe(vector.mnemonic);
  });

  it('rejects failed writes without poisoning a later password-write flush after retry', async () => {
    const pending = observe(importAccount());
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    fixture.writeError = true;
    fixture.writes[0]();
    expect(await pending).toBe('rejected');
    expect(owner.accountSubject.value).toEqual({});
    expect(fixture.data[key]).toBeUndefined();
    fixture.writeError = false;
    const retry = importAccount();
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(2));
    fixture.writes[1]();
    await retry;
    // Import owns its awaited failure; an unrelated later password flush must not report it again.
    await expect(flush()).resolves.toBeUndefined();
  });

  it('does not create an account after a read error', async () => {
    fixture.readError = true;
    await expect(importAccount()).rejects.toThrow('Public read unavailable');
    expect(fixture.writes).toHaveLength(0);
    expect(owner.accountSubject.value).toEqual({});
  });

  it('preserves a failed recovery and allows retry without poisoning a later flush', async () => {
    const original = { ...record, cipherSeed: encrypt(vector.mnemonic, P0) };
    fixture.data[key] = original;
    const pending = observe(importAccount());
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    fixture.writeError = true;
    fixture.writes[0]();
    expect(await pending).toBe('rejected');
    expect(fixture.data[key]).toEqual(original);
    expect(owner.accountSubject.value[address].cipherSeed).toBe(original.cipherSeed);
    fixture.writeError = false;
    const retry = importAccount();
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(2));
    fixture.writes[1]();
    await retry;
    await expect(flush()).resolves.toBeUndefined();
    await expect(vault.decryptVerified(address, () => P1)).resolves.toBe(vector.mnemonic);
  });
});
