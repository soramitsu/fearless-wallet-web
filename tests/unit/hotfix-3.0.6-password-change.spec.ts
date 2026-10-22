/** @jest-environment node */
import { Keyring } from '@subwallet/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { accountKey } from '@subwallet/ui-keyring/defaults';
import { keyring } from '@subwallet/ui-keyring';
import { KeyringService } from '@extension-base/services/keyring-service';
import { preparePasswordRecords } from '@extension-base/services/keyring-service/PasswordChange';
import {
  PASSWORD_STORAGE_KEY,
  flushWalletWrites,
  readWalletRecords,
  removeWalletRecords,
  writeWalletRecords,
} from '@extension-base/stores/WalletStorage';
import { tonStore } from '@extension-base/stores/TonStore';
import fixture from '../fixtures/3.0.5/ton-accounts.json';
import type { EventService } from '@extension-base/services';
import type { KeyringPasswordJson, KeyringPair$Json, KeyringPair } from '@subwallet/keyring/types';
import type { TonKeyringService } from '@extension-base/services/keyring-service/TonKeyring';
import { WalletEcosystem } from '@/interfaces';

// The legacy keyring's duplicate-package detector resolves this subpath to ESM
// under Jest 27. Only package metadata is isolated; all key cryptography is real.
jest.mock('@subwallet/keyring/cjs/detectPackage', () => ({}));
jest.mock('@polkadot/util/packageInfo', () => ({
  packageInfo: { name: '@polkadot/util', version: '12.6.2', path: 'test' },
}));
jest.mock('@polkadot/util-crypto/packageInfo', () => ({
  packageInfo: { name: '@polkadot/util-crypto', version: '12.6.2', path: 'test' },
}));
jest.mock('@subwallet/ui-keyring', () => ({
  keyring: {
    lockAll: jest.fn(),
    unlockKeyring: jest.fn(),
    resetWallet: jest.fn(),
    addUri: jest.fn(),
    restoreAccount: jest.fn(),
    forgetAccount: jest.fn(),
    getAccount: jest.fn(),
    keyring: { setupMasterPassword: jest.fn(), addFromJson: jest.fn() },
  },
}));
jest.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { add: jest.fn() } }));
jest.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: {} }));
jest.mock('@sora-substrate/sdk', () => ({ api: {} }));
jest.mock('@/helpers', () => ({ isSameString: (a: string, b: string) => a === b }));
jest.mock('@extension-base/stores/CurrentAccountStore', () => ({ __esModule: true, default: class {} }));
jest.mock('@extension-base/stores/Accounts', () => ({ __esModule: true, default: class {} }));
jest.mock('@extension-base/stores/KeyringStore', () => ({ __esModule: true, default: class {} }));
jest.mock('@extension-base/stores/KeyringStoreWeb', () => ({ __esModule: true, default: class {} }));
jest.mock('@extension-base/stores/TonStore', () => ({
  tonStore: {
    getPrefix: () => 'fw:ton:',
    readAll: jest.fn(),
    saveMany: jest.fn(),
  },
}));
jest.mock('@extension-base/stores/WalletStorage', () => ({
  PASSWORD_STORAGE_KEY: 'fw:keyring',
  flushWalletWrites: jest.fn(),
  readWalletRecords: jest.fn(),
  removeWalletRecords: jest.fn(),
  writeWalletRecords: jest.fn(),
}));
jest.mock('@extension-base/services/keyring-service/TonKeyring', () => ({
  TonKeyringService: class {
    withStoreLock = jest.fn((operation: () => Promise<unknown>) => operation());
    preparePasswordChange = jest.fn(async () => []);
    applyAccounts = jest.fn();
    migrateOnUnlock = jest.fn(async () => undefined);
    reset = jest.fn((removeStoredWallet: () => Promise<void>) => removeStoredWallet());
  },
}));

const OLD = fixture.password;
const NEXT = 'public-test-only-new-password';
const PHRASE = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
let records: Record<string, unknown>;
let accountStorageKey: string;
let evmStorageKey: string;

