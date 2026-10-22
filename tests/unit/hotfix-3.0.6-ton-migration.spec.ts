// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import CryptoJS from 'crypto-js';
import * as tonMnemonic from 'tonweb-mnemonic';
import { WalletSecurityProvenance } from '@extension-base/services/keyring-service/WalletSecurityProvenance';
import {
  TonKeyringService,
  isLegacyTonSeed,
} from '../../src/extension/background/extension-base/src/services/keyring-service/TonKeyring';
import { tonStore } from '../../src/extension/background/extension-base/src/stores/TonStore';
import fixture from '../fixtures/3.0.5/ton-accounts.json';
import published from '../fixtures/3.0.6/ton-accounts.json';
import type { KeyringService } from '@extension-base/services/keyring-service';
import type { FWKeyringMeta } from '@extension-base/types';
import type { TonStoreAccount } from '../../src/extension/background/extension-base/src/stores/TonStore';

vi.mock('../../src/extension/background/extension-base/src/stores/TonStore', () => ({
  tonStore: { readAll: vi.fn(), saveMany: vi.fn(), removeAccount: vi.fn() },
}));

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
let disk: TonStoreAccount[];

function start(password = fixture.password) {

  const provenance = new WalletSecurityProvenance();
  const keyringService = { getPassword: () => password, getAccountCreationMeta: (suri: string, meta: FWKeyringMeta) => provenance.accountMetadata(suri, meta) } as KeyringService;
  const keyring = new TonKeyringService(keyringService);


  return keyring;
}

async function loaded(password = fixture.password) {
  const keyring = start(password);

  await keyring.withStoreLock(async () => undefined);

  return keyring;
}

