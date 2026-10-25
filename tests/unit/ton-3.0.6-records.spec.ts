// The TON records 3.0.6 writes (tests/fixtures/3.0.6, made by the 3.0.6 code itself from the records 3.0.5 wrote),
// read by this version: an upgrade from 3.0.6 keeps every TON account, its phrase and its earlier-password
// recovery. What this version writes in their place is what 3.0.6 reads, so a rollback to 3.0.6 keeps them too.
import { Keyring as DetachedKeyring } from '@subwallet/keyring/keyring';
import { u8aToString } from '@polkadot/util';
import { jsonDecrypt } from '@polkadot/util-crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tonStore } from '@extension-base/stores/TonStore';
import { KeyringService } from '@extension-base/services/keyring-service';
import { readTonRecoveryRecord } from '@extension-base/services/keyring-service/TonSeedVault';
import fixture from '../fixtures/3.0.5/ton-accounts.json';
import written306 from '../fixtures/3.0.6-e5/ton-accounts.json';
import type { KeyringPasswordJson } from '@subwallet/keyring/types';
import type { TonStoreAccount } from '@extension-base/stores/TonStore';
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
type Written306 = { description: string; masterPassword: string; earlierPassword?: string; records: TonStoreAccount[] };
const states = written306.states as Record<string, Written306>;
// States whose phrases open with the master password, and states that keep them for the earlier password.
const OPENING = ['upgradedAtUnlock', 'passwordChanged', 'recoveredWithEarlierPassword', 'added'];
const KEPT = ['keptForRecovery', 'keptForRecoveryPasswordChanged'];
const P305 = fixture.password;
const LATER = 'test-only later master password';
const NEXT = 'test-only 4.2.0 master password';

const phraseOf = (address: string) => fixture.accounts.find(({ stored: written }) => written.address === address)!.phrase;
const stored = (address: string) => mocks.records.get(address)!;
const keyOf = (address: string) => Buffer.from(stored(address).publicKeyHex, 'hex');
const version = (cipherSeed: string) => (cipherSeed.startsWith('{') ? JSON.parse(cipherSeed).version : 1);
const keptForRecovery = (address: string, password: string) =>
  readTonRecoveryRecord(stored(address).cipherSeed, password, { address, publicKey: keyOf(address) });
const snapshot = () => JSON.stringify([...mocks.records]);