function service() {
  return new KeyringService({ waitCryptoReady: new Promise(() => undefined) } as unknown as EventService);
}

function deferred() {
  let resolve!: () => void;
  let reject!: () => void;
  const promise = new Promise<void>((ok, fail) => {
    resolve = ok;
    reject = () => fail(new Error('Synthetic storage failure'));
  });

  return { promise, resolve, reject };
}

beforeAll(async () => {
  await cryptoWaitReady();
  const isolated = new Keyring({ type: 'sr25519' });
  const password = isolated.changeMasterPassword(OLD);
  const pair = isolated.addFromUri(PHRASE, { isMasterPassword: true, name: 'Public regression fixture' }, 'sr25519');
  const evmPair = isolated.addFromUri(PHRASE, { isMasterPassword: true, name: 'Public EVM fixture' }, 'ethereum');

  accountStorageKey = `fw:${accountKey(pair.address)}`;
  evmStorageKey = `fw:${accountKey(evmPair.address)}`;
  records = {
    [PASSWORD_STORAGE_KEY]: password,
    [accountStorageKey]: pair.toJson(OLD),
    [evmStorageKey]: evmPair.toJson(OLD),
  };
  pair.lock();
  evmPair.lock();
  isolated.lockALl();
});

beforeEach(() => {
  jest.clearAllMocks();
  (readWalletRecords as jest.Mock).mockResolvedValue(structuredClone(records));
  (writeWalletRecords as jest.Mock).mockResolvedValue(undefined);
  (flushWalletWrites as jest.Mock).mockResolvedValue(undefined);
  (removeWalletRecords as jest.Mock).mockResolvedValue(undefined);
  (keyring.unlockKeyring as jest.Mock).mockImplementation(() => undefined);
  (keyring.keyring.addFromJson as jest.Mock).mockImplementation((json: KeyringPair$Json) => ({
    address: json.address,
    type: 'sr25519',
  }));
});

describe('password rotation prepares and verifies records without changing the active wallet', () => {
  it('preserves the signing key and mnemonic and rejects the old password in the replacement', () => {
    const before = JSON.stringify(records);
    const prepared = preparePasswordRecords(records, OLD, NEXT);
    const isolated = new Keyring({ type: 'sr25519' });
    const restored = isolated.createFromJson(prepared.accounts[0]);

    expect(JSON.stringify(records)).toBe(before);
    expect(restored.exportMnemonic(NEXT) === PHRASE).toBe(true);
    restored.lock();
    expect(() => restored.decodePkcs8(OLD)).toThrow();
    isolated.setupMasterPassword(prepared.password.passwordHash);
    expect(() => isolated.unlockKeyring(NEXT)).not.toThrow();
    expect(() => isolated.unlockKeyring(OLD)).toThrow();
    expect(prepared.accounts[0].meta.name).toBe('Public regression fixture');
  });

  it('fails the complete preparation for a wrong master password', () => {
    expect(() => preparePasswordRecords(records, 'incorrect', NEXT)).toThrow();
  });

  // Changed by the 3.0.6 review: refusing the whole change here stranded accounts an interrupted 3.0.5 change had left
  // under the earlier password. An account neither password opens is now left exactly as stored.
  it('leaves a managed account that neither password opens as stored and changes the others', () => {
    const damaged = structuredClone(records);
    const json = damaged[accountStorageKey] as KeyringPair$Json;

    json.encoded = 'invalid encrypted account';
    const prepared = preparePasswordRecords(damaged, OLD, NEXT);

    expect(prepared.replacements[accountStorageKey]).toBeUndefined();
    expect(prepared.replacements[evmStorageKey]).toBeDefined();
    expect(prepared.accounts).toHaveLength(1);
    expect(writeWalletRecords).not.toHaveBeenCalled();
  });
});

