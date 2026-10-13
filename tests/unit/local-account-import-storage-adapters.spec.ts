import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import type { KeyringPair$Json, KeyringPair } from '@subwallet/keyring/types';
import { WalletEcosystem } from '@/interfaces';

const fixture = vi.hoisted(() => ({
  extension: true,
  backend: undefined as Keyring | undefined,
  published: [] as KeyringPair$Json[],
  readError: false,
  writeError: false,
  data: {} as Record<string, KeyringPair$Json>,
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
      get: (_keys: unknown, callback: (data: Record<string, KeyringPair$Json>) => void) => {
        fixture.runtime.lastError = fixture.readError ? { message: 'Public read unavailable' } : undefined;
        callback(structuredClone(fixture.data));
        fixture.runtime.lastError = undefined;
      },
      set: (data: Record<string, KeyringPair$Json>, callback: () => void) => {
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


// Storage fault tests use standard Polkadot pairs; the companion service suite and Chrome smoke
// exercise the installed SubWallet keyring, including entropy and all four supported key types.
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {
  get keyring() { return { isLocked: false, addFromJson: (json) => fixture.backend!.addFromJson(json) }; },
  createFromJson: (json) => fixture.backend!.createFromJson(json),
  accounts: { add: (_store, _address, _publicKey, json) => fixture.published.push(json) },
} }));

const P1 = 'Public account adapter password';
const phrase = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';
const observe = (promise: Promise<string>) => promise.then(() => 'resolved', () => 'rejected');

describe.each([true, false])('local account through real store adapter (extension: %s)', { timeout: 60_000 }, (extension) => {
  let flush: () => Promise<void>;
  let importAccount: () => Promise<string>;

  beforeEach(async () => {
    vi.resetModules();
    await cryptoWaitReady();
    fixture.backend = new Keyring({ type: 'sr25519' });
    fixture.published = [];
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
              const read = { onsuccess: undefined as (() => void) | undefined, result: structuredClone(fixture.data[key]) };
              queueMicrotask(() => {
                if (fixture.readError) {
                  transaction.error = new Error('Public read unavailable');
                  transaction.onabort?.();
                } else read.onsuccess?.();
              });
              return read;
            },
            put: (value: KeyringPair$Json, key: string) => {
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
    const { default: AccountsStore } = await import('@extension-base/stores/Accounts');
    expect(new AccountsStore()).toBeInstanceOf(extension ? BaseExtensionStore : BaseWebStore);
    const { importLocalAccount } = await import('@extension-base/services/keyring-service/LocalAccountImport');
    importAccount = () => importLocalAccount(fixture.backend!.createFromUri(phrase) as unknown as KeyringPair, WalletEcosystem.Substrate, () => P1);
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
    expect(fixture.published).toEqual([]);
    expect(fixture.data).toEqual({});
    fixture.writes[0]();
    await pending;
    expect(fixture.published).toHaveLength(1);
    const restored = fixture.backend!.createFromJson(Object.values(fixture.data)[0]);
    restored.decodePkcs8(P1);
    expect(restored.publicKey).toEqual(fixture.backend!.createFromUri(phrase).publicKey);
  });

  it('rejects failed writes without poisoning a later password flush after retry', async () => {
    const first = observe(importAccount());
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    fixture.writeError = true;
    fixture.writes[0]();
    expect(await first).toBe('rejected');
    expect(fixture.published).toEqual([]);
    expect(fixture.data).toEqual({});
    fixture.writeError = false;
    const retry = importAccount();
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(2));
    fixture.writes[1]();
    await retry;
    await expect(flush()).resolves.toBeUndefined();
  });

  it('rejects read errors before writing or publishing a new account', async () => {
    fixture.readError = true;
    await expect(importAccount()).rejects.toThrow('Public read unavailable');
    expect(fixture.writes).toEqual([]);
    expect(fixture.published).toEqual([]);
  });

  it('retains ciphertext and flags after failed migration metadata persistence and supports retry', async () => {
    const pair = fixture.backend!.createFromUri(phrase);
    const { accountStorageKey } = await import('@extension-base/services/keyring-service/AccountMetadata');
    const key = `fw:${accountStorageKey(pair as unknown as KeyringPair)}`;
    const original = pair.toJson(P1);
    original.meta.isMasterPassword = false;
    fixture.data[key] = original;
    const first = observe(importAccount());
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    fixture.writeError = true;
    fixture.writes[0]();
    expect(await first).toBe('rejected');
    expect(fixture.data[key]).toEqual(original);
    expect(fixture.published).toEqual([]);
    fixture.writeError = false;
    const retry = importAccount();
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(2));
    fixture.writes[1]();
    await retry;
    await expect(flush()).resolves.toBeUndefined();
    const restored = fixture.backend!.createFromJson(fixture.data[key]);
    expect(() => restored.decodePkcs8(P1)).not.toThrow();
  });
});