describe('TON storage encryption and durable upgrade', () => {
  vi.setConfig({ testTimeout: 30000 });

  beforeAll(async () => {
    await cryptoWaitReady();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    tonStore.hasUnreadableRecords = false;
    disk = clone(fixture.accounts.map(({ stored }) => stored));
    (tonStore.readAll as Mock).mockImplementation(async () => clone(disk));
    (tonStore.saveMany as Mock).mockImplementation(async (records: TonStoreAccount[]) => {
      const next = new Map(disk.map((record) => [record.address, record]));

      records.forEach((record) => next.set(record.address, clone(record)));
      disk = [...next.values()];
    });
    (tonStore.removeAccount as Mock).mockImplementation(async (address: string) => {
      disk = disk.filter((record) => record.address !== address);
    });
  });

  it('writes authenticated, randomly salted encryption and refuses wrong or empty passwords', async () => {
    const keyring = await loaded();
    const words = fixture.accounts[0].phrase.split(' ');
    const first = keyring.encodeMnemonic(words, fixture.password);
    const second = keyring.encodeMnemonic(words, fixture.password);

    expect(first === second).toBe(false);
    expect(isLegacyTonSeed(first)).toBe(false);
    expect(keyring.decodeMnemonic(first) === fixture.accounts[0].phrase).toBe(true);
    expect(() => keyring.decodeMnemonic(first, 'incorrect test password')).toThrow();
    expect(() => keyring.decodeMnemonic(first, '')).toThrow();
    expect(() => keyring.encodeMnemonic(words, '')).toThrow();
  });

  it('rejects ciphertext tampering, unknown versions, plaintext envelopes and KDF parameter injection', async () => {
    const keyring = await loaded();
    const stored = JSON.parse(keyring.encodeMnemonic(fixture.accounts[0].phrase.split(' '), fixture.password));
    const changed = clone(stored);
    const bytes = Buffer.from(changed.encoded, 'base64');

    bytes[bytes.length - 1] ^= 1;
    changed.encoded = bytes.toString('base64');
    expect(() => keyring.decodeMnemonic(JSON.stringify(changed))).toThrow();
    expect(() => keyring.decodeMnemonic(JSON.stringify({ ...stored, version: 3 }))).toThrow();
    expect(() =>
      keyring.decodeMnemonic(JSON.stringify({ ...stored, encoding: { ...stored.encoding, type: ['none'] } }))
    ).toThrow();
    const downgraded = Buffer.from(stored.encoded, 'base64');

    downgraded.writeUInt32LE(1, 32);
    expect(() =>
      keyring.decodeMnemonic(JSON.stringify({ ...stored, encoded: downgraded.toString('base64') }))
    ).toThrow();
    expect(() => keyring.decodeMnemonic('{malformed')).toThrow();
    expect(() => keyring.decodeMnemonic('unsupported-format')).toThrow();
  });

  it('upgrades every native and BIP39 account together and reads them after a restart', async () => {
    const keyring = await loaded();

    await keyring.migrateOnUnlock(fixture.password);
    expect(tonStore.saveMany).toHaveBeenCalledTimes(1);
    expect((tonStore.saveMany as Mock).mock.calls[0][0]).toHaveLength(2);
    expect(disk.every((record) => !isLegacyTonSeed(record.cipherSeed))).toBe(true);
    const restarted = await loaded();

    for (const { phrase, stored } of fixture.accounts) {
      expect((await restarted.decodeAccountMnemonic(stored.address)) === phrase).toBe(true);
      expect(restarted.accountSubject.value[stored.address].name).toBe(stored.name);
      expect(Buffer.from(restarted.accountSubject.value[stored.address].publicKey).toString('hex')).toBe(
        stored.publicKeyHex
      );
    }

    const before = JSON.stringify(disk);

    await restarted.migrateOnUnlock(fixture.password);
    expect(JSON.stringify(disk) === before).toBe(true);
  });

  it('keeps every legacy record and in-memory value on write failure, and retries safely', async () => {
    const keyring = await loaded();
    const before = JSON.stringify(disk);

    (tonStore.saveMany as Mock).mockRejectedValueOnce(new Error('simulated quota failure'));
    await expect(keyring.migrateOnUnlock(fixture.password)).rejects.toThrow('quota');
    expect(JSON.stringify(disk) === before).toBe(true);
    expect(Object.values(keyring.accountSubject.value).every(({ cipherSeed }) => isLegacyTonSeed(cipherSeed))).toBe(
      true
    );
    const restarted = await loaded();

    await restarted.migrateOnUnlock(fixture.password);
    expect(disk.every((record) => !isLegacyTonSeed(record.cipherSeed))).toBe(true);
  });

  it('does not persist or publish new records before storage acknowledges the write', async () => {
    const keyring = await loaded();
    let acknowledge!: () => void;

    (tonStore.saveMany as Mock).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          acknowledge = resolve;
        })
    );
    const pending = keyring.migrateOnUnlock(fixture.password);

    while (!acknowledge) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(Object.values(keyring.accountSubject.value).every(({ cipherSeed }) => isLegacyTonSeed(cipherSeed))).toBe(
      true
    );
    acknowledge();
    await pending;
    expect(Object.values(keyring.accountSubject.value).every(({ cipherSeed }) => !isLegacyTonSeed(cipherSeed))).toBe(
      true
    );
  });

  it('waits for all saved accounts before migrating during startup', async () => {
    let finishLoading!: (records: TonStoreAccount[]) => void;

    (tonStore.readAll as Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishLoading = resolve;
        })
    );
    const keyring = start();
    const migration = keyring.migrateOnUnlock(fixture.password);

    await Promise.resolve();
    expect(tonStore.saveMany).not.toHaveBeenCalled();
    finishLoading(clone(disk));
    await migration;
    expect(disk.filter((record) => !isLegacyTonSeed(record.cipherSeed))).toHaveLength(2);
  });

  it('refuses swapped account keys and preserves unreadable legacy records inside strong recovery encryption', async () => {
    disk[1].cipherSeed = disk[0].cipherSeed;
    const swapped = await loaded();

    await expect(swapped.decodeAccountMnemonic(disk[1].address)).rejects.toThrow('mismatch');
    await expect(
      swapped.withStoreLock(() => swapped.preparePasswordChange(fixture.password, 'new test password'))
    ).rejects.toThrow();
    expect(tonStore.saveMany).not.toHaveBeenCalled();
    await swapped.migrateOnUnlock(fixture.password);
    expect(swapped.hasRecoveryAccounts).toBe(true);
    expect(disk.every((record) => !isLegacyTonSeed(record.cipherSeed))).toBe(true);
    await expect(swapped.decodeAccountMnemonic(disk[1].address)).rejects.toThrow('mismatch');
  });

  it('secures earlier-password accounts without global lockout and repairs them with the earlier password', async () => {
    const currentPassword = 'public current-password fixture';
    const keyring = await loaded(currentPassword);
    const before = JSON.stringify(disk);

    await keyring.migrateOnUnlock(currentPassword);
    expect(keyring.hasRecoveryAccounts).toBe(true);
    expect(disk.every((record) => JSON.parse(record.cipherSeed).version === 3)).toBe(true);
    expect(JSON.stringify(disk).includes(fixture.accounts[0].stored.cipherSeed)).toBe(false);
    const restarted = await loaded(currentPassword);

    await restarted.migrateOnUnlock(currentPassword);
    const protectedRecords = JSON.stringify(disk);

    await expect(restarted.decodeAccountMnemonic(disk[0].address, 'wrong test password')).rejects.toThrow();
    expect(JSON.stringify(disk) === protectedRecords).toBe(true);

    for (const { phrase, stored } of fixture.accounts) {
      expect((await restarted.decodeAccountMnemonic(stored.address, fixture.password)) === phrase).toBe(true);
      expect((await restarted.decodeAccountMnemonic(stored.address, currentPassword)) === phrase).toBe(true);
    }

    expect(restarted.hasRecoveryAccounts).toBe(false);
    expect(JSON.stringify(disk) === before).toBe(false);
  });

  it('rotates protected recovery records without losing the original earlier-password recovery path', async () => {
    const keyring = await loaded('current test password');

    await keyring.migrateOnUnlock('current test password');
    const replacements = await keyring.withStoreLock(() =>
      keyring.preparePasswordChange('current test password', 'next test password')
    );

    disk = clone(replacements);
    const restarted = await loaded('next test password');

    await restarted.migrateOnUnlock('next test password');
    expect(restarted.hasRecoveryAccounts).toBe(true);

    for (const { phrase, stored } of fixture.accounts) {
      expect((await restarted.decodeAccountMnemonic(stored.address, fixture.password)) === phrase).toBe(true);
    }

    expect(restarted.hasRecoveryAccounts).toBe(false);
  });

  it('prepares all password replacements without writing and preserves keys under the new password', async () => {
    const keyring = await loaded();
    const replacements = await keyring.withStoreLock(() =>
      keyring.preparePasswordChange(fixture.password, 'new test password')
    );

    expect(replacements).toHaveLength(2);
    expect(tonStore.saveMany).not.toHaveBeenCalled();
    expect(disk.every((record) => isLegacyTonSeed(record.cipherSeed))).toBe(true);

    for (const record of replacements) {
      const original = fixture.accounts.find(({ stored }) => stored.address === record.address)!;

      expect(keyring.decodeMnemonic(record.cipherSeed, 'new test password') === original.phrase).toBe(true);
      expect(() => keyring.decodeMnemonic(record.cipherSeed, fixture.password)).toThrow();
    }
  });

  it('serializes rename and removal with migration without restoring legacy data or deleted accounts', async () => {
    const keyring = await loaded();
    const [first, second] = disk;

    await Promise.all([
      keyring.migrateOnUnlock(fixture.password),
      keyring.updateAccountName(first.address, 'Renamed fixture'),
      keyring.forgetAccount(second.address),
    ]);
    expect(disk).toHaveLength(1);
    expect(disk[0].name).toBe('Renamed fixture');
    expect(isLegacyTonSeed(disk[0].cipherSeed)).toBe(false);
    expect(keyring.getAccounts().map(({ address }) => address)).toEqual([first.address]);
  });

  it('creates/imports only strong records and reports storage failure', async () => {
    disk = [];
    const keyring = await loaded();
    const sample = fixture.accounts[1];

    (tonStore.saveMany as Mock).mockRejectedValueOnce(new Error('simulated quota failure'));
    await expect(keyring.createAccount(sample.phrase, 'Imported', fixture.password)).rejects.toThrow('quota');
    expect(keyring.getAccounts()).toHaveLength(0);
    await keyring.createAccount(sample.phrase, 'Imported', fixture.password);
    expect(disk).toHaveLength(1);
    expect(isLegacyTonSeed(disk[0].cipherSeed)).toBe(false);
    expect((await keyring.decodeAccountMnemonic(disk[0].address)) === sample.phrase).toBe(true);
  });
  it('reads deployed v2 records without rewriting or marking pre-update accounts as fresh', async () => {
    disk = clone(published.accounts.map(({ stored }) => stored));
    const before = JSON.stringify(disk);
    const wallet = await loaded(published.password);
    await wallet.migrateOnUnlock(published.password);
    for (const { phrase, stored } of published.accounts) {
      const encoded = Buffer.from(JSON.parse(stored.cipherSeed).encoded, 'base64');
      expect(encoded.readUInt32LE(32)).toBe(32768);
      expect(await wallet.decodeAccountMnemonic(stored.address)).toBe(phrase);
      expect(wallet.getAccount(stored.address).meta.walletSecurityGeneration).toBeUndefined();
    }
    expect(JSON.stringify(disk)).toBe(before);
    await wallet.migrateOnUnlock('wrong password');
    expect(wallet.hasStorageIssues).toBe(true);
    await expect(wallet.decodeAccountMnemonic(disk[0].address, 'wrong password')).rejects.toThrow();
    expect(JSON.stringify(disk)).toBe(before);
  });

  it('repairs deployed v3 records only with the earlier password and preserves their stored identity', async () => {
    disk = clone(published.recoveryAccounts.map(({ stored }) => stored));
    const wallet = await loaded(published.password);
    await wallet.migrateOnUnlock(published.password);
    expect(wallet.hasRecoveryAccounts).toBe(true);
    const before = JSON.stringify(disk);
    await expect(wallet.decodeAccountMnemonic(disk[0].address, 'wrong')).rejects.toThrow();
    expect(JSON.stringify(disk)).toBe(before);
    for (const { phrase, stored } of published.recoveryAccounts) {
      expect(await wallet.decodeAccountMnemonic(stored.address, published.earlierPassword)).toBe(phrase);
      expect(wallet.getAccount(stored.address).meta.walletSecurityGeneration).toBeUndefined();
    }
    expect(wallet.hasRecoveryAccounts).toBe(false);
    const reopened = await loaded(published.password);
    for (const { phrase, stored } of published.recoveryAccounts) {
      expect(await reopened.decodeAccountMnemonic(stored.address)).toBe(phrase);
    }
  });

  it('preserves fresh provenance and universal metadata through rename and password rotation', async () => {
    disk = clone(published.accounts.map(({ stored }) => ({ ...stored, meta: { walletSecurityGeneration: 1, name: stored.name } })));
    const wallet = await loaded(published.password);
    const address = disk[0].address;
    await wallet.updateAccountName(address, 'Renamed fresh fixture');
    const beforeMeta = clone(disk[0].meta);
    const replacement = await wallet.withStoreLock(() => wallet.preparePasswordChange(published.password, 'next fixture password'));
    expect(replacement[0].meta).toEqual(beforeMeta);
    expect(replacement[0].meta?.walletSecurityGeneration).toBe(1);
    expect(wallet.getAccount(address).meta.walletSecurityGeneration).toBe(1);
  });

  it('rejects a deployed authenticated record with a substituted public key without overwriting storage', async () => {
    disk = clone(published.accounts.map(({ stored }) => stored));
    disk[0].publicKeyHex = '01'.repeat(32);
    const before = JSON.stringify(disk);
    const wallet = await loaded(published.password);
    await wallet.migrateOnUnlock(published.password);
    expect(wallet.hasStorageIssues).toBe(true);
    await expect(wallet.decodeAccountMnemonic(disk[0].address)).rejects.toThrow();
    expect(JSON.stringify(disk)).toBe(before);
    expect(tonStore.saveMany).not.toHaveBeenCalled();
  });

  it('migrates healthy records beside an unreadable one and retries that record at a later unlock', async () => {
    const unreadable = { ...published.accounts[0].stored, cipherSeed: '{unknown-format' };
    disk = [clone(unreadable), clone(fixture.accounts[1].stored)];
    const wallet = await loaded();
    await wallet.migrateOnUnlock(fixture.password);
    expect(wallet.hasStorageIssues).toBe(true);
    expect(disk[0]).toEqual(unreadable);
    expect(isLegacyTonSeed(disk[1].cipherSeed)).toBe(false);
    expect(await wallet.decodeAccountMnemonic(disk[1].address)).toBe(fixture.accounts[1].phrase);
    await expect(wallet.withStoreLock(() => wallet.preparePasswordChange(fixture.password, 'new'))).rejects.toThrow();
    disk[0] = clone(fixture.accounts[0].stored);
    await wallet.migrateOnUnlock(fixture.password);
    expect(wallet.hasStorageIssues).toBe(false);
    expect(await wallet.decodeAccountMnemonic(disk[0].address)).toBe(fixture.accounts[0].phrase);
  });

  it('lets unrelated metadata operations proceed after a startup read failure and retries TON later', async () => {
    vi.mocked(tonStore.readAll).mockRejectedValue(new Error('Temporary storage read failure'));
    const wallet = start();
    await expect(wallet.withStoreLock(async () => 'metadata saved', false)).resolves.toBe('metadata saved');
    await expect(wallet.migrateOnUnlock(fixture.password)).rejects.toThrow('Temporary storage');
    vi.mocked(tonStore.readAll).mockResolvedValue(clone(disk));
    await wallet.migrateOnUnlock(fixture.password);
    expect(await wallet.decodeAccountMnemonic(disk[0].address)).toBe(fixture.accounts[0].phrase);
  });

  it('opens older unvalidated native phrases only when both stored identity checks match', async () => {
    disk = [];
    const wallet = await loaded();
    const phrase = 'public synthetic historical phrase with nonstandard words';
    const key = await tonMnemonic.mnemonicToKeyPair(phrase.split(' '));
    const address = wallet.getUserFriendlyAddress(wallet.createContractV4(key.publicKey).address);
    disk = [{ name: 'Historical fixture', address, publicKeyHex: Buffer.from(key.publicKey).toString('hex'),
      cipherSeed: CryptoJS.AES.encrypt(phrase, fixture.password).toString() }];
    const reopened = await loaded();
    await reopened.migrateOnUnlock(fixture.password);
    expect(reopened.hasRecoveryAccounts).toBe(false);
    expect(await reopened.decodeAccountMnemonic(address)).toBe(phrase);
    key.secretKey.fill(0);
  });

  it('refuses password rotation when a malformed TON record was skipped during load', async () => {
    const wallet = await loaded();
    tonStore.hasUnreadableRecords = true;
    await expect(wallet.withStoreLock(() => wallet.preparePasswordChange(fixture.password, 'next'))).rejects.toThrow('could not be loaded');
    expect(tonStore.saveMany).not.toHaveBeenCalled();
  });

  it('waits for a late TON load before reset and clears memory only after durable removal', async () => {
    let finishLoad!: (records: TonStoreAccount[]) => void;
    vi.mocked(tonStore.readAll).mockImplementationOnce(() => new Promise((resolve) => { finishLoad = resolve; }));
    const wallet = start();
    let finishRemoval!: () => void;
    const remove = vi.fn(() => new Promise<void>((resolve) => { finishRemoval = resolve; }));
    const resetting = wallet.reset(remove);
    await Promise.resolve();
    expect(remove).not.toHaveBeenCalled();
    finishLoad(clone(disk));
    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce());
    expect(wallet.getAccounts()).toHaveLength(2);
    finishRemoval();
    await resetting;
    expect(wallet.getAccounts()).toEqual([]);
    await expect(wallet.withStoreLock(async () => wallet.getAccounts())).resolves.toEqual([]);
  });

  it('keeps TON accounts in memory when reset storage removal fails', async () => {
    const wallet = await loaded();
    const before = wallet.getAccounts();
    await expect(wallet.reset(async () => { throw new Error('Synthetic reset storage failure'); })).rejects.toThrow();
    expect(wallet.getAccounts()).toEqual(before);
  });

  it('can reset after a failed startup read without poisoning the next wallet', async () => {
    vi.mocked(tonStore.readAll).mockRejectedValueOnce(new Error('Synthetic startup read failure'));
    const wallet = start();
    const remove = vi.fn(async () => {});
    await wallet.reset(remove);
    expect(remove).toHaveBeenCalledOnce();
    await expect(wallet.withStoreLock(async () => 'ready for a new wallet')).resolves.toBe('ready for a new wallet');
    expect(wallet.hasStorageIssues).toBe(false);
  });

});
