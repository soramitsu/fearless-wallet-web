// AUDIT-02, ported from 3.0.6's tests/unit/hotfix-3.0.6-ton-migration.spec.ts to this version's TON storage
// (TonSeedVault.ts). 3.0.6 replaces the CryptoJS records of 3.0.1-3.0.5 (version 1) with version 2, or keeps a record
// left under an earlier password inside version 3; 4.2.0 does the same for wallets coming straight from 3.0.5, in
// the check after unlock, and must never lose a phrase or keep the wallet closed on the way. Starts from the records
// 3.0.5 wrote (tests/fixtures/3.0.5). Where 4.2.0 behaves differently from 3.0.6 by design, the test says so.
import CryptoJS from 'crypto-js';
import { Keyring as DetachedKeyring } from '@subwallet/keyring/keyring';
import { stringToU8a, u8aConcat } from '@polkadot/util';
import { jsonEncrypt, jsonEncryptFormat, naclEncrypt, scryptEncode, scryptToU8a } from '@polkadot/util-crypto';
import * as tonWebMnemonic from 'tonweb-mnemonic';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tonStore } from '@extension-base/stores/TonStore';
import { KeyringService } from '@extension-base/services/keyring-service';
import {
  decryptTonSeed,
  encryptTonSeed,
  isLegacyTonSeed,
  readTonRecoveryRecord,
} from '@extension-base/services/keyring-service/TonSeedVault';
import fixture from '../fixtures/3.0.5/ton-accounts.json';
import type { KeyringPasswordJson } from '@subwallet/keyring/types';
import type { TonStoreAccount } from '@extension-base/stores/TonStore';
import { createTonWalletContractV4R2 } from '@/util/tonKeyring';
import { WalletEcosystem } from '@/interfaces';

const mocks = vi.hoisted(() => ({
  records: new Map<string, TonStoreAccount>(),
  other: {} as Record<string, unknown>,
  failWrites: false,
  beforeWrite: undefined as undefined | (() => Promise<void>),
  keyring: { hash: '', master: '' },
  passwordRecord: undefined as KeyringPasswordJson | undefined,
  prompt: new Map<string, unknown>(),
}));

