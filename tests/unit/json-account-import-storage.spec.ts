import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import { encodePair } from '@subwallet/keyring/pair/encode';
import { decodePair } from '@subwallet/keyring/pair/decode';
import { base64Decode } from '@polkadot/util-crypto';
import { ethers } from 'ethers';
import { needsLegacyNetworkEnrollment } from '@extension-base/services/keyring-service/LegacyNetworkEnrollment';
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
vi.mock('@extension-base/services/keyring-service/LegacyNetworkEnrollment', async (original) => ({ ...(await original<Record<string, unknown>>()), enrollLegacyAccountNetworks: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));

import { KeyringService } from '@extension-base/services/keyring-service';
import { TonKeyringService } from '@extension-base/services/keyring-service/TonKeyring';
import { accountStorageKey } from '@extension-base/services/keyring-service/AccountMetadata';
import AccountsStore from '@extension-base/stores/Accounts';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import Extension from '@extension-base/background/handlers/Extension';
import type { KeyringPair$Json, KeypairType } from '@subwallet/keyring/types';
import { decodeMnemonicFromJsonBackup } from '@/util/keyringJson';

const P1 = 'Public local import password';
const P2 = 'Public rotated import password';
const PHRASE = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';
const observe = <T>(promise: Promise<T>) => promise.then((value) => ({ value }), (error) => ({ error }));
let service: KeyringService;
let extension: Extension;
let select: ReturnType<typeof vi.fn>;
let network: ReturnType<typeof vi.fn>;
let pending: Promise<unknown>[];

async function drain() {
  for (let i = 0; i < 20; i++) {
    fixture.writes.splice(0).forEach((finish) => finish());
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function begin(file: KeyringPair$Json, password = P2) {
  const result = observe(Promise.resolve().then(() => extension.jsonRestore({ file, password })));
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
  network = vi.fn();
  extension = Object.create(Extension.prototype);
  Object.assign(extension, { encodeAddress: keyring.encodeAddress.bind(keyring), decodeAddress: keyring.decodeAddress.bind(keyring), state: { keyringService: service, updateCurrentAccount: select, updateNetworkForNewWallet: network } });
});

afterEach(async () => {
  fixture.failWrite = false;
  fixture.failRead = false;
  await drain();
  await Promise.all(pending);
  await BaseExtensionStore.flush().catch(() => undefined);
  vi.restoreAllMocks();
});

function backup(type: KeypairType = 'sr25519', suri = PHRASE) {
  return keyring.createFromUri(suri, { name: 'Public JSON backup' }, type).toJson(P2);
}

describe('JSON backup import durability with real crypto and Chrome store', { timeout: 60_000 }, () => {
  it.each(['sr25519', 'ed25519', 'ecdsa', 'ethereum'] as const)('acknowledges encrypted %s storage before publishing or selecting', async (type) => {
    const file = backup(type);
    const original = structuredClone(file);
    const result = begin(file);
    await vi.waitFor(() => expect(fixture.writes.length).toBeGreaterThan(0));
    expect(keyring.getAccounts()).toEqual([]);
    expect(select).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
    await drain();
    const outcome = await result;
    expect(outcome).toHaveProperty('value');
    if (!('value' in outcome)) throw outcome.error;
    const pair = keyring.getPair(outcome.value);
    const stored = Object.values(fixture.data)[0];
    expect(stored.meta).toMatchObject({ isMasterPassword: true, isMasterAccount: true, name: 'Public JSON backup' });
    const reopened = keyring.createFromJson(stored);
    expect(() => reopened.decodePkcs8(P2)).toThrow();
    reopened.decodePkcs8(P1);
    expect(reopened.publicKey).toEqual(pair.publicKey);
    const proof = new TextEncoder().encode('Public JSON storage proof');
    expect(reopened.verify(proof, reopened.sign(proof), reopened.publicKey)).toBe(true);
    expect(reopened.exportMnemonic(P1)).toBe(PHRASE);
    expect(file).toEqual(original);
    expect(pair.isLocked).toBe(true);
  });

  it('rejects a failed storage write without publication, selection or losing retry', async () => {
    fixture.failWrite = true;
    const file = backup();
    const result = begin(file);
    await drain();
    expect(await result).toHaveProperty('error');
    expect(keyring.getAccounts()).toEqual([]);
    expect(select).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
    expect(fixture.data).toEqual({});
    fixture.failWrite = false;
    const retry = begin(file);
    await drain();
    expect(await retry).toHaveProperty('value');
    await expect(BaseExtensionStore.flush()).resolves.toBeUndefined();
  });

  it('rejects a failed durable read before publishing or writing', async () => {
    fixture.failRead = true;
    const result = begin(backup());
    await drain();
    const outcome = await result;
    expect(outcome).toHaveProperty('error');
    if ('error' in outcome) expect(outcome.error).toBeInstanceOf(Error);
    expect(fixture.writes).toEqual([]);
    expect(fixture.data).toEqual({});
    expect(keyring.getAccounts()).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it('retains the exact durable duplicate, original mnemonic and unknown metadata', async () => {
    const pair = keyring.createFromUri(PHRASE);
    const saved = pair.toJson(P1);
    saved.meta = { isMasterPassword: true, name: 'Durable owner', unknown: { retained: true } };
    fixture.data['fw:' + accountStorageKey(pair)] = saved;
    const original = structuredClone(fixture.data);
    const result = begin(backup());
    await drain();
    expect(await result).toHaveProperty('value');
    expect(fixture.data).toEqual(original);
    expect(keyring.getAccounts()[0].meta.name).toBe('Durable owner');
  });

  it('refuses to overwrite an unreadable existing mnemonic with an imported raw key', async () => {
    const pair = keyring.createFromUri(PHRASE);
    const saved = pair.toJson('Public old password');
    saved.meta.isMasterPassword = true;
    fixture.data['fw:' + accountStorageKey(pair)] = saved;
    const original = structuredClone(fixture.data);
    const decoded = decodePair(P2, base64Decode(backup().encoded), ['scrypt', 'xsalsa20-poly1305']);
    const file = backup();
    file.encoded = u8aToHex(encodePair({ ...decoded, entropy: undefined }, P2));
    const result = begin(file);
    await drain();
    expect(await result).toHaveProperty('error');
    expect(fixture.data).toEqual(original);
    expect(keyring.getAccounts()).toEqual([]);
  });

  it.each(['sr25519', 'ed25519', 'ecdsa', 'ethereum'] as const)('rejects a %s backup whose decrypted identity differs from its header', async (type) => {
    const file = backup(type, 'legal winner thank year wave sausage worth useful legal winner thank yellow');
    file.address = backup(type).address;
    const result = begin(file);
    await drain();
    expect(await result).toHaveProperty('error');
    expect(keyring.getAccounts()).toEqual([]);
    expect(fixture.data).toEqual({});
  });

  it.each(['sr25519', 'ed25519'] as const)('rejects inconsistent %s private/public material even when PKCS8 and JSON headers agree', async (type) => {
    const file = backup(type);
    const a = decodePair(P2, base64Decode(file.encoded), file.encoding.type);
    const other = backup(type, 'legal winner thank year wave sausage worth useful legal winner thank yellow');
    const b = decodePair(P2, base64Decode(other.encoded), other.encoding.type);
    file.encoded = u8aToHex(encodePair({ ...a, secretKey: b.secretKey }, P2));
    const result = begin(file);
    await drain();
    expect(await result).toHaveProperty('error');
    expect(keyring.getAccounts()).toEqual([]);
    expect(fixture.data).toEqual({});
  });

  it('retains a committed encrypted record but rejects selection after lock during a write', async () => {
    const result = begin(backup());
    await vi.waitFor(() => expect(fixture.writes.length).toBeGreaterThan(0));
    keyring.lockAll();
    Object.assign(service, { password: '' });
    await drain();
    expect(await result).toHaveProperty('error');
    expect(select).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
    expect(Object.values(fixture.data)).toHaveLength(1);
    expect(keyring.createFromJson(Object.values(fixture.data)[0]).exportMnemonic(P1)).toBe(PHRASE);
  });

  it('queues restore behind master-password rotation and uses the new password', async () => {
    const change = observe(service.changeMasterPassword({ newPassword: 'Public next master', oldPassword: P1 }));
    pending.push(change);
    const result = begin(backup());
    await drain();
    expect(await change).toEqual({ value: true });
    expect(await result).toHaveProperty('value');
    const pair = keyring.createFromJson(Object.values(fixture.data)[0]);
    expect(() => pair.decodePkcs8(P1)).toThrow();
    expect(pair.exportMnemonic('Public next master')).toBe(PHRASE);
  });
  it.each(['sr25519', 'ed25519', 'ecdsa', 'ethereum'] as const)('imports a raw %s JSON key without inventing a mnemonic', async (type) => {
    const file = backup(type);
    const decoded = decodePair(P2, base64Decode(file.encoded), file.encoding.type);
    file.encoded = u8aToHex(encodePair({ ...decoded, entropy: undefined }, P2));
    const result = begin(file);
    await drain();
    expect(await result).toHaveProperty('value');
    const saved = Object.values(fixture.data)[0];
    expect(saved.meta.isMasterAccount).toBe(false);
    const pair = keyring.createFromJson(saved);
    expect(() => pair.exportMnemonic(P1)).toThrow();
    pair.decodePkcs8(P1);
    const proof = new TextEncoder().encode('Public raw backup proof');
    expect(pair.verify(proof, pair.sign(proof), pair.publicKey)).toBe(true);
  });

  it('accepts a valid Ethereum backup with a 20-byte address header', async () => {
    const expected = keyring.createFromUri(PHRASE, {}, 'ethereum');
    const file = expected.toJson(P2);
    file.address = expected.address;
    const result = begin(file);
    await drain();
    expect(await result).toEqual({ value: expected.address });
    expect(Object.values(fixture.data)[0].meta.walletEcosystem).toBe('evm');
  });

  it('accepts a legacy Ed25519 backup without an algorithm declaration', async () => {
    const file = backup('ed25519');
    file.encoding = { ...file.encoding, version: '0', content: 'pkcs8' as unknown as string[] };
    const result = begin(file);
    await drain();
    expect(await result).toHaveProperty('value');
    expect(keyring.getPair(keyring.getAccounts()[0].address).type).toBe('ed25519');
    expect(keyring.createFromJson(Object.values(fixture.data)[0]).exportMnemonic(P1)).toBe(PHRASE);
  });

  it('accepts an unencrypted backup only after decoding and verifying its key', async () => {
    const file = keyring.createFromUri(PHRASE).toJson();
    const result = begin(file, '');
    await drain();
    expect(await result).toHaveProperty('value');
    const saved = Object.values(fixture.data)[0];
    expect(saved.encoding.type).toContain('xsalsa20-poly1305');
    expect(keyring.createFromJson(saved).exportMnemonic(P1)).toBe(PHRASE);
  });

  it.each(['', 'Public wrong backup password'])('rejects an encrypted backup with incorrect password %j', async (password) => {
    const result = begin(backup(), password);
    await drain();
    expect(await result).toHaveProperty('error');
    expect(keyring.getAccounts()).toEqual([]);
    expect(fixture.data).toEqual({});
    expect(select).not.toHaveBeenCalled();
  });

  it('does not mutate input metadata and clears external-only authority flags on the new local key', async () => {
    const file = backup();
    Object.assign(file.meta, { genesisHash: 'old genesis', isMobile: true, isExternal: true,
      isHardware: true, isInjected: true, isMasterPassword: false, isMasterAccount: false, unknown: { retained: true } });
    const original = structuredClone(file);
    const result = begin(file);
    await drain();
    expect(await result).toHaveProperty('value');
    expect(file).toEqual(original);
    const saved = Object.values(fixture.data)[0];
    expect(saved.meta).toMatchObject({ isMasterPassword: true, isMasterAccount: true, jsonBackupMeta: { unknown: { retained: true } } });
    for (const flag of ['genesisHash', 'isMobile', 'isExternal', 'isHardware', 'isInjected']) expect(saved.meta[flag]).toBeFalsy();
  });

  it('captures the input before waiting in the password queue', async () => {
    let release!: () => void;
    const blocker = service.tonKeyring.vault.exclusive(() => new Promise<void>((resolve) => { release = resolve; }));
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const file = backup();
    const result = observe(service.restoreAccount(file, P2));
    pending.push(result);
    file.address = backup('sr25519', 'legal winner thank year wave sausage worth useful legal winner thank yellow').address;
    file.meta.name = 'Mutated after request';
    release();
    await blocker;
    await drain();
    expect(await result).toEqual({ value: { address: keyring.createFromUri(PHRASE).address } });
    expect(Object.values(fixture.data)[0].meta.name).toBe('Public JSON backup');
  });

  it('rejects before decoding if the wallet locks while restore waits in the queue', async () => {
    let release!: () => void;
    const blocker = service.tonKeyring.vault.exclusive(() => new Promise<void>((resolve) => { release = resolve; }));
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const result = begin(backup());
    keyring.lockAll();
    Object.assign(service, { password: '' });
    release();
    await blocker;
    await drain();
    expect(await result).toHaveProperty('error');
    expect(keyring.getAccounts()).toEqual([]);
    expect(fixture.data).toEqual({});
  });

  it('serializes simultaneous JSON duplicates without replacing the first record', async () => {
    const file = backup();
    const first = begin(file);
    const other = structuredClone(file);
    other.meta.name = 'Second import';
    const second = begin(other);
    await drain();
    expect(await first).toEqual(await second);
    expect(Object.values(fixture.data)).toHaveLength(1);
    expect(Object.values(fixture.data)[0].meta.name).toBe('Public JSON backup');
  });

  it('routes an ethers keystore through acknowledged local import and preserves duplicate ciphertext', async () => {
    const wallet = new ethers.Wallet('0x' + '12'.repeat(32));
    const file = JSON.parse(ethers.encryptKeystoreJsonSync({ address: wallet.address, privateKey: wallet.privateKey }, P2, { scrypt: { N: 1024 } }));
    const result = begin(file);
    await vi.waitFor(() => expect(fixture.writes.length).toBeGreaterThan(0));
    expect(keyring.getAccounts()).toEqual([]);
    await drain();
    expect(await result).toEqual({ value: wallet.address });
    const original = structuredClone(fixture.data);
    const repeated = begin(file);
    await drain();
    expect(await repeated).toEqual({ value: wallet.address });
    expect(fixture.data).toEqual(original);
  });

  it.each(['sr25519', 'ed25519', 'ecdsa', 'ethereum'] as const)('does not advertise an unrelated embedded mnemonic in a %s JSON backup', async (type) => {
    const file = backup(type);
    const a = decodePair(P2, base64Decode(file.encoded), file.encoding.type);
    const other = backup(type, 'legal winner thank year wave sausage worth useful legal winner thank yellow');
    const b = decodePair(P2, base64Decode(other.encoded), other.encoding.type);
    file.encoded = u8aToHex(encodePair({ ...a, entropy: b.entropy }, P2));
    const result = begin(file);
    await drain();
    const outcome = await result;
    // A primary-only recovery may retain the material, but must not offer it as this wallet's phrase.
    if ('error' in outcome) return;
    const saved = Object.values(fixture.data)[0];
    expect(saved.meta.isMasterAccount).toBe(false);
    expect(() => service.exportMnemonic({ address: outcome.value, password: P1 })).toThrow();
    expect(() => decodeMnemonicFromJsonBackup(saved, P1)).toThrow();
    expect(needsLegacyNetworkEnrollment(keyring.getPair(outcome.value))).toBe(false);
    expect(decodePair(P1, base64Decode(saved.encoded), saved.encoding.type).entropy).toEqual(b.entropy);
  });

  it('does not let JSON metadata claim an unrelated existing Ethereum wallet or forged primary inventory', async () => {
    const independent = keyring.createFromUri('legal winner thank year wave sausage worth useful legal winner thank yellow', {}, 'ethereum');
    const installed = keyring.keyring.addFromJson(independent.toJson(P1));
    keyring.accounts.add({ all() {}, get() {}, remove() {}, set() {} }, installed.address, installed.publicKey, independent.toJson(P1), installed.type);
    const file = backup();
    file.meta.ethereumAddress = independent.address;
    file.meta.universalWallet = { publicAccounts: [{ accountId: 'substrate-default', address: independent.address, ecosystem: 'substrate', isDefault: true }] };
    const result = begin(file);
    await drain();
    expect(await result).toHaveProperty('value');
    const saved = Object.values(fixture.data)[0];
    expect(saved.meta.ethereumAddress).not.toBe(independent.address);
    expect(service.getAllMainAccounts().some(({ address }) => address === independent.address)).toBe(true);
    expect((saved.meta.universalWallet as { publicAccounts: Array<{ accountId: string; address: string }> }).publicAccounts.find(({ accountId }) => accountId === 'substrate-default')?.address)
      .toBe(keyring.createFromUri(PHRASE).address);
  });

  it.each(['sr25519', 'ed25519', 'ecdsa', 'ethereum'] as const)('preserves a legitimate custom-path %s backup as a primary-only key', async (type) => {
    const path = type === 'ethereum' ? "/m/44'/60'/0'/0/7" : '//custom';
    const file = backup(type, PHRASE + path);
    const expected = keyring.createFromUri(PHRASE + path, {}, type);
    const result = begin(file);
    await drain();
    expect(await result).toEqual({ value: expected.address });
    const saved = Object.values(fixture.data)[0];
    expect(saved.meta).toMatchObject({ isMasterAccount: false, isMnemonicUnverified: true });
    const restored = keyring.createFromJson(saved);
    restored.decodePkcs8(P1);
    const proof = new TextEncoder().encode('Public custom-path proof');
    expect(restored.verify(proof, restored.sign(proof), restored.publicKey)).toBe(true);
    expect(() => service.exportMnemonic({ address: expected.address, password: P1 })).toThrow();
    // Encrypted JSON remains a complete recovery copy, including the unverified ancestor entropy.
    expect(restored.exportMnemonic(P1)).toBe(PHRASE);
    const change = observe(service.changeMasterPassword({ oldPassword: P1, newPassword: 'Public custom rotated' }));
    pending.push(change);
    await drain();
    expect(await change).toEqual({ value: true });
    const rotated = Object.values(fixture.data)[0];
    expect(rotated.meta.isMnemonicUnverified).toBe(true);
    expect(keyring.createFromJson(rotated).exportMnemonic('Public custom rotated')).toBe(PHRASE);
    expect(() => decodeMnemonicFromJsonBackup(rotated, 'Public custom rotated')).toThrow();
  });

  it('allows an explicitly requested link to an acknowledged separately imported Ethereum key', async () => {
    const child = begin(backup('ethereum', 'legal winner thank year wave sausage worth useful legal winner thank yellow'));
    await drain();
    const imported = await child;
    if (!('value' in imported)) throw imported.error;
    const file = backup();
    const result = observe(extension.jsonRestore({ file, password: P2, linkedEthereumAddress: imported.value }));
    pending.push(result);
    await drain();
    expect(await result).toHaveProperty('value');
    const main = service.getAllMainAccounts();
    expect(main).toHaveLength(1);
    expect(main[0].meta.ethereumAddress).toBe(imported.value);
  });

  it('rejects an explicit EVM link that exists only in memory without a durable local key', async () => {
    const child = keyring.createFromUri(PHRASE, {}, 'ethereum');
    keyring.keyring.addFromJson(child.toJson(P1));
    const result = observe(extension.jsonRestore({ file: backup(), password: P2, linkedEthereumAddress: child.address }));
    pending.push(result);
    await drain();
    expect(await result).toHaveProperty('error');
    expect(fixture.data).toEqual({});
    expect(select).not.toHaveBeenCalled();
  });

  it.each(['ecdsa', 'ethereum'] as const)('rejects a raw %s PKCS8 public key mismatch even when the secret regenerates the JSON header', async (type) => {
    const file = backup(type);
    const a = decodePair(P2, base64Decode(file.encoded), file.encoding.type);
    const other = backup(type, 'legal winner thank year wave sausage worth useful legal winner thank yellow');
    const b = decodePair(P2, base64Decode(other.encoded), other.encoding.type);
    file.encoded = u8aToHex(encodePair({ ...a, publicKey: b.publicKey, entropy: undefined }, P2));
    const result = begin(file);
    await drain();
    expect(await result).toHaveProperty('error');
    expect(fixture.data).toEqual({});
    expect(keyring.getAccounts()).toEqual([]);
  });

  it('rejects an existing corrupted private key while retaining its exact encrypted duplicate record', async () => {
    const file = backup();
    const expected = keyring.createFromUri(PHRASE);
    const saved = expected.toJson(P1);
    const a = decodePair(P1, base64Decode(saved.encoded), saved.encoding.type);
    const other = backup('sr25519', 'legal winner thank year wave sausage worth useful legal winner thank yellow');
    const b = decodePair(P2, base64Decode(other.encoded), other.encoding.type);
    saved.encoded = u8aToHex(encodePair({ ...a, secretKey: b.secretKey }, P1));
    saved.meta.isMasterPassword = true;
    fixture.data['fw:' + accountStorageKey(expected)] = saved;
    const original = structuredClone(fixture.data);
    const result = begin(file);
    await drain();
    expect(await result).toHaveProperty('error');
    expect(fixture.data).toEqual(original);
    expect(keyring.getAccounts()).toEqual([]);
  });

});