describe('password changes commit as one batch', () => {
  // Real scrypt and TON key derivation for several accounts; well over the 5 s default on a loaded machine.
  jest.setTimeout(30000);

  it('serializes a pending metadata write before taking the password-change snapshot', async () => {
    const wallet = service();
    const durable = structuredClone(records);
    const metadataWrite = deferred();
    let operation = Promise.resolve<unknown>(undefined);

    (wallet.tonKeyring.withStoreLock as jest.Mock).mockImplementation((task: () => Promise<unknown>) => {
      const next = operation.then(task);

      operation = next.catch(() => undefined);

      return next;
    });
    const pair = new Keyring().createFromJson(records[accountStorageKey] as KeyringPair$Json);

    jest.spyOn(wallet, 'getPair').mockReturnValue(pair);
    (readWalletRecords as jest.Mock).mockImplementation(async () => structuredClone(durable));
    (writeWalletRecords as jest.Mock).mockImplementation(async (batch) => {
      if (!batch[PASSWORD_STORAGE_KEY]) await metadataWrite.promise;

      Object.assign(durable, structuredClone(batch));
    });
    const rename = wallet.saveAccountMeta(pair.address, { name: 'Renamed before rotation' });

    while (!(writeWalletRecords as jest.Mock).mock.calls.length) await Promise.resolve();

    const change = wallet.changeMasterPassword({ oldPassword: OLD, newPassword: NEXT });

    await Promise.resolve();
    expect(readWalletRecords).toHaveBeenCalledTimes(1);
    metadataWrite.resolve();
    await rename;
    await expect(change).resolves.toBe(true);
    expect((durable[accountStorageKey] as KeyringPair$Json).meta.name).toBe('Renamed before rotation');
    const restored = new Keyring().createFromJson(durable[accountStorageKey] as KeyringPair$Json);

    expect(restored.exportMnemonic(NEXT) === PHRASE).toBe(true);
    restored.lock();
  });

  it('does not publish metadata when its durable write fails', async () => {
    const wallet = service();
    const pair = new Keyring().createFromJson(records[accountStorageKey] as KeyringPair$Json);
    const setMeta = jest.spyOn(pair, 'setMeta');

    jest.spyOn(wallet, 'getPair').mockReturnValue(pair as KeyringPair);
    (writeWalletRecords as jest.Mock).mockRejectedValue(new Error('Synthetic metadata write error'));
    await expect(wallet.saveAccountMeta(pair.address, { name: 'Not saved' })).rejects.toThrow();
    expect(setMeta).not.toHaveBeenCalled();
  });

  it('creates the initial password for an empty wallet', async () => {
    const wallet = service();

    (readWalletRecords as jest.Mock).mockResolvedValue({});
    await expect(wallet.changeMasterPassword({ newPassword: NEXT })).resolves.toBe(true);
    expect(writeWalletRecords).toHaveBeenCalledTimes(1);
    expect(Object.keys((writeWalletRecords as jest.Mock).mock.calls[0][0])).toEqual([PASSWORD_STORAGE_KEY]);
  });

  it('restores Substrate, EVM and both TON fixture accounts with unchanged keys after restart', async () => {
    const { TonKeyringService: RealTonKeyring } = jest.requireActual<{ TonKeyringService: typeof TonKeyringService }>(
      '@extension-base/services/keyring-service/TonKeyring'
    );
    const durable = structuredClone(records);

    fixture.accounts.forEach(({ stored }) => {
      durable[`fw:ton:${stored.address}`] = structuredClone(stored);
    });
    (tonStore.readAll as jest.Mock).mockImplementation(async () =>
      Object.entries(durable)
        .filter(([key]) => key.startsWith('fw:ton:'))
        .map(([, value]) => structuredClone(value))
    );
    (readWalletRecords as jest.Mock).mockImplementation(async () => structuredClone(durable));
    (writeWalletRecords as jest.Mock).mockImplementation(async (batch) => {
      Object.assign(durable, structuredClone(batch));
    });
    const wallet = service();

    Object.defineProperty(wallet, 'tonKeyring', { value: new RealTonKeyring(wallet) });
    await expect(wallet.changeMasterPassword({ oldPassword: OLD, newPassword: NEXT })).resolves.toBe(true);
    expect(writeWalletRecords).toHaveBeenCalledTimes(1);

    const restarted = new Keyring({ type: 'sr25519' });

    restarted.setupMasterPassword((durable[PASSWORD_STORAGE_KEY] as KeyringPasswordJson).passwordHash);
    expect(() => restarted.unlockKeyring(NEXT)).not.toThrow();

    for (const storageKey of [accountStorageKey, evmStorageKey]) {
      const original = restarted.createFromJson(records[storageKey] as KeyringPair$Json);
      const restored = restarted.createFromJson(durable[storageKey] as KeyringPair$Json);

      original.decodePkcs8(OLD);
      expect(restored.exportMnemonic(NEXT) === PHRASE).toBe(true);
      expect(Buffer.from(restored.publicKey).equals(Buffer.from(original.publicKey))).toBe(true);
      expect(restored.address === original.address).toBe(true);
      original.lock();
      restored.lock();
      expect(() => restored.decodePkcs8(OLD)).toThrow();
    }

    const reopened = new RealTonKeyring({ getPassword: () => NEXT } as KeyringService);

    for (const { phrase, stored } of fixture.accounts) {
      expect((await reopened.decodeAccountMnemonic(stored.address)) === phrase).toBe(true);
      expect(() =>
        reopened.decodeMnemonic((durable[`fw:ton:${stored.address}`] as typeof stored).cipherSeed, OLD)
      ).toThrow();
    }

    restarted.lockALl();
  });

  it('includes verifier, managed accounts and TON accounts in one awaited write', async () => {
    const wallet = service();
    const pending = deferred();
    const tonRecord = {
      address: 'synthetic-ton-address',
      name: 'Fixture',
      cipherSeed: 'synthetic-new-ciphertext',
      publicKeyHex: '00',
    };

    (wallet.tonKeyring.preparePasswordChange as jest.Mock).mockResolvedValue([tonRecord]);
    (writeWalletRecords as jest.Mock).mockImplementation(() => pending.promise);
    const change = wallet.changeMasterPassword({ oldPassword: OLD, newPassword: NEXT });

    while (!(writeWalletRecords as jest.Mock).mock.calls.length) await Promise.resolve();
    expect(writeWalletRecords).toHaveBeenCalledTimes(1);
    const batch = (writeWalletRecords as jest.Mock).mock.calls[0][0];

    expect(Object.keys(batch).sort()).toEqual(
      [PASSWORD_STORAGE_KEY, accountStorageKey, evmStorageKey, 'fw:ton:synthetic-ton-address'].sort()
    );
    expect(keyring.keyring.setupMasterPassword).not.toHaveBeenCalled();
    expect(wallet.tonKeyring.applyAccounts).not.toHaveBeenCalled();
    expect(wallet.getPassword()).toBe('');
    pending.resolve();
    await expect(change).resolves.toBe(true);
    expect(wallet.tonKeyring.applyAccounts).toHaveBeenCalledWith([tonRecord]);
    expect(wallet.getPassword()).toBe(NEXT);
  });

  it('preserves old durable records and stays locked when the batch fails', async () => {
    const wallet = service();
    const before = JSON.stringify(records);

    (writeWalletRecords as jest.Mock).mockRejectedValue(new Error('Synthetic quota failure'));
    await expect(wallet.changeMasterPassword({ oldPassword: OLD, newPassword: NEXT })).resolves.toBe(false);
    expect(JSON.stringify(records)).toBe(before);
    expect(keyring.keyring.setupMasterPassword).not.toHaveBeenCalled();
    expect(keyring.keyring.addFromJson).not.toHaveBeenCalled();
    expect(wallet.tonKeyring.applyAccounts).not.toHaveBeenCalled();
    expect(wallet.getPassword()).toBe('');
    const isolated = new Keyring();

    isolated.setupMasterPassword((records[PASSWORD_STORAGE_KEY] as KeyringPasswordJson).passwordHash);
    expect(() => isolated.unlockKeyring(OLD)).not.toThrow();
  });

  it('does not change any password if a TON record fails verification', async () => {
    const wallet = service();

    (wallet.tonKeyring.preparePasswordChange as jest.Mock).mockRejectedValue(new Error('Synthetic corrupt TON record'));
    await expect(wallet.changeMasterPassword({ oldPassword: OLD, newPassword: NEXT })).resolves.toBe(false);
    expect(writeWalletRecords).not.toHaveBeenCalled();
    expect(keyring.keyring.setupMasterPassword).not.toHaveBeenCalled();
  });

  it('honors a lock during persistence without restoring the new password session', async () => {
    const wallet = service();
    const pending = deferred();

    (writeWalletRecords as jest.Mock).mockImplementation(() => pending.promise);
    const change = wallet.changeMasterPassword({ oldPassword: OLD, newPassword: NEXT });

    while (!(writeWalletRecords as jest.Mock).mock.calls.length) await Promise.resolve();
    wallet.lockKeyring();
    pending.resolve();
    await expect(change).resolves.toBe(true);
    expect(wallet.getPassword()).toBe('');
    expect(keyring.unlockKeyring).not.toHaveBeenCalled();
  });
});

