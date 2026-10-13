import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { keyring } from '@subwallet/ui-keyring';
import { BehaviorSubject } from 'rxjs';

const fixture = vi.hoisted(() => ({
  data: {} as Record<string, KeyringPairJson & { accounts: Record<string, KeyringPairJson>; ton: TonStoreAccount; cipherSeed: string; pendingCipherSeed?: string }>,
  writes: [] as Array<() => void>,
  writeKeys: [] as string[][],
  removals: [] as Array<{ keys: string[]; finish: () => void }>,
  failRead: false, failWrite: false, failRemove: false, failSelection: false,
  runtime: { lastError: undefined as { message: string } | undefined, getURL: (path: string) => path },
}));
vi.mock('@subwallet/keyring/pair/nobody', () => ({ nobody: () => { throw new Error('Unused development pair'); } }));
vi.mock('@/consts/global', async (original) => ({ ...(await original<Record<string, unknown>>()), IS_EXTENSION: true }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {
  runtime: fixture.runtime,
  storage: { local: {
    get: (_keys: unknown, callback: (data: typeof fixture.data) => void) => {
      fixture.runtime.lastError = fixture.failRead ? { message: 'Removal read failed' } : undefined;
      callback(structuredClone(fixture.data));
      fixture.runtime.lastError = undefined;
    },
    set: (data: typeof fixture.data, callback: () => void) => {
      const snapshot = structuredClone(data);
      fixture.writeKeys.push(Object.keys(snapshot));
      fixture.writes.push(() => {
        const failed = fixture.failWrite || (fixture.failSelection && Object.hasOwn(snapshot, 'fwcurrent_account:CurrentAccountInfo'));
        fixture.runtime.lastError = failed ? { message: 'Recovery write failed' } : undefined;
        if (!failed) Object.assign(fixture.data, snapshot);
        callback();
        fixture.runtime.lastError = undefined;
      });
    },
    remove: (keys: string | string[], callback: () => void) => {
      const snapshot = typeof keys === 'string' ? [keys] : [...keys];
      fixture.removals.push({ keys: snapshot, finish: () => {
        fixture.runtime.lastError = fixture.failRemove ? { message: 'Removal failed' } : undefined;
        if (!fixture.failRemove) snapshot.forEach((key) => delete fixture.data[key]);
        callback();
        fixture.runtime.lastError = undefined;
      } });
    },
  } },
} }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@extension-base/services/keyring-service/LegacyNetworkEnrollment', () => ({ enrollLegacyAccountNetworks: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));

import { KeyringService } from '@extension-base/services/keyring-service';
import { TonKeyringService } from '@extension-base/services/keyring-service/TonKeyring';
import { accountStoreKey } from '@extension-base/services/keyring-service/DeletedWallets';
import AccountsStore from '@extension-base/stores/Accounts';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import CurrentAccountStore from '@extension-base/stores/CurrentAccountStore';
import KeyringStore from '@extension-base/stores/KeyringStore';
import type { TonStoreAccount } from '@extension-base/stores/TonStore';
import type { KeyringPair$Json as KeyringPairJson, KeypairType } from '@subwallet/keyring/types';
import { WalletEcosystem } from '@/interfaces';

const PASSWORD = 'Public removal fixture password';
const PHRASE = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';
let service: KeyringService;
let pending: Promise<unknown>[];
function track<T>(promise: Promise<T> | T) {
  const result = Promise.resolve(promise).then((value) => ({ value }), (error) => ({ error }));
  pending.push(result);
  return result;
}
async function drain(remove = true) {
  for (let i = 0; i < 20; i++) {
    fixture.writes.splice(0).forEach((finish) => finish());
    if (remove) fixture.removals.splice(0).forEach(({ finish }) => finish());
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
async function native(type: KeypairType = 'sr25519', ecosystem = WalletEcosystem.Substrate) {
  const result = track(service.addAccount(PHRASE, { name: 'Public removal wallet' }, ecosystem, type));
  await drain();
  const outcome = await result;
  if (!('value' in outcome)) throw outcome.error;
  return outcome.value;
}
const archives = () => Object.entries(fixture.data).filter(([key]) => key.startsWith('fw:deletedWallet:')).map(([, value]) => value);

beforeEach(async () => {
  await cryptoWaitReady();
  fixture.data = {};
  fixture.writes = [];
  fixture.writeKeys = [];
  fixture.removals = [];
  fixture.failRead = fixture.failWrite = fixture.failRemove = fixture.failSelection = false;
  pending = [];
  for (const subject of [keyring.accounts, keyring.addresses, keyring.contracts]) {
    for (const address of Object.keys(subject.subject.value)) subject.removeSubjectOnly(address);
  }
  vi.spyOn(keyring.keyringOption, 'init').mockImplementation(() => {});
  keyring.loadAll({ type: 'sr25519', isDevelopment: false, store: new AccountsStore(),
    password_store: new KeyringStore(),
  });
  keyring.changeMasterPassword(PASSWORD);
  await drain();
  service = Object.create(KeyringService.prototype);
  Object.assign(service, { password: PASSWORD, tonKeyring: new TonKeyringService(service),
    currentAccountStore: new CurrentAccountStore(), currentAccountSubject: new BehaviorSubject(null),
    selectionRevision: 0, selectionRequestRevision: 0,
    accountAccess: { scheduleScan: vi.fn(), flagPreviousMasterPair: vi.fn(), reset: vi.fn(), cancelScan: vi.fn() }, scheduleLegacyNetworkEnrollment: vi.fn() });
});
afterEach(async () => {
  fixture.failRead = fixture.failWrite = fixture.failRemove = fixture.failSelection = false;
  await drain();
  await Promise.all(pending);
  await BaseExtensionStore.flush().catch(() => undefined);
  vi.restoreAllMocks();
});

describe('acknowledged whole-wallet reset with retained keys', { timeout: 60_000 }, () => {
  it('waits for storage before reporting reset or clearing the master password and live pair', async () => {
    const address = await native();
    const pair = service.getPair(address)!;
    let settled = false;
    const result = track(service.resetWallet()).then((outcome) => { settled = true; return outcome; });
    await drain(false);
    expect(settled).toBe(false);
    expect(service.hasMasterPassword).toBe(true);
    expect(service.getPair(address)).toBe(pair);
    await drain();
    expect(await result).toEqual({ value: true });
    expect(service.hasMasterPassword).toBe(false);
    expect(fixture.data['fw:keyring']).toBeUndefined();
    expect(service.getPair(address)).toBeNull();
  });

  it.each(['sr25519', 'ecdsa', 'ethereum'] as const)('keeps exact %s encrypted records in recoverable archives after reset', async (type) => {
    const address = await native(type);
    const storageKey = accountStoreKey(service.getPair(address)!);
    const original = structuredClone(fixture.data[`fw:${storageKey}`]);
    const result = track(service.resetWallet());
    await drain();
    expect(await result).toEqual({ value: true });
    expect(fixture.data[`fw:${storageKey}`]).toBeUndefined();
    expect(archives().some((entry) => JSON.stringify(entry.accounts[storageKey]) === JSON.stringify(original))).toBe(true);
    const listed = track(service.getDeletedWallets());
    await drain();
    expect(await listed).toHaveProperty('value', expect.arrayContaining([expect.objectContaining({ address })]));
  });

  it('leaves the master password, stored keys and live wallets intact when the recovery write fails', async () => {
    const address = await native();
    const snapshot = structuredClone(fixture.data);
    const pair = service.getPair(address)!;
    fixture.failWrite = true;
    const result = track(service.resetWallet());
    await drain();
    expect(await result).toEqual({ value: false });
    expect(fixture.data).toEqual(snapshot);
    expect(service.hasMasterPassword).toBe(true);
    expect(service.getPair(address)).toBe(pair);
  });

  it('reports failed deletion and keeps live keys available for an acknowledged retry', async () => {
    const address = await native();
    const pair = service.getPair(address)!;
    fixture.failRemove = true;
    const result = track(service.resetWallet());
    await drain();
    expect(await result).toEqual({ value: false });
    expect(service.hasMasterPassword).toBe(true);
    expect(service.getPair(address)).toBe(pair);
    fixture.failRemove = false;
    const retry = track(service.resetWallet());
    await drain();
    expect(await retry).toEqual({ value: true });
    expect(service.getPair(address)).toBeNull();
    expect(archives()).not.toHaveLength(0);
  });

  it('clears the selected identity durably while retaining existing TON records', async () => {
    const address = await native();
    const ton = await native('sr25519', WalletEcosystem.Ton);
    const tonRecord = structuredClone(fixture.data[`fw:ton:${ton}`]);
    const selection = track(service.setCurrentAccount({ address, name: 'Selected public wallet', ethereumAddress: '', isMobile: false, walletEcosystem: WalletEcosystem.Substrate }));
    await drain();
    expect(await selection).toHaveProperty('value');
    const result = track(service.resetWallet());
    await drain();
    expect(await result).toEqual({ value: true });
    expect(service.currentAccountSubject.value).toBeNull();
    expect(fixture.data['fwcurrent_account:CurrentAccountInfo']).toBeNull();
    expect(fixture.data[`fw:ton:${ton}`]).toEqual(tonRecord);
  });

  it('waits for an earlier import and archives its key before completing reset', async () => {
    const pair = keyring.createFromUri(PHRASE, {}, 'sr25519');
    const address = pair.address;
    const storageKey = accountStoreKey(pair);
    pair.lock();
    const original = AccountsStore.prototype.getAndWait;
    let release!: () => void;
    let held = false;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(AccountsStore.prototype, 'getAndWait').mockImplementation(async function (this: AccountsStore, key) {
      const record = await original.call(this, key);
      if (key === storageKey && !held) { held = true; await gate; }
      return record;
    });
    const importing = track(service.addAccount(PHRASE, { name: 'Imported before reset' }, WalletEcosystem.Substrate, 'sr25519'));
    await drain();
    expect(held).toBe(true);
    const resetting = track(service.resetWallet());
    try { await drain(); } finally { release(); }
    await drain();
    expect(await importing).toEqual({ value: address });
    expect(await resetting).toEqual({ value: true });
    expect(service.getPair(address)).toBeNull();
    expect(archives().some((entry) => entry.accounts[storageKey]?.meta.name === 'Imported before reset')).toBe(true);
  });
});
