/** @jest-environment node */
import { Keyring } from '@subwallet/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { accountKey } from '@subwallet/ui-keyring/defaults';
import { keyring } from '@subwallet/ui-keyring';
import { KeyringService } from '@extension-base/services/keyring-service';
import { preparePasswordRecords } from '@extension-base/services/keyring-service/PasswordChange';
import { PASSWORD_STORAGE_KEY, readWalletRecords, writeWalletRecords } from '@extension-base/stores/WalletStorage';
import { tonStore } from '@extension-base/stores/TonStore';
import fixture from '../fixtures/3.0.5/ton-accounts.json';
import type { EventService } from '@extension-base/services';
import type { KeyringPasswordJson, KeyringPair$Json, KeyringPair } from '@subwallet/keyring/types';
import type { TonKeyringService } from '@extension-base/services/keyring-service/TonKeyring';

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
  readWalletRecords: jest.fn(),
  writeWalletRecords: jest.fn(),
}));
jest.mock('@extension-base/services/keyring-service/TonKeyring', () => ({
  TonKeyringService: class {
    withStoreLock = jest.fn((operation: () => Promise<unknown>) => operation());
    preparePasswordChange = jest.fn(async () => []);
    applyAccounts = jest.fn();
    migrateOnUnlock = jest.fn(async () => undefined);
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

  it('fails the complete preparation if one managed account cannot decrypt', () => {
    const damaged = structuredClone(records);
    const json = damaged[accountStorageKey] as KeyringPair$Json;

    json.encoded = 'invalid encrypted account';
    expect(() => preparePasswordRecords(damaged, OLD, NEXT)).toThrow();
    expect(writeWalletRecords).not.toHaveBeenCalled();
  });
});

describe('password changes commit as one batch', () => {
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

  it('does not report success or cache the password before migration commits', async () => {
    const wallet = service();
    const pending = deferred();

    (wallet.tonKeyring.migrateOnUnlock as jest.Mock).mockImplementation(() => pending.promise);
    const unlock = wallet.unlockKeyring({ password: OLD });

    expect(wallet.getPassword()).toBe('');
    pending.reject();
    await expect(unlock).resolves.toBe(false);
    expect(wallet.getPassword()).toBe('');
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