describe('unlock session and migration', () => {
  it('returns an explicit recovery warning after successfully securing older-password TON records', async () => {
    const wallet = service();

    Object.defineProperty(wallet.tonKeyring, 'hasRecoveryAccounts', { value: true });
    await expect(wallet.unlockKeyring({ password: OLD })).resolves.toBe('ton-recovery-required');
    expect(wallet.getPassword()).toBe(OLD);
  });

  it('never retains a password rejected by the master verifier', async () => {
    const wallet = service();

    (keyring.unlockKeyring as jest.Mock).mockImplementation(() => {
      throw new Error('Synthetic wrong password');
    });
    await expect(wallet.unlockKeyring({ password: 'incorrect' })).resolves.toBe(false);
    expect(wallet.getPassword()).toBe('');
    expect(wallet.tonKeyring.migrateOnUnlock).not.toHaveBeenCalled();
  });

  it('does not cache the password before migration settles', async () => {
    const wallet = service();
    const pending = deferred();

    (wallet.tonKeyring.migrateOnUnlock as jest.Mock).mockImplementation(() => pending.promise);
    const unlock = wallet.unlockKeyring({ password: OLD });

    expect(wallet.getPassword()).toBe('');
    pending.resolve();
    await expect(unlock).resolves.toBe(true);
    expect(wallet.getPassword()).toBe(OLD);
  });

  it('still unlocks when the TON upgrade fails; the records stay as stored for the next unlock', async () => {
    const wallet = service();
    const pending = deferred();

    (wallet.tonKeyring.migrateOnUnlock as jest.Mock).mockImplementation(() => pending.promise);
    const unlock = wallet.unlockKeyring({ password: OLD });

    expect(wallet.getPassword()).toBe('');
    pending.reject();
    await expect(unlock).resolves.toBe(true);
    expect(wallet.getPassword()).toBe(OLD);
    expect(writeWalletRecords).not.toHaveBeenCalled();
  });

  it('a lock during migration prevents its completion from unlocking the wallet', async () => {
    const wallet = service();
    const pending = deferred();

    (wallet.tonKeyring.migrateOnUnlock as jest.Mock).mockImplementation(() => pending.promise);
    const unlock = wallet.unlockKeyring({ password: OLD });

    wallet.lockKeyring();
    pending.resolve();
    await expect(unlock).resolves.toBe(false);
    expect(wallet.getPassword()).toBe('');
    expect(keyring.unlockKeyring).toHaveBeenCalledTimes(1);
  });
});

