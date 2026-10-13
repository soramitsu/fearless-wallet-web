import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cryptoWaitReady, mnemonicToMiniSecret } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import { keyring } from '@subwallet/ui-keyring';

const fixture = vi.hoisted(() => ({
  data: {} as Record<string, KeyringPair$Json>,
  passwordRecord: undefined as { passwordHash: string } | undefined,
  writes: [] as Array<() => void>,
  failRead: false,
  failWrite: false,
  runtime: { lastError: undefined as { message: string } | undefined, getURL: (path: string) => path },
}));
// The unused built-in zero-key fixture eagerly constructs a TON contract with a different
// Buffer implementation in Node. No tested wallet path may request that development pair.
vi.mock('@subwallet/keyring/pair/nobody', () => ({ nobody: () => { throw new Error('Unused development pair'); } }));
vi.mock('@/consts/global', async (original) => ({
  ...(await original<Record<string, unknown>>()), IS_EXTENSION: true,
}));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {
  runtime: fixture.runtime,
  storage: { local: {
    get: (_keys: unknown, callback: (data: Record<string, unknown>) => void) => {
      fixture.runtime.lastError = fixture.failRead ? { message: 'Public read failed' } : undefined;
      callback(structuredClone({ ...fixture.data, 'fw:keyring': fixture.passwordRecord }));
      fixture.runtime.lastError = undefined;
    },
    set: (data: typeof fixture.data, callback: () => void) => {
      const snapshot = structuredClone(data);
      fixture.writes.push(() => {
        fixture.runtime.lastError = fixture.failWrite ? { message: 'Public write failed' } : undefined;
        if (!fixture.failWrite) {
          const { ['fw:keyring']: password, ...accounts } = snapshot;
          if (password) fixture.passwordRecord = password as unknown as { passwordHash: string };
          Object.assign(fixture.data, accounts);
        }
        callback();
        fixture.runtime.lastError = undefined;
      });
    },
    remove: vi.fn(),
  } },
} }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@extension-base/services/keyring-service/LegacyNetworkEnrollment', () => ({ enrollLegacyAccountNetworks: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));

import { KeyringService } from '@extension-base/services/keyring-service';
import { TonKeyringService } from '@extension-base/services/keyring-service/TonKeyring';
import { accountStorageKey } from '@extension-base/services/keyring-service/AccountMetadata';
import AccountsStore from '@extension-base/stores/Accounts';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import Extension from '@extension-base/background/handlers/Extension';
import type { KeyringPair$Json, KeypairType } from '@subwallet/keyring/types';
import { WalletEcosystem } from '@/interfaces';

const P1 = 'Public local import password';
const P2 = 'Public rotated import password';
const PHRASE = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';
const observe = <T>(promise: Promise<T>) => promise.then((value) => ({ value }), (error) => ({ error }));
let service: KeyringService;
let extension: Extension;
let select: ReturnType<typeof vi.fn>;
let pending: Promise<unknown>[];

