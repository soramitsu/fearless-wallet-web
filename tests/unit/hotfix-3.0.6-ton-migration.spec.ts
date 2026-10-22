/** @jest-environment node */
import { cryptoWaitReady } from '@polkadot/util-crypto';
import {
  TonKeyringService,
  isLegacyTonSeed,
} from '../../src/extension/background/extension-base/src/services/keyring-service/TonKeyring';
import { tonStore } from '../../src/extension/background/extension-base/src/stores/TonStore';
import fixture from '../fixtures/3.0.5/ton-accounts.json';
import type { TonStoreAccount } from '../../src/extension/background/extension-base/src/stores/TonStore';

jest.mock('../../src/extension/background/extension-base/src/stores/TonStore', () => ({
  tonStore: { readAll: jest.fn(), saveMany: jest.fn(), removeAccount: jest.fn() },
}));

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
let disk: TonStoreAccount[];

function start(password = fixture.password) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keyringService: any = { getPassword: () => password };
  const keyring = new TonKeyringService(keyringService);

  keyringService.tonKeyring = keyring;

  return keyring;
}

async function loaded(password = fixture.password) {
  const keyring = start(password);

  await keyring.withStoreLock(async () => undefined);

  return keyring;
}

describe('TON storage encryption and durable upgrade', () => {
  jest.setTimeout(30000);
  beforeAll(async () => {
    await cryptoWaitReady();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    disk = clone(fixture.accounts.map(({ stored }) => stored));
    (tonStore.readAll as jest.Mock).mockImplementation(async () => clone(disk));
    (tonStore.saveMany as jest.Mock).mockImplementation(async (records: TonStoreAccount[]) => {
      const next = new Map(disk.map((record) => [record.address, record]));

      records.forEach((record) => next.set(record.address, clone(record)));
      disk = [...next.values()];
    });
    (tonStore.removeAccount as jest.Mock).mockImplementation(async (address: string) => {
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
    expect((tonStore.saveMany as jest.Mock).mock.calls[0][0]).toHaveLength(2);
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

    (tonStore.saveMany as jest.Mock).mockRejectedValueOnce(new Error('simulated quota failure'));
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

    (tonStore.saveMany as jest.Mock).mockImplementationOnce(
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

    (tonStore.readAll as jest.Mock).mockImplementationOnce(
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

    (tonStore.saveMany as jest.Mock).mockRejectedValueOnce(new Error('simulated quota failure'));
    await expect(keyring.createAccount(sample.phrase, 'Imported', fixture.password)).rejects.toThrow('quota');
    expect(keyring.getAccounts()).toHaveLength(0);
    await keyring.createAccount(sample.phrase, 'Imported', fixture.password);
    expect(disk).toHaveLength(1);
    expect(isLegacyTonSeed(disk[0].cipherSeed)).toBe(false);
    expect(disk[0].address).toBe(sample.stored.address);
    expect((await keyring.decodeAccountMnemonic(sample.stored.address)) === sample.phrase).toBe(true);
  });

  it('keeps upgrading the other accounts when one record cannot be processed', async () => {
    const unknown = { ...disk[0], cipherSeed: 'not a record this wallet wrote' };

    disk = [unknown, disk[1]];
    const keyring = await loaded();

    expect(keyring.hasRecoveryAccounts).toBe(false);
    await expect(keyring.migrateOnUnlock(fixture.password)).resolves.toBeUndefined();
    expect(disk.find(({ address }) => address === unknown.address)).toEqual(unknown);
    expect(
      isLegacyTonSeed(disk.find(({ address }) => address === fixture.accounts[1].stored.address)!.cipherSeed)
    ).toBe(false);
    expect(keyring.hasRecoveryAccounts).toBe(false);
  });

  it('upgrades a 3.0.5 record whose phrase fails phrase validation but derives its stored key', async () => {
    // 3.0.5 stored phrases without validating them; a synthetic phrase that is neither valid BIP39 nor a valid TON
    // phrase stands for such an account.
    const keyring = await loaded();
    const words = Array(24).fill('abandon');
    const { publicKey } = await keyring.mnemonicToKeyPair(words);
    const address = keyring.getUserFriendlyAddress(keyring.createContractV4(publicKey).address);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const CryptoJS = require('crypto-js');
    const record = {
      name: 'Unvalidated',
      address,
      cipherSeed: CryptoJS.AES.encrypt(words.join(' '), fixture.password).toString(),
      publicKeyHex: Buffer.from(publicKey).toString('hex'),
    };

    expect(await keyring.validateMnemonic(words)).toBe(false);
    disk = [record];
    const restarted = await loaded();

    await restarted.migrateOnUnlock(fixture.password);
    expect(JSON.parse(disk[0].cipherSeed).version).toBe(2);
    expect(restarted.hasRecoveryAccounts).toBe(false);
    expect((await restarted.decodeAccountMnemonic(address)) === words.join(' ')).toBe(true);
  });

  it('reset drops the accounts only after the stored records are gone, also when loading had failed', async () => {
    const keyring = await loaded();
    const removeStored = jest.fn(async () => {
      disk = [];
    });

    await expect(keyring.reset(jest.fn().mockRejectedValue(new Error('Cannot save wallet storage')))).rejects.toThrow(
      'Cannot save'
    );
    expect(keyring.getAccounts()).toHaveLength(2);

    await keyring.reset(removeStored);
    expect(removeStored).toHaveBeenCalledTimes(1);
    expect(keyring.getAccounts()).toHaveLength(0);
    expect(disk).toHaveLength(0);

    (tonStore.readAll as jest.Mock).mockRejectedValueOnce(new Error('Cannot read wallet storage'));
    const unloaded = start();

    await expect(unloaded.withStoreLock(async () => undefined)).rejects.toThrow('Cannot read');
    await expect(unloaded.reset(removeStored)).resolves.toBeUndefined();
    expect(unloaded.getAccounts()).toHaveLength(0);
  });
});