describe('3.0.6 review: queued writes, committed changes and reset', () => {
  jest.setTimeout(30000);

  it('waits for writes the keyring library queued before reading the records it re-encrypts', async () => {
    const wallet = service();
    const pending = deferred();

    (flushWalletWrites as jest.Mock).mockImplementation(() => pending.promise);
    const change = wallet.changeMasterPassword({ oldPassword: OLD, newPassword: NEXT });

    for (let step = 0; step < 20; step += 1) await Promise.resolve();
    expect(readWalletRecords).not.toHaveBeenCalled();
    pending.resolve();
    await expect(change).resolves.toBe(true);
    expect((flushWalletWrites as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (readWalletRecords as jest.Mock).mock.invocationCallOrder[0]
    );
  });

  it('stops before writing anything when a queued earlier write failed', async () => {
    const wallet = service();

    (flushWalletWrites as jest.Mock).mockRejectedValue(new Error('An earlier wallet write failed'));
    await expect(wallet.changeMasterPassword({ oldPassword: OLD, newPassword: NEXT })).resolves.toBe(false);
    expect(readWalletRecords).not.toHaveBeenCalled();
    expect(writeWalletRecords).not.toHaveBeenCalled();
    expect(keyring.keyring.setupMasterPassword).not.toHaveBeenCalled();
  });

  it('reports a stored change, locked, when refreshing memory fails; after a restart only the new password opens it', async () => {
    const durable = structuredClone(records);

    (readWalletRecords as jest.Mock).mockImplementation(async () => structuredClone(durable));
    (writeWalletRecords as jest.Mock).mockImplementation(async (batch) => {
      Object.assign(durable, structuredClone(batch));
    });
    (keyring.keyring.addFromJson as jest.Mock).mockImplementation(() => {
      throw new Error('Synthetic in-memory refresh failure');
    });
    const wallet = service();

    await expect(wallet.changeMasterPassword({ oldPassword: OLD, newPassword: NEXT })).resolves.toBe(true);
    expect(writeWalletRecords).toHaveBeenCalledTimes(1);
    expect(wallet.getPassword()).toBe('');
    expect(keyring.unlockKeyring).not.toHaveBeenCalled();
    expect(keyring.keyring.setupMasterPassword).toHaveBeenCalledWith(
      (durable[PASSWORD_STORAGE_KEY] as KeyringPasswordJson).passwordHash
    );

    const restarted = new Keyring({ type: 'sr25519' });

    restarted.setupMasterPassword((durable[PASSWORD_STORAGE_KEY] as KeyringPasswordJson).passwordHash);
    expect(() => restarted.unlockKeyring(OLD)).toThrow();
    expect(() => restarted.unlockKeyring(NEXT)).not.toThrow();

    for (const storageKey of [accountStorageKey, evmStorageKey]) {
      const restored = restarted.createFromJson(durable[storageKey] as KeyringPair$Json);

      expect(() => restored.decodePkcs8(NEXT)).not.toThrow();
      restored.lock();
    }

    restarted.lockALl();
  });

  it('sets a first password without opening or rewriting TON records left by an earlier reset', async () => {
    const leftovers: Record<string, unknown> = {
      'fw:ton:leftover': { name: 'Leftover', address: 'leftover', cipherSeed: 'x', publicKeyHex: '0'.repeat(64) },
    };
    const wallet = service();

    (readWalletRecords as jest.Mock).mockResolvedValue(leftovers);
    await expect(wallet.changeMasterPassword({ newPassword: NEXT })).resolves.toBe(true);
    expect(wallet.tonKeyring.preparePasswordChange).not.toHaveBeenCalled();

    const [batch] = (writeWalletRecords as jest.Mock).mock.calls[0] as [Record<string, unknown>];

    expect(Object.keys(batch)).toEqual([PASSWORD_STORAGE_KEY]);
  });

  it('resets verifier, accounts, address book and TON records in one removal, then clears memory', async () => {
    const stored = {
      ...structuredClone(records),
      'fw:address:0x01': { address: 'contact' },
      'fw:contract:0x02': { address: 'contract' },
      'fw:ton:one': { name: 'TON', address: 'one', cipherSeed: 'x', publicKeyHex: '0'.repeat(64) },
      'fw:authUrls': { kept: true },
      'fw:CurrentAccountInfo': { kept: true },
    };
    const wallet = service();

    (readWalletRecords as jest.Mock).mockResolvedValue(stored);
    await expect(wallet.resetWallet()).resolves.toBe(true);
    expect(removeWalletRecords).toHaveBeenCalledTimes(1);
    expect([...(removeWalletRecords as jest.Mock).mock.calls[0][0]].sort()).toEqual(
      [
        PASSWORD_STORAGE_KEY,
        accountStorageKey,
        evmStorageKey,
        'fw:address:0x01',
        'fw:contract:0x02',
        'fw:ton:one',
      ].sort()
    );
    expect(wallet.tonKeyring.reset).toHaveBeenCalledTimes(1);
    expect(keyring.resetWallet).toHaveBeenCalledWith(true);
    expect((removeWalletRecords as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (keyring.resetWallet as jest.Mock).mock.invocationCallOrder[0]
    );
    expect(wallet.getPassword()).toBe('');
  });

  it('changes nothing when the reset cannot remove the stored records', async () => {
    const wallet = service();

    (removeWalletRecords as jest.Mock).mockRejectedValue(new Error('Cannot save wallet storage'));
    await expect(wallet.resetWallet()).resolves.toBe(false);
    expect(keyring.resetWallet).not.toHaveBeenCalled();
  });

  it('reports a reset whose records are removed as done, locked, when clearing memory fails', async () => {
    const wallet = service();

    (keyring.resetWallet as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Synthetic memory cleanup failure');
    });
    await expect(wallet.resetWallet()).resolves.toBe(true);
    expect(removeWalletRecords).toHaveBeenCalledTimes(1);
    expect(wallet.getPassword()).toBe('');
    expect(keyring.lockAll).toHaveBeenCalled();

    // After a restart the storage is empty and a first password can be set again.
    (readWalletRecords as jest.Mock).mockResolvedValue({});
    await expect(wallet.changeMasterPassword({ newPassword: NEXT })).resolves.toBe(true);
  });
});

describe('3.0.6 review: reset, unlock and password change exclude one another', () => {
  jest.setTimeout(30000);

  it('refuses unlock, a password change, another reset and account changes while a reset runs, then releases', async () => {
    const wallet = service();
    const removal = deferred();

    (removeWalletRecords as jest.Mock).mockImplementation(() => removal.promise);
    const reset = wallet.resetWallet();

    while (!(removeWalletRecords as jest.Mock).mock.calls.length) await Promise.resolve();
    await expect(wallet.unlockKeyring({ password: OLD })).resolves.toBe(false);
    await expect(wallet.changeMasterPassword({ newPassword: NEXT })).resolves.toBe(false);
    await expect(wallet.resetWallet()).resolves.toBe(false);
    expect(() => wallet.forgetAccount('any account')).toThrow(/being changed/);
    expect(writeWalletRecords).not.toHaveBeenCalled();
    removal.resolve();
    await expect(reset).resolves.toBe(true);

    (readWalletRecords as jest.Mock).mockResolvedValue({});
    await expect(wallet.changeMasterPassword({ newPassword: NEXT })).resolves.toBe(true);
  });

  it('refuses a reset while a password change is writing its batch', async () => {
    const wallet = service();
    const batch = deferred();

    (writeWalletRecords as jest.Mock).mockImplementation(() => batch.promise);
    const change = wallet.changeMasterPassword({ oldPassword: OLD, newPassword: NEXT });

    while (!(writeWalletRecords as jest.Mock).mock.calls.length) await Promise.resolve();
    await expect(wallet.resetWallet()).resolves.toBe(false);
    expect(removeWalletRecords).not.toHaveBeenCalled();
    batch.resolve();
    await expect(change).resolves.toBe(true);
  });

  it('releases the gate after a failed reset', async () => {
    const wallet = service();

    (removeWalletRecords as jest.Mock).mockRejectedValueOnce(new Error('Cannot save wallet storage'));
    await expect(wallet.resetWallet()).resolves.toBe(false);
    await expect(wallet.resetWallet()).resolves.toBe(true);
  });
});

describe('3.0.6 review: accounts left under an earlier password stay recoverable', () => {
  jest.setTimeout(30000);

  const THIRD = 'public-test-only-third-password';
  const verifierFor = (password: string) => new Keyring({ type: 'sr25519' }).changeMasterPassword(password);

  const opensWith = (json: unknown, password: string) => {
    const pair = new Keyring({ type: 'sr25519' }).createFromJson(json as KeyringPair$Json);

    try {
      pair.decodePkcs8(password);

      return true;
    } catch {
      return false;
    } finally {
      pair.lock();
    }
  };

  // 3.0.5 stored the verifier for NEXT before rewriting the accounts, which an interruption left under OLD.
  const interrupted = () => ({ ...structuredClone(records), [PASSWORD_STORAGE_KEY]: verifierFor(NEXT) });

  it('repairs them when the earlier password is chosen again, as 3.0.5 did', () => {
    const prepared = preparePasswordRecords(interrupted(), NEXT, OLD);

    expect(prepared.accounts).toHaveLength(2);
    [accountStorageKey, evmStorageKey].forEach((key) => expect(opensWith(prepared.replacements[key], OLD)).toBe(true));
  });

  it('changes to another password leaving them as stored, and they can still be repaired afterwards', () => {
    const split = interrupted();
    const prepared = preparePasswordRecords(split, NEXT, THIRD);

    expect(Object.keys(prepared.replacements)).toEqual([PASSWORD_STORAGE_KEY]);

    const repaired = preparePasswordRecords({ ...split, ...prepared.replacements }, THIRD, OLD);

    expect(repaired.accounts).toHaveLength(2);
    expect(opensWith(repaired.replacements[accountStorageKey], OLD)).toBe(true);
  });

  it('sets a first password over leftover accounts instead of refusing every one', () => {
    const leftovers = structuredClone(records);

    delete leftovers[PASSWORD_STORAGE_KEY];
    expect(preparePasswordRecords(leftovers, '', OLD).accounts).toHaveLength(2);
    expect(preparePasswordRecords(leftovers, '', NEXT).accounts).toHaveLength(0);
  });

  it('still refuses a wrong current password, and still stops when an opened account fails verification', () => {
    const misfiled = structuredClone(records);

    misfiled['fw:account:0x00'] = misfiled[accountStorageKey];
    expect(() => preparePasswordRecords(structuredClone(records), 'public-wrong-password', NEXT)).toThrow();
    expect(() => preparePasswordRecords(misfiled, OLD, NEXT)).toThrow('Account storage address mismatch');
  });
});

describe('3.0.6 review: adding an account reports a failed save', () => {
  it('reports success only after the added account was written', async () => {
    const wallet = service();

    (keyring.addUri as jest.Mock).mockReturnValue({ pair: { address: 'added' } });
    await expect(wallet.addAccount(PHRASE, { name: 'Added' }, WalletEcosystem.Substrate)).resolves.toBe('added');
    expect(flushWalletWrites).toHaveBeenCalledTimes(2);
    expect((keyring.addUri as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (flushWalletWrites as jest.Mock).mock.invocationCallOrder[1]
    );
    expect(keyring.forgetAccount).not.toHaveBeenCalled();
  });

  it('takes the account out again and reports the failure when its write failed', async () => {
    const wallet = service();

    (keyring.addUri as jest.Mock).mockReturnValue({ pair: { address: 'added' } });
    (flushWalletWrites as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('An earlier wallet write failed'));
    await expect(wallet.addAccount(PHRASE, { name: 'Added' }, WalletEcosystem.Substrate)).rejects.toThrow(
      'could not be saved'
    );
    expect(keyring.forgetAccount).toHaveBeenCalledWith('added');
  });

  it('does the same for a JSON import', async () => {
    const wallet = service();

    (keyring.restoreAccount as jest.Mock).mockReturnValue({ address: 'restored' });
    (flushWalletWrites as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('An earlier wallet write failed'));
    await expect(wallet.restoreAccount({ address: 'restored', meta: {} } as never, OLD)).rejects.toThrow(
      'could not be saved'
    );
    expect(keyring.forgetAccount).toHaveBeenCalledWith('restored');
  });
});
