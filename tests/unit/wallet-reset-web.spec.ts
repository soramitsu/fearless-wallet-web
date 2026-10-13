import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { keyring } from '@subwallet/ui-keyring';
import { BehaviorSubject } from 'rxjs';

const fixture = vi.hoisted(() => ({
  data: {} as Record<string, unknown>, password: null as string | null,
  commits: [] as Array<{ accountRemoval: () => boolean; finish: () => void }>,
  failJournal: false, failAccounts: false, failCompensation: false, failPasswordRemove: false,
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
import { retainWebResetPassword, WEB_RESET_PASSWORD_KEY } from '@extension-base/stores/WebResetPassword';
import { WalletEcosystem } from '@/interfaces';

const PASSWORD = 'Public web reset password';
const PHRASE = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';
const journalKey = `fw:${WEB_RESET_PASSWORD_KEY}`;
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
      if ((fixture.failAccounts && accountRemoval()) || (fixture.failJournal && Object.hasOwn(entries, journalKey))) {
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
  fixture.failJournal = fixture.failAccounts = fixture.failCompensation = fixture.failPasswordRemove = false;
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
  service = Object.create(KeyringService.prototype);
  Object.assign(service, { password: PASSWORD, tonKeyring: new TonKeyringService(service),
    currentAccountStore: new CurrentAccountStore(), currentAccountSubject: new BehaviorSubject(null),
    selectionRevision: 0, selectionRequestRevision: 0,
    accountAccess: { scheduleScan: vi.fn(), flagPreviousMasterPair: vi.fn(), reset: vi.fn(), cancelScan: vi.fn() },
    scheduleLegacyNetworkEnrollment: vi.fn() });
});
afterEach(async () => {
  fixture.failJournal = fixture.failAccounts = fixture.failCompensation = fixture.failPasswordRemove = false;
  await drain();
  await Promise.all(pending);
  await BaseWebStore.flush().catch(() => undefined);
  await KeyringStoreWeb.flush().catch(() => undefined);
  vi.restoreAllMocks();
});

describe('web reset across IndexedDB accounts and the window password bridge', { timeout: 60_000 }, () => {
  it('leaves the legacy window password untouched while account reset is held', async () => {
    await native();
    const password = fixture.password;
    const resetting = track(service.resetWallet());
    await drain(false);
    expect(fixture.password).toBe(password);
    expect(fixture.bridge.mock.calls.filter(([operation]) => operation === 'remove')).toEqual([]);
    await drain();
    expect(await resetting).toEqual({ value: true });
  });

  it('opens retained password state without needing a window compensation write', async () => {
    const password = fixture.password;
    fixture.data[journalKey] = { serialized: password };
    fixture.password = null;
    fixture.failCompensation = true;
    const ready = track(KeyringStoreWeb.initialize());
    await drain();
    expect(await ready).toHaveProperty('value');
    const read = vi.fn();
    new KeyringStoreWeb().get(read);
    expect(read).toHaveBeenCalledWith(JSON.parse(password!));
  });

  it('keeps memory and the recovery journal until the account transaction commits', async () => {
    const address = await native();
    const pair = service.getPair(address)!;
    const key = `fw:${accountStoreKey(pair)}`;
    const original = structuredClone(fixture.data[key]);
    const password = fixture.password;
    let settled = false;
    const resetting = track(service.resetWallet()).then((result) => { settled = true; return result; });
    await drain(false);
    expect(settled).toBe(false);
    expect(fixture.password).toBeNull();
    expect(fixture.data[journalKey]).toEqual({ serialized: password });
    expect(fixture.data[key]).toEqual(original);
    expect(service.getPair(address)).toBe(pair);
    expect(service.hasMasterPassword).toBe(true);
    await drain();
    expect(await resetting).toEqual({ value: true });
    expect(fixture.data[journalKey]).toBeUndefined();
    expect(fixture.data[key]).toBeUndefined();
    expect(service.getPair(address)).toBeNull();
    const restart = track(KeyringStoreWeb.initialize());
    await drain();
    expect(await restart).toHaveProperty('value');
    expect(fixture.password).toBeNull();
    const recovery = Object.entries(fixture.data).find(([key]) => key.startsWith('fw:deletedWallet:'))![1] as { accounts: Record<string, unknown> };
    expect(recovery.accounts[key.slice(3)]).toEqual(original);
  });

  it.each(['failJournal', 'failPasswordRemove', 'failAccounts'] as const)('retains the original password and encrypted account after %s, then retries', async (failure) => {
    const address = await native();
    const pair = service.getPair(address)!;
    const key = `fw:${accountStoreKey(pair)}`;
    const original = structuredClone(fixture.data[key]);
    const password = fixture.password;
    fixture[failure] = true;
    const reset = track(service.resetWallet());
    await drain();
    expect(await reset).toEqual({ value: false });
    expect(fixture.password).toBe(password);
    expect(fixture.data[key]).toEqual(original);
    expect(service.getPair(address)).toBe(pair);
    expect(service.hasMasterPassword).toBe(true);
    fixture[failure] = false;
    const retry = track(service.resetWallet());
    await drain();
    expect(await retry).toEqual({ value: true });
    expect(service.getPair(address)).toBeNull();
  });

  it('retries failed password compensation at startup before exposing any password state', async () => {
    const address = await native();
    const key = `fw:${accountStoreKey(service.getPair(address)!)}`;
    const original = structuredClone(fixture.data[key]);
    const password = fixture.password;
    fixture.failAccounts = fixture.failCompensation = true;
    const reset = track(service.resetWallet());
    await drain();
    expect(await reset).toEqual({ value: false });
    expect(fixture.password).toBeNull();
    expect(fixture.data[journalKey]).toEqual({ serialized: password });
    expect(fixture.data[key]).toEqual(original);
    const failedStartup = track(KeyringStoreWeb.initialize());
    await drain();
    expect(await failedStartup).toHaveProperty('error');
    expect(fixture.data[journalKey]).toEqual({ serialized: password });
    fixture.failCompensation = false;
    const retry = track(KeyringStoreWeb.initialize());
    await drain();
    expect(await retry).toHaveProperty('value');
    expect(fixture.password).toBe(password);
    expect(fixture.data[journalKey]).toBeUndefined();
    expect(fixture.data[key]).toEqual(original);
  });

  it('recovers an interruption after password removal and before the account transaction', async () => {
    await native();
    const password = fixture.password;
    const saved = track(retainWebResetPassword());
    await drain();
    expect(await saved).toHaveProperty('value');
    await KeyringStoreWeb.removeForReset();
    expect(fixture.password).toBeNull();
    const restart = track(KeyringStoreWeb.initialize());
    await drain();
    expect(await restart).toHaveProperty('value');
    expect(fixture.password).toBe(password);
    expect(fixture.data[journalKey]).toBeUndefined();
    expect(Object.keys(fixture.data).some((key) => key.startsWith('fw:account:'))).toBe(true);
  });
});
