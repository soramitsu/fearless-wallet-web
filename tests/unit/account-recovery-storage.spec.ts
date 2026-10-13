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
import { decryptTonSeed } from '@extension-base/services/keyring-service/TonSeedVault';
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
    password_store: { get: (callback) => callback(undefined), set: () => {}, remove: () => {} },
  });
  keyring.keyring.changeMasterPassword(PASSWORD);
  service = Object.create(KeyringService.prototype);
  Object.assign(service, { password: PASSWORD, tonKeyring: new TonKeyringService(service),
    currentAccountStore: new CurrentAccountStore(), currentAccountSubject: new BehaviorSubject(null),
    selectionRevision: 0, selectionRequestRevision: 0,
    accountAccess: { scheduleScan: vi.fn(), flagPreviousMasterPair: vi.fn() }, scheduleLegacyNetworkEnrollment: vi.fn() });
});
afterEach(async () => {
  fixture.failRead = fixture.failWrite = fixture.failRemove = fixture.failSelection = false;
  await drain();
  await Promise.all(pending);
  await BaseExtensionStore.flush().catch(() => undefined);
  vi.restoreAllMocks();
});

async function deleted(address: string) {
  const result = track(service.forgetAccount(address));
  await drain();
  expect(await result).toHaveProperty('value');
  const key = Object.keys(fixture.data).find((key) => key.startsWith('fw:deletedWallet:'))!;
  return { key, id: key.slice('fw:deletedWallet:'.length) };
}

describe('deleted wallet recovery with actual keyring and acknowledged Chrome storage', { timeout: 60_000 }, () => {
  it('waits for a preceding explicit import and keeps its newer encrypted record', async () => {
    const address = await native();
    const storageKey = accountStoreKey(service.getPair(address)!);
    const { id, key } = await deleted(address);
    const original = AccountsStore.prototype.getAndWait;
    let release!: () => void;
    let held = false;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(AccountsStore.prototype, 'getAndWait').mockImplementation(async function (this: AccountsStore, key) {
      const record = await original.call(this, key);
      if (key === storageKey && !held) { held = true; await gate; }
      return record;
    });
    const importing = track(service.addAccount(PHRASE, { name: 'Explicit new import' }, WalletEcosystem.Substrate, 'sr25519'));
    await drain();
    expect(held).toBe(true);
    const restoring = track(service.restoreDeletedWallet(id));
    try { await drain(); } finally { release(); }
    await drain();
    expect(await importing).toEqual({ value: address });
    expect(await restoring).toEqual({ value: { ok: false, code: 'already_in_wallet' } });
    expect(fixture.data[`fw:${storageKey}`].meta.name).toBe('Explicit new import');
    expect(service.getPair(address)?.meta.name).toBe('Explicit new import');
    expect(fixture.data[key]).toBeDefined();
  });

  it.each(['sr25519', 'ecdsa'] as const)('retries %s recovery after archive removal fails without leaving the restored key invisible', async (type) => {
    const address = await native(type);
    const storageKey = accountStoreKey(service.getPair(address)!);
    const original = structuredClone(fixture.data[`fw:${storageKey}`]);
    const { id, key } = await deleted(address);
    fixture.failRemove = true;
    const first = track(service.restoreDeletedWallet(id));
    await drain();
    expect(await first).toEqual({ value: { ok: false, code: 'storage_failed' } });
    expect(service.getPair(address)).toBeNull();
    expect(fixture.data[`fw:${storageKey}`]).toEqual(original);
    expect(fixture.data[key]).toBeDefined();
    fixture.failRemove = false;
    const retry = track(service.restoreDeletedWallet(id));
    await drain();
    expect(await retry).toHaveProperty('value.ok', true);
    expect(service.getPair(address)).not.toBeNull();
    expect(fixture.data[key]).toBeUndefined();
    expect(fixture.data[`fw:${storageKey}`]).toEqual(original);
    const pair = service.getPair(address)!;
    pair.decodePkcs8(PASSWORD);
    const proof = new TextEncoder().encode('Public restored account proof');
    expect(pair.verify(proof, pair.sign(proof), pair.publicKey)).toBe(true);
    pair.lock();
  });

  it('retries TON recovery after archive removal fails and publishes the exact encrypted seed', async () => {
    const address = await native('sr25519', WalletEcosystem.Ton);
    const original = structuredClone(fixture.data[`fw:ton:${address}`]);
    const { id, key } = await deleted(address);
    fixture.failRemove = true;
    const first = track(service.restoreDeletedWallet(id));
    await drain();
    expect(await first).toHaveProperty('value.ok', false);
    expect(service.tonKeyring.getAccount(address)).toBeUndefined();
    fixture.failRemove = false;
    const retry = track(service.restoreDeletedWallet(id));
    await drain();
    expect(await retry).toHaveProperty('value.ok', true);
    expect(service.tonKeyring.getAccount(address)).toBeDefined();
    expect(fixture.data[`fw:ton:${address}`]).toEqual(original);
    expect(fixture.data[key]).toBeUndefined();
    expect(await decryptTonSeed(original.cipherSeed, PASSWORD)).toBe(PHRASE);
  });

  it('publishes a recovered pair without a second unacknowledged account write', async () => {
    const address = await native();
    const storageKey = `fw:${accountStoreKey(service.getPair(address)!)}`;
    const { id } = await deleted(address);
    fixture.writeKeys = [];
    const result = track(service.restoreDeletedWallet(id));
    await drain();
    expect(await result).toHaveProperty('value.ok', true);
    expect(fixture.writeKeys.filter((keys) => keys.includes(storageKey))).toHaveLength(1);
  });

  it('keeps the whole recovery copy when a linked wallet was independently imported again', async () => {
    const address = await native();
    const linked = await native('ethereum');
    const saved = track(service.saveAccountMeta(address, { ethereumAddress: linked }));
    await drain();
    expect(await saved).toHaveProperty('value');
    const { id, key } = await deleted(address);
    expect(await native('ethereum')).toBe(linked);
    const snapshot = structuredClone(fixture.data);
    const result = track(service.restoreDeletedWallet(id));
    await drain();
    expect(await result).toEqual({ value: { ok: false, code: 'already_in_wallet' } });
    expect(fixture.data).toEqual(snapshot);
    expect(service.getPair(address)).toBeNull();
    expect(service.getPair(linked)).not.toBeNull();
    expect(fixture.data[key]).toBeDefined();
  });

  it('keeps the recovery copy and publishes nothing when the account write fails', async () => {
    const address = await native();
    const { id } = await deleted(address);
    const snapshot = structuredClone(fixture.data);
    fixture.failWrite = true;
    const result = track(service.restoreDeletedWallet(id));
    await drain();
    expect(await result).toEqual({ value: { ok: false, code: 'storage_failed' } });
    expect(fixture.data).toEqual(snapshot);
    expect(service.getPair(address)).toBeNull();
    expect(archives()).toHaveLength(1);
  });

  it('serializes duplicate restoration and reports success only once', async () => {
    const address = await native();
    const { id } = await deleted(address);
    const first = track(service.restoreDeletedWallet(id));
    const second = track(service.restoreDeletedWallet(id));
    await drain();
    expect(await first).toHaveProperty('value.ok', true);
    expect(await second).toEqual({ value: { ok: false, code: 'not_found' } });
  });
});
