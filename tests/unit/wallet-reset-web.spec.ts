import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { keyring } from '@subwallet/ui-keyring';
import { BehaviorSubject } from 'rxjs';

const fixture = vi.hoisted(() => ({
  data: {} as Record<string, unknown>, password: null as string | null,
  commits: [] as Array<{ accountRemoval: () => boolean; finish: () => void }>,
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
import { accountStoreKey } from '@extension-base/services/keyring-service/DeletedWallets';
import AccountsStore from '@extension-base/stores/Accounts';
import BaseWebStore from '@extension-base/stores/BaseWeb';
import CurrentAccountStore from '@extension-base/stores/CurrentAccountStore';
import KeyringStoreWeb from '@extension-base/stores/KeyringStoreWeb';
import WalletConnectRetiredSessions from '@extension-base/stores/WalletConnectRetiredSessions';
import { enrollLegacyAccountNetworks } from '@extension-base/services/keyring-service/LegacyNetworkEnrollment';
import { WEB_PASSWORD_RECORD_KEY, WEB_RESET_PASSWORD_KEY } from '@extension-base/stores/WebPasswordRecord';
import { WalletEcosystem } from '@/interfaces';

const PASSWORD = 'Public web reset password';
const PHRASE = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';
const journalKey = `fw:${WEB_RESET_PASSWORD_KEY}`;
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
    const accountRemoval = () => [...removed].some((key) => key.startsWith('fw:account:'));
    fixture.commits.push({ accountRemoval, finish: () => {
      if (aborted) return;
      if ((fixture.failAccounts && accountRemoval()) || (fixture.failMigration && Object.hasOwn(entries, passwordKey))) {
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
      if (includeAccounts || !commit.accountRemoval()) commit.finish();
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

describe('web reset with one IndexedDB password/account commit', { timeout: 60_000 }, () => {
  it('loads actual ui-keyring accounts without its normal persistence callbacks writing during recovery-only startup', async () => {
    await native();
    KeyringStoreWeb.readOnly = true;
    const write = vi.spyOn(BaseWebStore.prototype, 'writeToDB');
    const remove = vi.spyOn(BaseWebStore.prototype, 'removeFromDB');
    const loading = track(new AccountsStore().all((key, json) => keyring.loadAccount(json, key)));
    await drain();
    expect(await loading).toHaveProperty('value');
    expect(write.mock.calls.length).toBe(0);
    expect(remove.mock.calls.length).toBe(0);
  });

  it('does not enroll additional network keys during recovery-only unlock', async () => {
    await native();
    KeyringStoreWeb.readOnly = true;
    vi.mocked(enrollLegacyAccountNetworks).mockClear();
    Reflect.get(KeyringService.prototype, 'scheduleLegacyNetworkEnrollment').call(service);
    await drain();
    expect(vi.mocked(enrollLegacyAccountNetworks).mock.calls.length).toBe(0);
  });

  it('suppresses a retired saved selection in memory without rewriting it during recovery-only startup', async () => {
    KeyringStoreWeb.readOnly = true;
    const key = 'fwcurrent_account:CurrentAccountInfo';
    const selection = { address: 'public-retired-mobile', ethereumAddress: '', name: 'Retired mobile',
      isMobile: true, wcTopic: 'public-retired-topic', walletEcosystem: WalletEcosystem.Substrate };
    fixture.data[key] = structuredClone(selection);
    vi.spyOn(WalletConnectRetiredSessions.prototype, 'readTopics').mockResolvedValue([selection.wcTopic]);
    const ready = track(service.restoreCurrentAccount());
    await drain();
    expect(await ready).toHaveProperty('value');
    expect(service.currentAccountSubject.value).toBeNull();
    expect(fixture.data[key]).toEqual(selection);
  });

  it('keeps password and live accounts until commit, then ignores retained legacy bytes after restart', async () => {
    const address = await native();
    const pair = service.getPair(address)!;
    const key = `fw:${accountStoreKey(pair)}`;
    const original = structuredClone(fixture.data[key]);
    const password = fixture.password;
    const authority = structuredClone(passwordRecord());
    let settled = false;
    const resetting = track(service.resetWallet()).then(result => { settled = true; return result; });
    await drain(false);
    expect(settled).toBe(false);
    expect(fixture.password).toBe(password);
    expect(passwordRecord()).toEqual(authority);
    expect(fixture.data[journalKey]).toBeUndefined();
    expect(fixture.data[key]).toEqual(original);
    expect(service.getPair(address)).toBe(pair);
    expect(service.hasMasterPassword).toBe(true);
    await drain();
    expect(await resetting).toEqual({ value: true });
    expect(passwordRecord()).toEqual({ version: 1, serialized: null });
    expect(fixture.data[key]).toBeUndefined();
    expect(service.getPair(address)).toBeNull();
    const restart = track(KeyringStoreWeb.initialize());
    await drain();
    expect(await restart).toHaveProperty('value');
    const read = vi.fn();
    new KeyringStoreWeb().get(read);
    expect(read).toHaveBeenCalledWith(null);
    expect(fixture.password).toBe(password);
    expect(fixture.bridge.mock.calls.every(([operation]) => operation === 'get')).toBe(true);
    const recovery = Object.entries(fixture.data).find(([key]) => key.startsWith('fw:deletedWallet:'))![1] as { accounts: Record<string, unknown> };
    expect(recovery.accounts[key.slice(3)]).toEqual(original);
  });

  it('aborts password removal and archival together, retains the original pair and retries', async () => {
    const address = await native();
    const pair = service.getPair(address)!;
    const key = `fw:${accountStoreKey(pair)}`;
    const original = structuredClone(fixture.data[key]);
    const authority = structuredClone(passwordRecord());
    fixture.failAccounts = true;
    const reset = track(service.resetWallet());
    await drain();
    expect(await reset).toEqual({ value: false });
    expect(passwordRecord()).toEqual(authority);
    expect(fixture.data[key]).toEqual(original);
    expect(Object.keys(fixture.data).filter(key => key.startsWith('fw:deletedWallet:'))).toEqual([]);
    expect(service.getPair(address)).toBe(pair);
    expect(service.hasMasterPassword).toBe(true);
    fixture.failAccounts = false;
    const retry = track(service.resetWallet());
    await drain();
    expect(await retry).toEqual({ value: true });
    expect(service.getPair(address)).toBeNull();
  });

  it('loads the retained interrupted-reset password without any window compensation write', async () => {
    const address = await native();
    const key = `fw:${accountStoreKey(service.getPair(address)!)}`;
    const original = structuredClone(fixture.data[key]);
    const password = fixture.password!;
    delete fixture.data[passwordKey];
    fixture.data[journalKey] = { serialized: password };
    fixture.password = null;
    fixture.failCompensation = true;
    const ready = track(KeyringStoreWeb.initialize());
    await drain();
    expect(await ready).toHaveProperty('value');
    expect(passwordRecord()).toEqual({ version: 1, serialized: password });
    expect(fixture.data[journalKey]).toEqual({ serialized: password });
    expect(fixture.data[key]).toEqual(original);
    expect(fixture.password).toBeNull();
    expect(KeyringStoreWeb.readOnly).toBe(false);
    const read = vi.fn();
    new KeyringStoreWeb().get(read);
    expect(read).toHaveBeenCalledWith(JSON.parse(password));
    expect(fixture.bridge.mock.calls.every(([operation]) => operation === 'get')).toBe(true);
  });

  it('keeps authenticated export available after failed migration, denies password/reset mutation, and repairs on reload', async () => {
    const address = await native();
    const password = fixture.password!;
    delete fixture.data[passwordKey];
    fixture.failMigration = true;
    const ready = track(KeyringStoreWeb.initialize());
    await drain();
    expect(await ready).toHaveProperty('value');
    expect(KeyringStoreWeb.readOnly).toBe(true);
    expect(fixture.data[passwordKey]).toBeUndefined();
    expect(fixture.password).toBe(password);
    const exported = await service.exportAccountMnemonic({ address, password: PASSWORD, walletEcosystem: WalletEcosystem.Substrate });
    expect(exported.seed).toBe(PHRASE);
    new KeyringStoreWeb().set({ passwordHash: 'replacement' });
    await expect(KeyringStoreWeb.flush()).rejects.toThrow('storage needs repair');
    const reset = track(service.resetWallet());
    await drain();
    expect(await reset).toEqual({ value: false });
    expect(service.getPair(address)).not.toBeNull();
    fixture.failMigration = false;
    const reload = track(KeyringStoreWeb.initialize());
    await drain();
    expect(await reload).toHaveProperty('value');
    expect(KeyringStoreWeb.readOnly).toBe(false);
    expect(passwordRecord()).toEqual({ version: 1, serialized: password });
  });

  it('uses a retained journal only for recovery while the legacy bridge is unavailable', async () => {
    const password = fixture.password!;
    delete fixture.data[passwordKey];
    fixture.data[journalKey] = { serialized: password };
    fixture.bridge.mockRejectedValue(new Error('Window unavailable'));
    const ready = track(KeyringStoreWeb.initialize());
    await drain();
    expect(await ready).toHaveProperty('value');
    expect(KeyringStoreWeb.readOnly).toBe(true);
    expect(fixture.data[passwordKey]).toBeUndefined();
    const read = vi.fn();
    new KeyringStoreWeb().get(read);
    expect(read).toHaveBeenCalledWith(JSON.parse(password));
    expect(fixture.data[journalKey]).toEqual({ serialized: password });
  });

  it('never infers absence from a failed IndexedDB read', async () => {
    fixture.bridge.mockClear();
    vi.spyOn(BaseWebStore.prototype, 'getAndWait').mockRejectedValue(new Error('Read unavailable'));
    await expect(KeyringStoreWeb.initialize()).rejects.toThrow('Read unavailable');
    expect(fixture.bridge).not.toHaveBeenCalled();
  });

  it('preserves malformed authoritative storage and does not fall back to a stale legacy password', async () => {
    fixture.data[passwordKey] = { version: 3, serialized: fixture.password };
    fixture.bridge.mockClear();
    const ready = track(KeyringStoreWeb.initialize());
    await drain();
    expect(await ready).toHaveProperty('error');
    expect(fixture.data[passwordKey]).toEqual({ version: 3, serialized: fixture.password });
    expect(fixture.bridge).not.toHaveBeenCalled();
  });
});