// An in-memory chrome.storage double for `fw:ton:*` that, like BaseExtensionStore.updateAndWait,
// hands the transform a copy of the stored record and publishes only after the write.
vi.mock('@extension-base/stores/TonStore', () => {
  const copy = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

  return {
    tonStore: {
      readAll: async () => [...mocks.records.values()].map((record) => structuredClone(record)),
      all: async (update: (address: string, record: TonStoreAccount) => void) => {
        await Promise.resolve();
        for (const [address, record] of mocks.records) update(address, copy(record));
      },
      getAndWait: vi.fn(async (address: string) => copy(mocks.records.get(address))),
      updateAndWait: vi.fn(async (address: string, transform, publish?: (record: TonStoreAccount) => void) => {
        const next = transform(copy(mocks.records.get(address)));
        if (next === undefined) return undefined;
        await mocks.beforeWrite?.();
        if (mocks.failWrites) throw new Error('disk unavailable');
        mocks.records.set(address, copy(next));
        publish?.(copy(next));
        return next;
      }),
    },
  };
});
// Master password state as @subwallet/keyring keeps it: a password hash (here the password itself)
// and the unlocked master password.
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {
  keyring: {
    get hasMasterPassword() { return !!mocks.keyring.hash; },
    get isLocked() { return !mocks.keyring.master; },
    setupMasterPassword: (hash: string) => { mocks.keyring.hash = hash; },
    resetPassword: () => { mocks.keyring.hash = ''; mocks.keyring.master = ''; },
  },
  accounts: { subject: { value: {} }, removeSubjectOnly: () => {} },
  addresses: { subject: { value: {} }, removeSubjectOnly: () => {} },
  contracts: { subject: { value: {} }, removeSubjectOnly: () => {} },
  getAccounts: () => [],
  getAddresses: () => [],
  getPair: () => { throw new Error('Missing pair'); },
  unlockKeyring: (password: string) => {
    const verifier = new DetachedKeyring();
    verifier.setupMasterPassword(mocks.passwordRecord?.passwordHash);
    verifier.unlockKeyring(password);
    mocks.keyring.hash = password;
    mocks.keyring.master = password;
  },
  lockAll: () => { mocks.keyring.master = ''; },
} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@extension-base/stores/CurrentAccountStore', () => ({ default: class {
  async select(next: unknown, publish: (value: unknown) => void) { publish(next); }
} }));
// The account store as the keyring service uses it for one-batch writes: the password record, `ton:*`, and
// everything else (deleted wallets) in `mocks.other`.
vi.mock('@extension-base/stores/Accounts', () => {
  const snapshot = (): Record<string, unknown> => ({
    ...structuredClone(mocks.other),
    ...(mocks.passwordRecord ? { keyring: structuredClone(mocks.passwordRecord) } : {}),
    ...Object.fromEntries([...mocks.records].map(([address, record]) => [`ton:${address}`, structuredClone(record)])),
  });
  return { default: class {
    async allMap(update: (records: Record<string, unknown>) => void) { update(snapshot()); }
    async getAndWait(key: string) { return snapshot()[key]; }
    async mutateRecordsAndWait(_keys: string[] | null, transform: (current: Record<string, unknown>) => {
      entries: Record<string, unknown>; remove: string[];
    }, publish?: () => void) {
      const { entries, remove } = transform(snapshot());
      await mocks.beforeWrite?.();
      if (mocks.failWrites) throw new Error('disk unavailable');
      for (const [key, value] of Object.entries(entries)) {
        if (key === 'keyring') mocks.passwordRecord = structuredClone(value) as KeyringPasswordJson;
        else if (key.startsWith('ton:')) mocks.records.set(key.slice(4), structuredClone(value) as TonStoreAccount);
        else mocks.other[key] = structuredClone(value);
      }
      for (const key of remove) {
        if (key === 'keyring') mocks.passwordRecord = undefined;
        else if (key.startsWith('ton:')) mocks.records.delete(key.slice(4));
        else delete mocks.other[key];
      }
      publish?.();
    }
  } };
});
vi.mock('@extension-base/stores/KeyringStore', () => ({ default: class {} }));
vi.mock('@extension-base/stores/KeyringStoreWeb', () => ({ default: class {} }));
vi.mock('@extension-base/stores/LegacyPasswordPromptStore', () => ({ default: class {
  getAndWait = async (key: string) => mocks.prompt.get(key);
  setAndWait = async (key: string, value: unknown) => { mocks.prompt.set(key, value); };
  remove = (key: string) => { mocks.prompt.delete(key); };
} }));
vi.mock('@extension-base/services/keyring-service/LegacyNetworkEnrollment', () => ({ enrollLegacyAccountNetworks: vi.fn() }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));

// tonweb derives native and 3.0.x keys with 100 000 PBKDF2 rounds per check.
const PBKDF2_SUITE = { timeout: 120_000 };
// The 3.0.5 records are under the fixture's password; LATER stands for a master password set afterwards in 3.0.5,
// which never re-encrypted TON phrases. All test-only.
const P305 = fixture.password;
const LATER = 'test-only later master password';
const NEXT = 'test-only next master password';
const [NATIVE, BIP39] = fixture.accounts;

const records305 = () => fixture.accounts.map(({ stored }) => structuredClone(stored) as TonStoreAccount);
const stored = (address: string) => mocks.records.get(address)!;
const keyOf = (address: string) => Buffer.from(stored(address).publicKeyHex, 'hex');
const version = (cipherSeed: string) => (cipherSeed.startsWith('{') ? JSON.parse(cipherSeed).version : 1);
const storedVersions = () => [...mocks.records.values()].map(({ cipherSeed }) => version(cipherSeed));
const keptForRecovery = (address: string, password: string) =>
  readTonRecoveryRecord(stored(address).cipherSeed, password, { address, publicKey: keyOf(address) });