// A fresh service worker over the stored records, with the keyring's password record set to `password`.
async function wallet(password: string, records?: TonStoreAccount[]) {
  if (records) mocks.records = new Map(structuredClone(records).map((value) => [value.address, value]));
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
const issues = async (service: KeyringService) => (await service.getAccessStatus()).issues;

// The checks 3.0.6 makes before it uses a TON record (TonStore.readAll, and parseStoredSeed and readRecoveryRecord
// in TonKeyring.ts at cfcdb591), restated here so that what 4.2.0 writes is held to them.
function assertReadableBy306(record: TonStoreAccount, masterPassword: string) {
  const { cipherSeed } = record;

  expect(record.publicKeyHex).toMatch(/^[a-f0-9]{64}$/);
  expect(cipherSeed.length).toBeLessThanOrEqual(8192);

  const value = JSON.parse(cipherSeed);
  const bytes = Buffer.from(value.encoded, 'base64');

  expect([2, 3]).toContain(value.version);
  expect(value.encoding).toEqual({
    content: [value.version === 2 ? 'ton-mnemonic' : 'ton-legacy-recovery'],
    type: ['scrypt', 'xsalsa20-poly1305'],
    version: '3',
  });
  expect(bytes.toString('base64')).toBe(value.encoded);
  expect(bytes.length).toBeGreaterThanOrEqual(85);
  expect([bytes.readUInt32LE(32), bytes.readUInt32LE(36), bytes.readUInt32LE(40)]).toEqual([32768, 1, 8]);

  if (value.version !== 3) return;

  const archive = JSON.parse(u8aToString(jsonDecrypt(value, masterPassword)));
  const legacy = Buffer.from(archive.cipherSeed, 'base64');

  expect(archive).toMatchObject({ address: record.address, publicKeyHex: record.publicKeyHex });
  expect(legacy.toString('base64')).toBe(archive.cipherSeed);
  expect(legacy.length % 16).toBe(0);
  expect(legacy.subarray(0, 8).toString()).toBe('Salted__');
}

beforeEach(() => {
  vi.mocked(tonStore.updateAndWait).mockClear();
  mocks.other = {};
  mocks.failWrites = false;
  mocks.beforeWrite = undefined;
  mocks.prompt.clear();
});

describe('4.2.0 reads the TON records 3.0.6 wrote', PBKDF2_SUITE, () => {
  it('uses records that the 3.0.6 code wrote from the 3.0.5 fixture', () => {
    expect(written306.source).toMatchObject({
      commit: 'cfcdb591fd7098b24022e8e9afc19b511d0fe785',
      version: '3.0.6',
      startsFrom: 'tests/fixtures/3.0.5/ton-accounts.json',
    });
    expect(Object.keys(states).sort()).toEqual([...OPENING, ...KEPT].sort());

    for (const [name, { records }] of Object.entries(states)) {
      expect(records.map(({ address, publicKeyHex }) => [address, publicKeyHex])).toEqual(
        fixture.accounts.map(({ stored: written }) => [written.address, written.publicKeyHex])
      );
      expect(records.map(({ cipherSeed }) => version(cipherSeed))).toEqual(KEPT.includes(name) ? [3, 3] : [2, 2]);
    }
  });

  it.each(OPENING)('%s: lists, unlocks and exports every account exactly, and writes nothing', async (name) => {
    const { masterPassword, records } = states[name];
    const service = await unlocked(masterPassword, records);

    expect(service.tonKeyring.getAccounts().map(({ address }) => address)).toEqual(records.map(({ address }) => address));
    expect(tonStore.updateAndWait).not.toHaveBeenCalled();
    expect(await issues(service)).toEqual([]);

    for (const { address } of records) expect((await exportTon(service, address, masterPassword)) === phraseOf(address)).toBe(true);
    expect([...mocks.records.values()]).toEqual(records);
  });

  it.each(KEPT)('%s: lists every account in Account access and restores it with the earlier password', async (name) => {
    const { masterPassword, earlierPassword, records } = states[name];
    const service = await unlocked(masterPassword, records);

    expect(service.tonKeyring.getAccounts().map(({ address }) => address)).toEqual(records.map(({ address }) => address));
    expect(tonStore.updateAndWait).not.toHaveBeenCalled();
    expect((await issues(service)).map(({ address, kind }) => [address, kind])).toEqual(
      records.map(({ address }) => [address, 'previous_master_password'])
    );

    for (const { address } of records) {
      await expect(exportTon(service, address, masterPassword)).rejects.toMatchObject({ code: 'ton_seed_needs_previous_password' });

      const kept = snapshot();

      expect(await recover(service, address, masterPassword)).toEqual({ ok: false, code: 'wrong_password' });
      expect(snapshot() === kept).toBe(true);
      expect(await recover(service, address, earlierPassword!)).toEqual({ ok: true });
      expect(version(stored(address).cipherSeed)).toBe(2);
      expect((await exportTon(service, address, masterPassword)) === phraseOf(address)).toBe(true);
    }
    expect(await issues(service)).toEqual([]);
  });

  it('changes the master password of a 3.0.6 wallet and keeps the earlier-password recovery', async () => {
    // One account 3.0.6 kept for its earlier password, one it had already restored; both under the same master.
    const { masterPassword, earlierPassword } = states.keptForRecovery;
    const [kept, opening] = [states.keptForRecovery.records[0], states.recoveredWithEarlierPassword.records[1]];
    const service = await unlocked(masterPassword, [kept, opening]);

    expect(states.recoveredWithEarlierPassword.masterPassword).toBe(masterPassword);
    expect(await service.changeMasterPassword({ oldPassword: masterPassword, newPassword: NEXT })).toBe(true);
    await service.waitForAccessScan();

    expect((await exportTon(service, opening.address, NEXT)) === phraseOf(opening.address)).toBe(true);
    expect(keptForRecovery(kept.address, NEXT)).toBe(fixture.accounts[0].stored.cipherSeed);
    expect(await recover(service, kept.address, earlierPassword!)).toEqual({ ok: true });
    expect((await exportTon(service, kept.address, NEXT)) === phraseOf(kept.address)).toBe(true);
    expect(await issues(service)).toEqual([]);
  });

  it('writes only records 3.0.6 reads, so a rollback to 3.0.6 keeps every TON account', async () => {
    const records305 = fixture.accounts.map(({ stored: written }) => written as TonStoreAccount);
    const checks: Array<[TonStoreAccount, string]> = [];
    const collect = (password: string) => mocks.records.forEach((record) => checks.push([structuredClone(record), password]));

    // Moved at unlock: version 2, or version 3 around a phrase left under an earlier password.
    await unlocked(P305, records305);
    collect(P305);
    const changed = await unlocked(LATER, records305);
    collect(LATER);
    // A password change: version 3 moves under the new password.
    expect(await changed.changeMasterPassword({ oldPassword: LATER, newPassword: NEXT })).toBe(true);
    collect(NEXT);
    // Restored with the earlier password, and added.
    for (const { stored: written } of fixture.accounts) expect(await recover(changed, written.address, P305)).toEqual({ ok: true });
    collect(NEXT);
    const adding = await unlocked(NEXT, []);
    await adding.addAccount(fixture.accounts[0].phrase, { name: 'Added in 4.2.0' }, WalletEcosystem.Ton);
    collect(NEXT);

    expect(checks.map(([record]) => version(record.cipherSeed))).toEqual([2, 2, 3, 3, 3, 3, 2, 2, 2]);
    for (const [record, password] of checks) assertReadableBy306(record, password);
  });
});