async function drain() {
  for (let i = 0; i < 20; i++) {
    fixture.writes.splice(0).forEach((finish) => finish());
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function begin(type: KeypairType = 'sr25519', suri = PHRASE, name = 'Public account') {
  const result = observe(extension.accountsCreate({ suri, type, meta: { name }, walletEcosystem: WalletEcosystem.Substrate }));
  pending.push(result);
  return result;
}

beforeEach(async () => {
  await cryptoWaitReady();
  fixture.data = {};
  fixture.passwordRecord = undefined;
  fixture.writes = [];
  fixture.failRead = false;
  fixture.failWrite = false;
  pending = [];
  for (const address of Object.keys(keyring.accounts.subject.value)) keyring.accounts.removeSubjectOnly(address);
  // The process-wide options singleton cannot initialize twice; account crypto, registry,
  // observables and storage remain real while each test gets a fresh keyring backend.
  vi.spyOn(keyring.keyringOption, 'init').mockImplementation(() => {});
  keyring.loadAll({ type: 'sr25519', isDevelopment: false, store: new AccountsStore(),
    password_store: { get: (callback) => callback(fixture.passwordRecord), set: (record) => { fixture.passwordRecord = structuredClone(record); }, remove: () => { fixture.passwordRecord = undefined; } },
  });
  // Real keyring crypto/master state; the fixture controls only storage acknowledgements.
  keyring.changeMasterPassword(P1);
  service = Object.create(KeyringService.prototype);
  Object.assign(service, { password: P1, tonKeyring: new TonKeyringService(service) });
  Object.assign(service, { accountAccess: { scheduleScan: vi.fn(), flagPreviousMasterPair: vi.fn() }, scheduleLegacyNetworkEnrollment: vi.fn() });
  select = vi.fn();
  extension = Object.create(Extension.prototype);
  Object.assign(extension, { state: { keyringService: service, updateCurrentAccount: select } });
});

afterEach(async () => {
  fixture.failWrite = false;
  fixture.failRead = false;
  await drain();
  await Promise.all(pending);
  await BaseExtensionStore.flush().catch(() => undefined);
  vi.restoreAllMocks();
});

describe('local account import durability with real ui-keyring and Chrome store', { timeout: 60_000 }, () => {
  it.each(['sr25519', 'ed25519', 'ecdsa', 'ethereum'] as const)('keeps a %s account invisible until encrypted storage acknowledges it', async (type) => {
    const result = begin(type);
    await vi.waitFor(() => expect(fixture.writes.length).toBeGreaterThan(0));
    expect(keyring.getAccounts()).toEqual([]);
    expect(select).not.toHaveBeenCalled();
    expect(fixture.data).toEqual({});
    await drain();
    const outcome = await result;
    expect(outcome).toHaveProperty('value');
    if (!('value' in outcome)) throw outcome.error;
    const live = keyring.getPair(outcome.value);
    const saved = fixture.data[`fw:${accountStorageKey(live)}`];
    const restored = keyring.createFromJson(saved);
    restored.decodePkcs8(P1);
    expect(restored.publicKey).toEqual(live.publicKey);
    expect(restored.type).toBe(type);
    const payload = new TextEncoder().encode('Public durable import proof');
    expect(restored.verify(payload, restored.sign(payload), restored.publicKey)).toBe(true);
    expect(restored.exportMnemonic(P1)).toBe(PHRASE);
    expect(saved.meta).toMatchObject({ isMasterPassword: true, isMobile: false, name: 'Public account' });
    expect(live.isLocked).toBe(true);
  });

  it('rejects a failed first write without account publication or selection, then retries', async () => {
    fixture.failWrite = true;
    const first = begin();
    await drain();
    expect(await first).toHaveProperty('error');
    expect(keyring.getAccounts()).toEqual([]);
    expect(select).not.toHaveBeenCalled();
    expect(fixture.data).toEqual({});
    fixture.failWrite = false;
    const retry = begin();
    await drain();
    expect(await retry).toHaveProperty('value');
    expect(keyring.getAccounts()).toHaveLength(1);
    await expect(BaseExtensionStore.flush()).resolves.toBeUndefined();
  });

  it('does not publish or write after a durable read fails', async () => {
    fixture.failRead = true;
    const result = begin();
    await drain();
    expect(await result).toHaveProperty('error');
    expect(keyring.getAccounts()).toEqual([]);
    expect(fixture.writes).toEqual([]);
    expect(fixture.data).toEqual({});
    expect(select).not.toHaveBeenCalled();
  });

  it('keeps a durable duplicate exactly as stored, including metadata and ciphertext', async () => {
    const first = begin();
    await drain();
    expect(await first).toHaveProperty('value');
    const [storageKey] = Object.keys(fixture.data);
    fixture.data[storageKey].meta.name = 'Durable name';
    Object.assign(fixture.data[storageKey], { futureField: { retained: true } });
    const original = structuredClone(fixture.data);
    const duplicate = begin('sr25519', PHRASE, 'Do not replace');
    await drain();
    expect(await duplicate).toHaveProperty('value');
    expect(fixture.data).toEqual(original);
    expect(keyring.getAccounts()[0].meta.name).toBe('Durable name');
  });

  it('rejects late completion after lock while retaining a committed encrypted record for retry', async () => {
    const result = begin();
    await vi.waitFor(() => expect(fixture.writes.length).toBeGreaterThan(0));
    Object.assign(service, { password: '' });
    keyring.lockAll();
    await drain();
    expect(await result).toHaveProperty('error');
    expect(select).not.toHaveBeenCalled();
    const original = structuredClone(fixture.data);
    expect(Object.keys(original)).toHaveLength(1);
    keyring.unlockKeyring(P1);
    Object.assign(service, { password: P1 });
    const retry = begin();
    await drain();
    expect(await retry).toHaveProperty('value');
    expect(fixture.data).toEqual(original);
  });

  it('rejects an import when already locked', async () => {
    keyring.lockAll();
    Object.assign(service, { password: '' });
    const result = begin();
    await drain();
    expect(await result).toHaveProperty('error');
    expect(keyring.getAccounts()).toEqual([]);
    expect(fixture.data).toEqual({});
  });

  it('includes an in-flight import in the following real master-password rotation', async () => {
    const result = begin();
    await vi.waitFor(() => expect(fixture.writes).toHaveLength(1));
    const change = observe(service.changeMasterPassword({ newPassword: P2, oldPassword: P1 }));
    pending.push(change);
    expect(service.getPassword()).toBe(P1);
    await drain();
    expect(await result).toHaveProperty('value');
    expect(await change).toEqual({ value: true });
    const restored = keyring.createFromJson(Object.values(fixture.data)[0]);
    expect(() => restored.decodePkcs8(P1)).toThrow();
    restored.decodePkcs8(P2);
    expect(restored.publicKey).toEqual(keyring.createFromUri(PHRASE).publicKey);
  });

  it('uses the new password when queued after a real password rotation', async () => {
    const change = observe(service.changeMasterPassword({ newPassword: P2, oldPassword: P1 }));
    pending.push(change);
    const result = begin();
    await drain();
    expect(await change).toEqual({ value: true });
    expect(await result).toHaveProperty('value');
    const restored = keyring.createFromJson(Object.values(fixture.data)[0]);
    expect(() => restored.decodePkcs8(P1)).toThrow();
    expect(() => restored.decodePkcs8(P2)).not.toThrow();
  });

  it('serializes simultaneous duplicates and preserves the first accepted record', async () => {
    const first = begin('ethereum', PHRASE, 'First import');
    const second = begin('ethereum', PHRASE, 'Second import');
    await drain();
    expect(await first).toEqual(await second);
    expect(Object.values(fixture.data)).toHaveLength(1);
    expect(Object.values(fixture.data)[0].meta.name).toBe('First import');
  });

  it('loads an existing durable account even when it is absent from memory', async () => {
    const pair = keyring.createFromUri(PHRASE);
    const json = pair.toJson(P1);
    json.meta = { name: 'Stored only', isMasterPassword: true, isMasterAccount: true };
    fixture.data[`fw:${accountStorageKey(pair)}`] = json;
    const original = structuredClone(fixture.data);
    const result = begin();
    await drain();
    expect(await result).toHaveProperty('value');
    expect(fixture.data).toEqual(original);
    expect(keyring.getAccounts()[0].meta.name).toBe('Stored only');
  });

  it('refuses to replace an unreadable encrypted record even with a matching phrase', async () => {
    const pair = keyring.createFromUri(PHRASE);
    const json = pair.toJson(P2);
    json.meta = { name: 'Keep recovery name', isMasterPassword: true, isMasterAccount: true, pendingMigrate: true };
    Object.assign(json, { futureField: 'retain' });
    const storageKey = `fw:${accountStorageKey(pair)}`;
    fixture.data[storageKey] = json;
    const original = structuredClone(fixture.data);
    const result = begin();
    await drain();
    expect(await result).toHaveProperty('error');
    expect(fixture.data).toEqual(original);
    expect(keyring.createFromJson(fixture.data[storageKey]).exportMnemonic(P2)).toBe(PHRASE);
    expect(keyring.getAccounts()).toEqual([]);
  });

  it('retains the original encrypted copy and live pair when migration metadata persistence fails', async () => {
    const first = begin();
    await drain();
    expect(await first).toHaveProperty('value');
    const live = keyring.getPairs().find((pair) => !pair.meta.isTesting)!;
    const old = keyring.createFromUri(PHRASE).toJson(P1);
    old.meta.isMasterPassword = false;
    fixture.data[`fw:${accountStorageKey(live)}`] = old;
    const original = structuredClone(fixture.data);
    fixture.failWrite = true;
    const result = begin();
    await drain();
    expect(await result).toHaveProperty('error');
    expect(fixture.data).toEqual(original);
    expect(keyring.getPair(live.address)).toBe(live);
    await expect(BaseExtensionStore.flush()).resolves.toBeUndefined();
  });

  it('rejects a record whose PKCS8 key differs from its public JSON header', async () => {
    const expected = keyring.createFromUri(PHRASE);
    const different = keyring.createFromUri(`${PHRASE}//different`).toJson(P1);
    different.address = expected.address;
    fixture.data[`fw:${accountStorageKey(expected)}`] = different;
    const original = structuredClone(fixture.data);
    const result = begin();
    await drain();
    expect(await result).toHaveProperty('error');
    expect(fixture.data).toEqual(original);
    expect(keyring.getAccounts()).toEqual([]);
  });

  it('does not replace an existing mobile or external identity', async () => {
    const pair = keyring.createFromUri(PHRASE);
    const json = pair.toJson(P2);
    json.meta = { isMobile: true, name: 'Mobile identity' };
    fixture.data[`fw:${accountStorageKey(pair)}`] = json;
    const original = structuredClone(fixture.data);
    const result = begin();
    await drain();
    expect(await result).toHaveProperty('error');
    expect(fixture.data).toEqual(original);
    expect(keyring.getAccounts()).toEqual([]);
  });

  it('does not overwrite a record arriving after the initial durable read', async () => {
    const update = AccountsStore.prototype.updateAndWait;
    const pair = keyring.createFromUri(PHRASE);
    const arriving = pair.toJson(P2);
    arriving.meta.name = 'Arrived while queued';
    vi.spyOn(AccountsStore.prototype, 'updateAndWait').mockImplementationOnce(function (key, ...args) {
      fixture.data[`fw:${key}`] = structuredClone(arriving);
      return update.call(this, key, ...args);
    });
    const result = begin();
    await drain();
    expect(await result).toHaveProperty('error');
    expect(fixture.data[`fw:${accountStorageKey(pair)}`]).toEqual(arriving);
    expect(keyring.getAccounts()).toEqual([]);
  });

  it('retains the latest metadata when migrating an unchanged encrypted record', async () => {
    const update = AccountsStore.prototype.updateAndWait;
    const pair = keyring.createFromUri(PHRASE);
    fixture.data[`fw:${accountStorageKey(pair)}`] = pair.toJson(P1);
    fixture.data[`fw:${accountStorageKey(pair)}`].meta.isMasterPassword = false;
    vi.spyOn(AccountsStore.prototype, 'updateAndWait').mockImplementationOnce(function (key, ...args) {
      fixture.data[`fw:${key}`].meta.name = 'Concurrent durable rename';
      return update.call(this, key, ...args);
    });
    const result = begin();
    await drain();
    expect(await result).toHaveProperty('value');
    expect(fixture.data[`fw:${accountStorageKey(pair)}`].meta.name).toBe('Concurrent durable rename');
    expect(keyring.getAccounts()[0].meta.name).toBe('Concurrent durable rename');
  });

  it('does not resurrect an existing record deleted before its migration write', async () => {
    const update = AccountsStore.prototype.updateAndWait;
    const pair = keyring.createFromUri(PHRASE);
    fixture.data[`fw:${accountStorageKey(pair)}`] = pair.toJson(P1);
    fixture.data[`fw:${accountStorageKey(pair)}`].meta.isMasterPassword = false;
    vi.spyOn(AccountsStore.prototype, 'updateAndWait').mockImplementationOnce(function (key, ...args) {
      delete fixture.data[`fw:${key}`];
      return update.call(this, key, ...args);
    });
    const result = begin();
    await drain();
    expect(await result).toHaveProperty('error');
    expect(fixture.data).toEqual({});
    expect(keyring.getAccounts()).toEqual([]);
  });

  it('rechecks lock after waiting behind another password-queue operation', async () => {
    let release!: () => void;
    const held = service.tonKeyring.vault.exclusive(() => new Promise<void>((resolve) => { release = resolve; }));
    pending.push(held);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const result = begin();
    keyring.lockAll();
    Object.assign(service, { password: '' });
    release();
    await drain();
    expect(await result).toHaveProperty('error');
    expect(fixture.data).toEqual({});
    expect(keyring.getAccounts()).toEqual([]);
  });

  it('completes legacy migration when its old password happens to equal the current one', async () => {
    const pair = keyring.createFromUri(PHRASE);
    const json = pair.toJson(P1);
    json.meta = { name: 'Legacy same password', isMasterPassword: false, pendingMigrate: true };
    const storageKey = `fw:${accountStorageKey(pair)}`;
    fixture.data[storageKey] = json;
    const result = begin();
    await drain();
    expect(await result).toHaveProperty('value');
    expect(fixture.data[storageKey].meta).toMatchObject({ name: 'Legacy same password', isMasterPassword: true });
    expect(fixture.data[storageKey].meta).not.toHaveProperty('pendingMigrate');
  });

  it('retains a readable Ethereum backup whose JSON header uses its 20-byte address', async () => {
    const pair = keyring.createFromUri(PHRASE, {}, 'ethereum');
    const json = pair.toJson(P1);
    json.address = pair.address;
    json.meta = { name: 'Legacy Ethereum header', isMasterPassword: true };
    fixture.data[`fw:${accountStorageKey(pair)}`] = json;
    const original = structuredClone(fixture.data);
    const result = begin('ethereum');
    await drain();
    expect(await result).toHaveProperty('value');
    expect(fixture.data).toEqual(original);
    const restored = keyring.getPair(pair.address);
    restored.decodePkcs8(P1);
    expect(restored.publicKey).toEqual(pair.publicKey);
  });

  it('retains all original mnemonic material when a matching raw key cannot open the stored record', async () => {
    const pair = keyring.createFromUri(PHRASE);
    const json = pair.toJson(P2);
    json.meta = { name: 'Stored mnemonic', isMasterAccount: true, isMasterPassword: true };
    const storageKey = `fw:${accountStorageKey(pair)}`;
    fixture.data[storageKey] = json;
    const original = structuredClone(fixture.data);
    const result = begin('sr25519', u8aToHex(mnemonicToMiniSecret(PHRASE)));
    await drain();
    expect(fixture.data).toEqual(original);
    expect(await result).toHaveProperty('error');
    const retained = keyring.createFromJson(fixture.data[storageKey]);
    expect(retained.exportMnemonic(P2)).toBe(PHRASE);
    expect(keyring.getAccounts()).toEqual([]);
  });

  it('retains stored mnemonic entropy when a matching raw key completes readable legacy migration', async () => {
    const pair = keyring.createFromUri(PHRASE);
    const json = pair.toJson(P1);
    json.meta = { name: 'Stored legacy mnemonic', isMasterAccount: true, isMasterPassword: false };
    const storageKey = `fw:${accountStorageKey(pair)}`;
    fixture.data[storageKey] = json;
    const result = begin('sr25519', u8aToHex(mnemonicToMiniSecret(PHRASE)));
    await drain();
    expect(await result).toHaveProperty('value');
    expect(fixture.data[storageKey].encoded).toBe(json.encoded);
    expect(fixture.data[storageKey].meta).toMatchObject({ isMasterAccount: true, isMasterPassword: true });
    expect(keyring.createFromJson(fixture.data[storageKey]).exportMnemonic(P1)).toBe(PHRASE);
  });

  it('does not change a record reassigned to an external identity while migration waits', async () => {
    const update = AccountsStore.prototype.updateAndWait;
    const pair = keyring.createFromUri(PHRASE);
    fixture.data[`fw:${accountStorageKey(pair)}`] = pair.toJson(P1);
    fixture.data[`fw:${accountStorageKey(pair)}`].meta.isMasterPassword = false;
    vi.spyOn(AccountsStore.prototype, 'updateAndWait').mockImplementationOnce(function (key, ...args) {
      fixture.data[`fw:${key}`].meta.isMobile = true;
      return update.call(this, key, ...args);
    });
    const result = begin();
    await drain();
    expect(await result).toHaveProperty('error');
    expect(fixture.data[`fw:${accountStorageKey(pair)}`].meta).toMatchObject({ isMobile: true, isMasterPassword: false });
    expect(keyring.getAccounts()).toEqual([]);
  });

  it.each(['sr25519', 'ed25519', 'ecdsa', 'ethereum'] as const)('persists a new %s raw key with its real signing key and no invented mnemonic', async (type) => {
    const raw = u8aToHex(mnemonicToMiniSecret(PHRASE));
    const result = begin(type, raw);
    await drain();
    const outcome = await result;
    if (!('value' in outcome)) throw outcome.error;
    const live = keyring.getPair(outcome.value);
    const restored = keyring.createFromJson(fixture.data[`fw:${accountStorageKey(live)}`]);
    restored.decodePkcs8(P1);
    expect(restored.publicKey).toEqual(keyring.createFromUri(raw, {}, type).publicKey);
    expect(restored.haveEntropy).toBe(false);
    const payload = new TextEncoder().encode('Public raw-key persistence proof');
    expect(restored.verify(payload, restored.sign(payload), restored.publicKey)).toBe(true);
    expect(restored.meta.isMasterAccount).toBe(false);
  });
});