const snapshot = () => JSON.stringify([...mocks.records]);

// A fresh service worker over the stored records, with the keyring's password record set to `password`.
async function wallet(password: string, records?: TonStoreAccount[]) {
  if (records) mocks.records = new Map(records.map((value) => [value.address, value]));
  mocks.keyring.hash = password;
  mocks.passwordRecord = new DetachedKeyring().changeMasterPassword(password);
  mocks.keyring.master = '';
  const service = new KeyringService({ waitCryptoReady: new Promise(() => {}) } as never);
  await service.tonKeyring.loadAll();

  return service;
}

async function unlocked(password: string, records?: TonStoreAccount[]) {
  const service = await wallet(password, records);

  expect(service.unlockKeyring({ password })).toBe(true);
  await service.waitForAccessScan();

  return service;
}

const exportTon = async (service: KeyringService, address: string, password: string) =>
  (await service.exportAccountMnemonic({ address, password, walletEcosystem: WalletEcosystem.Ton })).seed;
const recover = (service: KeyringService, address: string, password: string) =>
  service.recoverAccountWithPassword({ address, walletEcosystem: WalletEcosystem.Ton, password });
const issues = async (service: KeyringService) => (await service.getAccessStatus()).issues.map(({ address }) => address);

beforeEach(() => {
  vi.mocked(tonStore.updateAndWait).mockClear();
  mocks.other = {};
  mocks.failWrites = false;
  mocks.beforeWrite = undefined;
  mocks.prompt.clear();
});

