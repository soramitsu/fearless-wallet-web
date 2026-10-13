import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { keyring } from '@subwallet/ui-keyring';
import { BehaviorSubject } from 'rxjs';
import CryptoJS from 'crypto-js';

const fixture = vi.hoisted(() => ({
  data: {} as Record<string, unknown>, password: null as string | null,
  commits: [] as Array<{ accountWrite: () => boolean; finish: () => void }>,
  failMigration: false, failAccounts: false, failCompensation: false, failPasswordRemove: false,
  bridge: vi.fn(),
}));
vi.mock('@subwallet/keyring/pair/nobody', () => ({ nobody: () => { throw new Error('Unused development pair'); } }));
vi.mock('@/consts/global', async (original) => ({ ...(await original<Record<string, unknown>>()), IS_EXTENSION: false }));
vi.mock('@/bootstrap/webPasswordStore', () => ({ requestWebPasswordStorage: fixture.bridge }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: { runtime: { getURL: (path: string) => path } } }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@extension-base/services/keyring-service/LegacyNetworkEnrollment', () => ({ enrollLegacyAccountNetworks: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));

import { KeyringService } from '@extension-base/services/keyring-service';
import { TonKeyringService } from '@extension-base/services/keyring-service/TonKeyring';
import AccountsStore from '@extension-base/stores/Accounts';
import BaseWebStore from '@extension-base/stores/BaseWeb';
import CurrentAccountStore from '@extension-base/stores/CurrentAccountStore';
import KeyringStoreWeb from '@extension-base/stores/KeyringStoreWeb';
import { WEB_PASSWORD_RECORD_KEY } from '@extension-base/stores/WebPasswordRecord';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import { WalletEcosystem } from '@/interfaces';

const PASSWORD = 'Public web reset password';
const PHRASE = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';
const passwordKey = `fw:${WEB_PASSWORD_RECORD_KEY}`;
function passwordRecord(): { version: 1; serialized: string | null } { return fixture.data[passwordKey] as never; }
let service: KeyringService;
let pending: Promise<unknown>[];
function track<T>(promise: Promise<T>) {
  const result = promise.then((value) => ({ value }), (error) => ({ error }));
  pending.push(result);
  return result;
}

// Controllable IndexedDB transaction model: writes become visible together only
// at oncomplete, and an abort discards all staged puts/deletes. Real BaseWebStore
// cursor enumeration and commit publication run unchanged over this adapter.
function database(): IDBDatabase {
  return { transaction: () => {
    const entries: Record<string, unknown> = {};
    const removed = new Set<string>();
    let aborted = false;
    const transaction = {
      error: null as Error | null, oncomplete: undefined as (() => void) | undefined,
      onabort: undefined as (() => void) | undefined, onerror: undefined as (() => void) | undefined,
      abort: () => { aborted = true; transaction.onabort?.(); },
      objectStore: () => ({
        get: (key: string) => {
          const request = { result: structuredClone(fixture.data[key]), onsuccess: undefined as (() => void) | undefined };
          queueMicrotask(() => request.onsuccess?.());
          return request;
        },
        put: (value: unknown, key: string) => { entries[key] = structuredClone(value); },
        delete: (key: string) => { removed.add(key); },
        openCursor: () => {
          const items = Object.entries(structuredClone(fixture.data));
          const request = { result: null as unknown, onsuccess: undefined as ((event: unknown) => void) | undefined };
          const next = () => queueMicrotask(() => {
            const item = items.shift();
            request.result = item ? { key: item[0], value: item[1], continue: next } : null;
            request.onsuccess?.({ target: request });
          });
          next();
          return request;
        },
      }),
    };
    const accountWrite = () => Object.keys(entries).some(key => key.startsWith('fw:account:'));
    fixture.commits.push({ accountWrite, finish: () => {
      if (aborted) return;
      if ((fixture.failAccounts && accountWrite()) || (fixture.failMigration && Object.hasOwn(entries, passwordKey))) {
        transaction.error = new Error('Modeled IndexedDB commit failed');
        transaction.abort();
      } else {
        Object.assign(fixture.data, entries);
        removed.forEach((key) => delete fixture.data[key]);
        transaction.oncomplete?.();
      }
    } });
    return transaction;
  } } as unknown as IDBDatabase;
}

async function drain(includeAccounts = true) {
  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const commits = fixture.commits.splice(0);
    for (const commit of commits) {
      if (includeAccounts || !commit.accountWrite()) commit.finish();
      else fixture.commits.push(commit);
    }
  }
}

async function native() {
  const importing = track(service.addAccount(PHRASE, { name: 'Public web key' }, WalletEcosystem.Substrate, 'sr25519'));
  await drain();
  const outcome = await importing;
  if (!('value' in outcome)) throw outcome.error;
  return outcome.value;
}

