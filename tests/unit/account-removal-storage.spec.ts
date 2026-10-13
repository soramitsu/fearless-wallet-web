import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { keyring } from '@subwallet/ui-keyring';
import { addressKey } from '@subwallet/ui-keyring/defaults';

const fixture = vi.hoisted(() => ({
  data: {} as Record<string, any>,
  writes: [] as Array<() => void>,
  removals: [] as Array<{ keys: string[]; finish: () => void }>,
  failRead: false, failWrite: false, failRemove: false,
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
      fixture.writes.push(() => {
        fixture.runtime.lastError = fixture.failWrite ? { message: 'Recovery write failed' } : undefined;
        if (!fixture.failWrite) Object.assign(fixture.data, snapshot);
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
import { accountStoreKey, walletRecordKeys } from '@extension-base/services/keyring-service/DeletedWallets';
import AccountsStore from '@extension-base/stores/Accounts';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import Extension from '@extension-base/background/handlers/Extension';
import type { KeypairType } from '@subwallet/keyring/types';
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
async function mobile() {
  const pair = keyring.createFromUri('//Alice//removal-storage');
  const address = pair.address;
  pair.lock();
  const result = track(service.saveAddress(address, { name: 'Public mobile', isMobile: true, wcTopic: 'public-remove-topic' }, 'address'));
  await drain();
  expect(await result).toHaveProperty('value');
  return address;
}
const archives = () => Object.entries(fixture.data).filter(([key]) => key.startsWith('fw:deletedWallet:')).map(([, value]) => value);

beforeEach(async () => {
  await cryptoWaitReady();
  fixture.data = {};
  fixture.writes = [];
  fixture.removals = [];
  fixture.failRead = fixture.failWrite = fixture.failRemove = false;
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
    accountAccess: { scheduleScan: vi.fn(), flagPreviousMasterPair: vi.fn() }, scheduleLegacyNetworkEnrollment: vi.fn() });
});
afterEach(async () => {
  fixture.failRead = fixture.failWrite = fixture.failRemove = false;
  await drain();
  await Promise.all(pending);
  await BaseExtensionStore.flush().catch(() => undefined);
  vi.restoreAllMocks();
});

describe('acknowledged wallet removal with actual keyring and Chrome storage', { timeout: 60_000 }, () => {
  it('retains a mobile address and pending result until removal is acknowledged', async () => {
    const address = await mobile();
    let settled = false;
    const result = track(service.forgetAddress(address)).then((outcome) => { settled = true; return outcome; });
    await drain(false);
    expect(fixture.removals).toHaveLength(1);
    expect(settled).toBe(false);
    expect(service.getAddress(address)).toBeDefined();
    await drain();
    expect(await result).toHaveProperty('value');
    expect(service.getAddress(address)).toBeUndefined();
    expect(fixture.data[`fw:${addressKey(address)}`]).toBeUndefined();
  });

  it('rejects failed mobile removal, retains the live record and permits retry', async () => {
    const address = await mobile();
    fixture.failRemove = true;
    const result = track(service.forgetAddress(address));
    await drain();
    expect(await result).toHaveProperty('error');
    expect(service.getAddress(address)).toBeDefined();
    expect(fixture.data[`fw:${addressKey(address)}`]).toBeDefined();
    fixture.failRemove = false;
    const retry = track(service.forgetAddress(address));
    await drain();
    expect(await retry).toHaveProperty('value');
    expect(service.getAddress(address)).toBeUndefined();
  });

  it.each(['sr25519', 'ecdsa', 'ethereum'] as const)('keeps %s keys live until acknowledged, with an exact recovery copy first', async (type) => {
    const address = await native(type);
    const pair = service.getPair(address)!;
    const key = accountStoreKey(pair);
    const original = structuredClone(fixture.data[`fw:${key}`]);
    let settled = false;
    const result = track(service.forgetAccount(address)).then((outcome) => { settled = true; return outcome; });
    await drain(false);
    expect(fixture.removals).toHaveLength(1);
    expect(settled).toBe(false);
    expect(service.getPair(address)).toBe(pair);
    expect(archives().some((wallet) => JSON.stringify(wallet.accounts[key]) === JSON.stringify(original))).toBe(true);
    await drain();
    expect(await result).toHaveProperty('value');
    expect(service.getPair(address)).toBeNull();
    expect(fixture.data[`fw:${key}`]).toBeUndefined();
    const copy = archives().find((wallet) => wallet.accounts[key])!.accounts[key];
    const restored = keyring.createFromJson(copy);
    restored.decodePkcs8(PASSWORD);
    const payload = new TextEncoder().encode('Public removal recovery proof');
    expect(restored.verify(payload, restored.sign(payload), restored.publicKey)).toBe(true);
    restored.lock();
  });

  it('does not delete anything if archiving fails', async () => {
    const address = await native();
    const pair = service.getPair(address);
    const original = structuredClone(fixture.data);
    fixture.failWrite = true;
    const result = track(service.forgetAccount(address));
    await drain();
    expect(await result).toHaveProperty('error');
    expect(fixture.data).toEqual(original);
    expect(service.getPair(address)).toBe(pair);
  });

  it('retains live native keys when removal fails after archiving', async () => {
    const address = await native();
    const pair = service.getPair(address)!;
    fixture.failRemove = true;
    const result = track(service.forgetAccount(address));
    await drain();
    expect(await result).toHaveProperty('error');
    expect(service.getPair(address)).toBe(pair);
    expect(archives()[0].accounts[accountStoreKey(pair)]).toEqual(fixture.data[`fw:${accountStoreKey(pair)}`]);
  });

  it('archives and removes all primary, linked EVM and legacy ECDSA records in one removal call', async () => {
    const address = await native('ecdsa');
    const linked = await native('ethereum');
    const saved = track(service.saveAccountMeta(address, { ethereumAddress: linked }));
    await drain();
    expect(await saved).toHaveProperty('value');
    const pairs = [service.getPair(address)!, service.getPair(linked)!];
    const keys = walletRecordKeys(pairs);
    for (const key of keys) fixture.data[`fw:${key}`] ??= structuredClone(fixture.data[`fw:${accountStoreKey(pairs[0])}`]);
    const original = Object.fromEntries(keys.map((key) => [key, structuredClone(fixture.data[`fw:${key}`])]));
    const result = track(service.forgetAccount(address));
    await drain(false);
    expect(fixture.removals).toHaveLength(1);
    expect(fixture.removals[0].keys.sort()).toEqual(keys.map((key) => `fw:${key}`).sort());
    expect(archives()[0].accounts).toEqual(original);
    await drain();
    expect(await result).toHaveProperty('value');
    expect(service.getPair(address)).toBeNull();
    expect(service.getPair(linked)).toBeNull();
  });

  it('preserves the TON subject snapshot and both ciphertext copies on failed removal', async () => {
    const address = await native('sr25519', WalletEcosystem.Ton);
    const previous = service.tonKeyring.accountSubject.value;
    const original = structuredClone(fixture.data[`fw:ton:${address}`]);
    fixture.data[`fw:ton:${address}`].pendingCipherSeed = original.cipherSeed;
    fixture.failRemove = true;
    const result = track(service.forgetAccount(address));
    await drain();
    expect(await result).toHaveProperty('error');
    expect(previous[address]).toBeDefined();
    expect(service.tonKeyring.accountSubject.value[address]).toBe(previous[address]);
    expect(archives()[0].ton).toEqual({ ...original, pendingCipherSeed: original.cipherSeed });
  });

  it('awaits actual mobile removal in the message handler before cleanup or success', async () => {
    const address = await mobile();
    const cleanup = vi.fn();
    const extension = Object.create(Extension.prototype);
    Object.assign(extension, { state: { keyringService: service, currentAccount: null,
      requestService: { mutateAuthorizations: async (mutate: (auth: object) => void) => mutate({}) },
      walletConnectDappService: { disconnect: vi.fn().mockResolvedValue(undefined) }, cleanupDeletedAccount: cleanup } });
    let settled = false;
    const result = track(extension.accountsForget({ address, type: 'mobile' })).then((outcome) => { settled = true; return outcome; });
    await drain(false);
    expect(fixture.removals).toHaveLength(1);
    expect(settled).toBe(false);
    expect(cleanup).not.toHaveBeenCalled();
    await drain();
    expect(await result).toEqual({ value: true });
    expect(cleanup).toHaveBeenCalledWith(address);
  });
});