describe('TON storage encryption and the move from the 3.0.5 format', PBKDF2_SUITE, () => {
  it('writes authenticated, randomly salted encryption at 3.0.6\'s cost and refuses wrong or empty passwords', async () => {
    const key = Buffer.from(NATIVE.stored.publicKeyHex, 'hex');
    const first = encryptTonSeed(NATIVE.phrase, P305);
    const second = encryptTonSeed(NATIVE.phrase, P305);
    const bytes = Buffer.from(JSON.parse(first).encoded, 'base64');

    expect(first === second).toBe(false);
    expect(isLegacyTonSeed(first)).toBe(false);
    expect(JSON.parse(first)).toMatchObject({
      version: 2,
      encoding: { content: ['ton-mnemonic'], type: ['scrypt', 'xsalsa20-poly1305'], version: '3' },
    });
    expect([bytes.readUInt32LE(32), bytes.readUInt32LE(36), bytes.readUInt32LE(40)]).toEqual([1 << 15, 1, 8]);
    expect((await decryptTonSeed(first, P305, key)) === NATIVE.phrase).toBe(true);
    expect(await decryptTonSeed(first, 'incorrect test password', key)).toBeUndefined();
    expect(await decryptTonSeed(first, '', key)).toBeUndefined();
    expect(() => encryptTonSeed(NATIVE.phrase, '')).toThrow();
  });

  it('rejects ciphertext tampering, unknown versions, plaintext envelopes and KDF parameter injection', async () => {
    const key = Buffer.from(NATIVE.stored.publicKeyHex, 'hex');
    const valid = JSON.parse(encryptTonSeed(NATIVE.phrase, P305));
    const tampered = Buffer.from(valid.encoded, 'base64');
    const downgraded = Buffer.from(valid.encoded, 'base64');
    // A cost neither the deployed nor later supported release formats accept.
    const { params, password, salt } = scryptEncode(P305, undefined, { N: 1 << 16, p: 1, r: 8 });
    const { encrypted, nonce } = naclEncrypt(stringToU8a(NATIVE.phrase), password.subarray(0, 32));
    const otherCost = jsonEncryptFormat(u8aConcat(scryptToU8a(salt, params), nonce, encrypted), ['ton-mnemonic'], true);

    tampered[tampered.length - 1] ^= 1;
    downgraded.writeUInt32LE(1, 32);

    for (const cipherSeed of [
      JSON.stringify({ ...valid, encoded: tampered.toString('base64') }),
      JSON.stringify({ ...valid, version: 3 }),
      JSON.stringify({ ...valid, version: 4 }),
      JSON.stringify({ ...valid, encoding: { ...valid.encoding, type: ['none'] } }),
      JSON.stringify({ version: 2, ...jsonEncrypt(stringToU8a(NATIVE.phrase), ['ton-mnemonic']) }),
      JSON.stringify({ ...valid, encoded: downgraded.toString('base64') }),
      JSON.stringify({ version: 2, ...otherCost }),
      '{malformed',
      'unsupported-format',
    ]) {
      expect(await decryptTonSeed(cipherSeed, P305, key)).toBeUndefined();
    }
  });

  it('moves every native and BIP39 account to version 2 at unlock and reads them after a restart', async () => {
    const service = await unlocked(P305, records305());

    expect(tonStore.updateAndWait).toHaveBeenCalledTimes(2);
    expect(storedVersions()).toEqual([2, 2]);
    expect(await issues(service)).toEqual([]);

    const restarted = await wallet(P305);
    expect(restarted.unlockKeyring({ password: P305 })).toBe(true);

    for (const { phrase, stored: written } of fixture.accounts) {
      expect((await exportTon(restarted, written.address, P305)) === phrase).toBe(true);
      expect(restarted.tonKeyring.accountSubject.value[written.address].name).toBe(written.name);
      expect(Buffer.from(restarted.tonKeyring.accountSubject.value[written.address].publicKey).toString('hex')).toBe(
        written.publicKeyHex
      );
    }

    const before = snapshot();
    vi.mocked(tonStore.updateAndWait).mockClear();
    await restarted.waitForAccessScan();
    expect(tonStore.updateAndWait).not.toHaveBeenCalled();
    expect(snapshot() === before).toBe(true);
  });

  it('keeps every 3.0.5 record and in-memory value when the write fails, and moves them at the next unlock', async () => {
    const service = await wallet(P305, records305());
    const before = snapshot();

    mocks.failWrites = true;
    expect(service.unlockKeyring({ password: P305 })).toBe(true);
    await service.waitForAccessScan();

    expect(snapshot() === before).toBe(true);
    expect(Object.values(service.tonKeyring.accountSubject.value).every(({ cipherSeed }) => isLegacyTonSeed(cipherSeed))).toBe(true);
    // Nothing is locked by the failed move.
    expect(await issues(service)).toEqual([]);
    for (const { phrase, stored: written } of fixture.accounts) {
      expect((await exportTon(service, written.address, P305)) === phrase).toBe(true);
    }

    mocks.failWrites = false;
    await unlocked(P305);
    expect(storedVersions()).toEqual([2, 2]);
  });

  it('does not publish a new ciphertext before storage acknowledges the write', async () => {
    const service = await wallet(P305, records305());
    let acknowledge!: () => void;
    let entered!: () => void;
    const writing = new Promise<void>((resolve) => { entered = resolve; });

    mocks.beforeWrite = () => {
      mocks.beforeWrite = undefined;
      entered();
      return new Promise<void>((resolve) => { acknowledge = resolve; });
    };
    expect(service.unlockKeyring({ password: P305 })).toBe(true);
    await writing;

    expect(Object.values(service.tonKeyring.accountSubject.value).every(({ cipherSeed }) => isLegacyTonSeed(cipherSeed))).toBe(true);
    acknowledge();
    await service.waitForAccessScan();
    expect(Object.values(service.tonKeyring.accountSubject.value).map(({ cipherSeed }) => version(cipherSeed))).toEqual([2, 2]);
  });

  it('refuses swapped account keys and keeps the unreadable 3.0.5 ciphertext inside version 3', async () => {
    const records = records305();
    records[1].cipherSeed = records[0].cipherSeed;
    const service = await unlocked(P305, records);

    await expect(exportTon(service, records[1].address, P305)).rejects.toMatchObject({ code: 'ton_seed_needs_previous_password' });
    expect(keptForRecovery(records[1].address, P305)).toBe(records[0].cipherSeed);
    expect(version(stored(records[0].address).cipherSeed)).toBe(2);
    expect(await issues(service)).toEqual([records[1].address]);

    // As in 3.0.6 since cfcdb591, a record that does not open does not stop a password change, and moves with it.
    expect(await service.changeMasterPassword({ oldPassword: P305, newPassword: NEXT })).toBe(true);
    await service.waitForAccessScan();
    expect(keptForRecovery(records[1].address, NEXT)).toBe(records[0].cipherSeed);
    await expect(exportTon(service, records[1].address, NEXT)).rejects.toMatchObject({ code: 'ton_seed_needs_previous_password' });
    expect(await issues(service)).toEqual([records[1].address]);
  });

  it('keeps earlier-password accounts inside version 3 without locking the wallet, and repairs them with that password', async () => {
    const service = await unlocked(LATER, records305());

    expect(storedVersions()).toEqual([3, 3]);
    // The weak 3.0.5 ciphertext is no longer readable from a copy of storage.
    expect(snapshot().includes(NATIVE.stored.cipherSeed)).toBe(false);
    expect(snapshot().includes(BIP39.stored.cipherSeed)).toBe(false);
    expect(await issues(service)).toEqual(fixture.accounts.map(({ stored: written }) => written.address));

    const restarted = await unlocked(LATER);
    const kept = snapshot();

    expect(await recover(restarted, NATIVE.stored.address, 'wrong test password')).toEqual({ ok: false, code: 'wrong_password' });
    expect(await recover(restarted, NATIVE.stored.address, LATER)).toEqual({ ok: false, code: 'wrong_password' });
    expect(snapshot() === kept).toBe(true);

    for (const { phrase, stored: written } of fixture.accounts) {
      expect(await recover(restarted, written.address, P305)).toEqual({ ok: true });
      expect((await exportTon(restarted, written.address, LATER)) === phrase).toBe(true);
    }
    expect(await issues(restarted)).toEqual([]);
    expect(storedVersions()).toEqual([2, 2]);
  });

  it('moves version 3 records to a new master password without losing the earlier-password recovery', async () => {
    const service = await unlocked(LATER, records305());

    expect(await service.changeMasterPassword({ oldPassword: LATER, newPassword: NEXT })).toBe(true);
    for (const { stored: written } of fixture.accounts) expect(keptForRecovery(written.address, NEXT)).toBe(written.cipherSeed);

    const restarted = await unlocked(NEXT);
    expect(await issues(restarted)).toHaveLength(2);

    for (const { phrase, stored: written } of fixture.accounts) {
      expect(await recover(restarted, written.address, P305)).toEqual({ ok: true });
      expect((await exportTon(restarted, written.address, NEXT)) === phrase).toBe(true);
    }
    expect(await issues(restarted)).toEqual([]);
  });

  it('writes a password change in one batch, nothing when it fails, and keeps every phrase under the new password', async () => {
    const service = await unlocked(P305, records305());
    const before = snapshot();

    mocks.failWrites = true;
    expect(await service.changeMasterPassword({ oldPassword: P305, newPassword: NEXT })).toBe(false);
    expect(snapshot() === before).toBe(true);

    mocks.failWrites = false;
    vi.mocked(tonStore.updateAndWait).mockClear();
    expect(await service.changeMasterPassword({ oldPassword: P305, newPassword: NEXT })).toBe(true);
    // Every TON record went in the password batch; none was written on its own.
    expect(tonStore.updateAndWait).not.toHaveBeenCalled();

    for (const { phrase, stored: written } of fixture.accounts) {
      const { cipherSeed } = stored(written.address);

      expect(version(cipherSeed)).toBe(2);
      expect((await decryptTonSeed(cipherSeed, NEXT, keyOf(written.address))) === phrase).toBe(true);
      expect(await decryptTonSeed(cipherSeed, P305, keyOf(written.address))).toBeUndefined();
    }
  });

  it('changes the password past a record already under the new one, one neither opens and one in no known format', async () => {
    const [first, second] = fixture.accounts;
    const unknown = { ...second.stored, address: 'unknown-format', cipherSeed: 'not a record this wallet wrote' };
    // As an interrupted change could leave them: the first under the new password, the second under neither.
    const service = await unlocked(P305, [
      { ...first.stored, cipherSeed: encryptTonSeed(first.phrase, NEXT) },
      { ...second.stored, cipherSeed: encryptTonSeed(second.phrase, 'test-only unrelated password') },
      unknown,
    ]);
    const neither = stored(second.stored.address).cipherSeed;

    expect(await service.changeMasterPassword({ oldPassword: P305, newPassword: NEXT })).toBe(true);
    await service.waitForAccessScan();

    expect((await exportTon(service, first.stored.address, NEXT)) === first.phrase).toBe(true);
    expect(stored(second.stored.address).cipherSeed).toBe(neither);
    expect(stored(unknown.address)).toEqual(unknown);
    expect(await issues(service)).toEqual([second.stored.address, unknown.address]);
  });

  it('serializes rename and removal with the move at unlock, without bringing back 3.0.5 data or a deleted account', async () => {
    const service = await wallet(P305, records305());
    const [first, second] = fixture.accounts;

    expect(service.unlockKeyring({ password: P305 })).toBe(true);
    await Promise.all([
      service.waitForAccessScan(),
      service.tonKeyring.updateAccountName(first.stored.address, 'Renamed fixture'),
      service.forgetAccount(second.stored.address),
    ]);
    await service.waitForAccessScan();

    expect([...mocks.records.keys()]).toEqual([first.stored.address]);
    expect(stored(first.stored.address).name).toBe('Renamed fixture');
    expect(version(stored(first.stored.address).cipherSeed)).toBe(2);
    expect(service.tonKeyring.getAccounts().map(({ address }) => address)).toEqual([first.stored.address]);

    // The deleted wallet keeps its phrase for Account access, under the same password.
    const [deleted] = Object.values(mocks.other) as Array<{ address: string; ton: TonStoreAccount }>;
    expect(deleted.address).toBe(second.stored.address);
    expect((await decryptTonSeed(deleted.ton.cipherSeed, P305, Buffer.from(second.stored.publicKeyHex, 'hex'))) === second.phrase).toBe(true);
  });

  it('adds only version 2 records and reports a storage failure', async () => {
    const service = await unlocked(P305, []);
    const add = ({ phrase, stored: written }: typeof NATIVE, derivation?: 'fearless-legacy') =>
      service.addAccount(phrase, { name: 'Imported' }, WalletEcosystem.Ton, undefined,
        derivation && { derivation, address: written.address });

    mocks.failWrites = true;
    await expect(add(NATIVE)).rejects.toThrow('disk unavailable');
    expect(service.tonKeyring.getAccounts()).toHaveLength(0);

    mocks.failWrites = false;
    await expect(add(NATIVE)).resolves.toBe(NATIVE.stored.address);
    // The address 3.0.5 gave this BIP39 phrase.
    await expect(add(BIP39, 'fearless-legacy')).resolves.toBe(BIP39.stored.address);
    expect(storedVersions()).toEqual([2, 2]);

    for (const { phrase, stored: written } of fixture.accounts) {
      expect(stored(written.address).publicKeyHex).toBe(written.publicKeyHex);
      expect((await exportTon(service, written.address, P305)) === phrase).toBe(true);
    }
  });

  it('refuses to add a TON account while locked instead of storing nothing', async () => {
    const service = await wallet(P305, []);

    await expect(service.addAccount(BIP39.phrase, { name: 'Imported' }, WalletEcosystem.Ton)).rejects.toMatchObject({
      code: 'keyring_locked',
    });
    expect(tonStore.updateAndWait).not.toHaveBeenCalled();
    expect(service.tonKeyring.getAccounts()).toHaveLength(0);
  });

  // 3.0.6 (cfcdb591) also stops opening version 2 and 3 records at unlock. Not ported: here the check after unlock
  // opens every phrase on purpose, after the unlock answer, to list the ones that need an earlier password.
  it('keeps moving the other accounts when one record cannot be processed', async () => {
    const records = records305();
    const unknown = { ...records[0], cipherSeed: 'not a record this wallet wrote' };
    const service = await unlocked(P305, [unknown, records[1]]);

    expect(stored(unknown.address)).toEqual(unknown);
    expect(version(stored(records[1].address).cipherSeed)).toBe(2);
    // It stays in the wallet; Account access takes its phrase.
    expect(service.tonKeyring.getAccounts().map(({ address }) => address)).toEqual([unknown.address, records[1].address]);
    expect(await issues(service)).toEqual([unknown.address]);
    expect(await service.recoverAccountWithPhrase({
      address: unknown.address, walletEcosystem: WalletEcosystem.Ton, phrase: NATIVE.phrase,
    })).toEqual({ ok: true });
    expect((await exportTon(service, unknown.address, P305)) === NATIVE.phrase).toBe(true);
  });

  it('moves a 3.0.5 record whose phrase fails phrase validation but derives its stored key', async () => {
    // 3.0.5 stored phrases without validating them; a phrase that is neither valid BIP39 nor a valid TON phrase
    // stands for such an account.
    const words = Array(24).fill('abandon');
    const { publicKey } = await tonWebMnemonic.mnemonicToKeyPair(words);
    const address = createTonWalletContractV4R2(publicKey).address.toString({ bounceable: false, urlSafe: true });
    const record = {
      name: 'Unvalidated',
      address,
      cipherSeed: CryptoJS.AES.encrypt(words.join(' '), P305).toString(),
      publicKeyHex: Buffer.from(publicKey).toString('hex'),
    };

    expect(await tonWebMnemonic.validateMnemonic(words)).toBe(false);
    const service = await unlocked(P305, [record]);

    expect(version(stored(address).cipherSeed)).toBe(2);
    expect(await issues(service)).toEqual([]);
    expect((await exportTon(service, address, P305)) === words.join(' ')).toBe(true);
  });

  // 3.0.6 removes the TON records on reset. This version keeps them (WalletReset.ts), to be unlocked with the
  // password used before. A version 3 record then takes two: the master password that protected it, then its own.
  it('keeps every TON record through a reset, and repairs a version 3 record from the passwords used before', async () => {
    const service = await unlocked(LATER, records305());

    expect(await service.resetWallet()).toBe(true);
    expect(service.tonKeyring.getAccounts()).toHaveLength(2);
    expect(storedVersions()).toEqual([3, 3]);
    expect(await service.changeMasterPassword({ newPassword: NEXT })).toBe(true);
    await service.waitForAccessScan();
    expect(await issues(service)).toHaveLength(2);

    const [first, second] = fixture.accounts;
    const kept = snapshot();

    expect(await recover(service, first.stored.address, P305)).toEqual({ ok: false, code: 'wrong_password' });
    expect(snapshot() === kept).toBe(true);
    expect(await recover(service, first.stored.address, LATER)).toEqual({ ok: false, code: 'previous_password_required' });
    expect(keptForRecovery(first.stored.address, NEXT)).toBe(first.stored.cipherSeed);
    expect(await issues(service)).toHaveLength(2);
    expect(await recover(service, first.stored.address, P305)).toEqual({ ok: true });
    expect((await exportTon(service, first.stored.address, NEXT)) === first.phrase).toBe(true);

    expect(await service.recoverAccountWithPhrase({
      address: second.stored.address, walletEcosystem: WalletEcosystem.Ton, phrase: second.phrase,
    })).toEqual({ ok: true });
    expect((await exportTon(service, second.stored.address, NEXT)) === second.phrase).toBe(true);
    expect(await issues(service)).toEqual([]);
  });
});