beforeEach(async () => {
  await cryptoWaitReady();
  fixture.data = {};
  fixture.password = null;
  fixture.commits = [];
  fixture.failMigration = fixture.failAccounts = fixture.failCompensation = fixture.failPasswordRemove = false;
  pending = [];
  fixture.bridge.mockReset().mockImplementation(async (operation: string, value?: string) => {
    if (operation === 'get') return fixture.password;
    if (operation === 'remove') {
      if (fixture.failPasswordRemove) throw new Error('Password removal failed');
      fixture.password = null;
    } else if (operation === 'set') {
      if (fixture.failCompensation) throw new Error('Password restoration failed');
      fixture.password = value!;
    }
    return null;
  });
  vi.spyOn(BaseWebStore.prototype, 'openDatabase').mockResolvedValue(database());
  const ready = track(KeyringStoreWeb.initialize());
  await drain();
  expect(await ready).toHaveProperty('value');
  for (const subject of [keyring.accounts, keyring.addresses, keyring.contracts]) {
    for (const address of Object.keys(subject.subject.value)) subject.removeSubjectOnly(address);
  }
  vi.spyOn(keyring.keyringOption, 'init').mockImplementation(() => {});
  keyring.loadAll({ type: 'sr25519', isDevelopment: false, store: new AccountsStore(), password_store: new KeyringStoreWeb() });
  keyring.changeMasterPassword(PASSWORD);
  await drain();
  fixture.password = passwordRecord().serialized; // Preserved pre-migration copy, never the new authority.
  service = Object.create(KeyringService.prototype);
  Object.assign(service, { password: PASSWORD, tonKeyring: new TonKeyringService(service),
    currentAccountStore: new CurrentAccountStore(), currentAccountSubject: new BehaviorSubject(null),
    selectionRevision: 0, selectionRequestRevision: 0,
    accountAccess: { scheduleScan: vi.fn(), flagPreviousMasterPair: vi.fn(), reset: vi.fn(), cancelScan: vi.fn() },
    scheduleLegacyNetworkEnrollment: vi.fn() });
});
afterEach(async () => {
  fixture.failMigration = fixture.failAccounts = fixture.failCompensation = fixture.failPasswordRemove = false;
  await drain();
  await Promise.all(pending);
  await BaseWebStore.flush().catch(() => undefined);
  await KeyringStoreWeb.flush().catch(() => undefined);
  vi.restoreAllMocks();
});


const NEW_PASSWORD = 'Public replacement web password';
const change = () => track(service.changeMasterPassword({ oldPassword: PASSWORD, newPassword: NEW_PASSWORD }));

describe('master password change through actual IndexedDB store adapter', { timeout: 60_000 }, () => {
  it('creates a first password from the durable web tombstone and preserves the legacy copy', async () => {
    fixture.data[passwordKey] = { version: 1, serialized: null };
    keyring.keyring.resetPassword();
    KeyringStoreWeb.commitPassword(null);
    const legacy = fixture.password;
    const creation = track(service.changeMasterPassword({ newPassword: NEW_PASSWORD }));
    await drain();
    expect(await creation).toEqual({ value: true });
    expect(service.unlockKeyring({ password: NEW_PASSWORD })).toBe(true);
    expect(JSON.parse(passwordRecord().serialized!).passwordHash).toBeTruthy();
    expect(fixture.password).toBe(legacy);
  });

  it.each(['password', 'accounts'])('aborts all password/native/TON records after a %s commit error and retries', async fault => {
    const address = await native();
    const vector = vectors.vectors[0];
    const tonAddress = vector.expected.ton.addressNonBounceable;
    const tonKey = `fw:ton:${tonAddress}`;
    fixture.data[tonKey] = { address: tonAddress, name: 'Public TON', publicKeyHex: vector.expected.ton.publicKeyHex,
      cipherSeed: CryptoJS.AES.encrypt(vector.mnemonic, PASSWORD).toString(), futureField: 'retained' };
    const load = track(service.tonKeyring.loadAll());
    await drain();
    await load;
    const before = structuredClone(fixture.data);
    const original = service.getPair(address);
    fixture.failMigration = fault === 'password';
    fixture.failAccounts = fault === 'accounts';
    const pendingChange = change();
    await drain();
    expect(await pendingChange).toEqual({ value: false });
    expect(fixture.data).toEqual(before);
    expect(service.getPassword()).toBe(PASSWORD);
    expect(service.getPair(address)).toBe(original);
    fixture.failMigration = fixture.failAccounts = false;
    const retry = change();
    await drain();
    expect(await retry).toEqual({ value: true });
    expect(fixture.data[tonKey]).toMatchObject({ futureField: 'retained' });
    expect(service.exportMnemonic({ address, password: NEW_PASSWORD, walletEcosystem: WalletEcosystem.Substrate }).seed).toBe(PHRASE);
    expect(await service.exportAccountMnemonic({ address: tonAddress, password: NEW_PASSWORD, walletEcosystem: WalletEcosystem.Ton })).toEqual({ seed: vector.mnemonic });
    let cached: unknown;
    new KeyringStoreWeb().get(value => { cached = value; });
    expect(cached).toEqual(JSON.parse(passwordRecord().serialized!));
    expect(fixture.password).toBe(JSON.stringify(before[passwordKey] && JSON.parse((before[passwordKey] as { serialized: string }).serialized)));
  });

  it('does not publish the new password or pair while a complete account transaction is held', async () => {
    const address = await native();
    const original = service.getPair(address);
    const before = structuredClone(fixture.data);
    const pendingChange = change();
    await drain(false);
    expect(fixture.commits.some(commit => commit.accountWrite())).toBe(true);
    expect(fixture.data).toEqual(before);
    expect(service.getPassword()).toBe(PASSWORD);
    expect(service.getPair(address)).toBe(original);
    await drain();
    expect(await pendingChange).toEqual({ value: true });
  });
});
