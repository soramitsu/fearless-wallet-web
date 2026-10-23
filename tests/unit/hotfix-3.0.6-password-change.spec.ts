// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Keyring } from '@subwallet/keyring/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import * as accountMetadata from '@extension-base/services/keyring-service/AccountMetadata';
import { accountStorageKey as storedAccountKey } from '@extension-base/services/keyring-service/AccountMetadata';
import { keyring } from '@subwallet/ui-keyring';
import { KeyringService } from '@extension-base/services/keyring-service';
import { preparePasswordRecords } from '@extension-base/services/keyring-service/PasswordChange';
import { PASSWORD_STORAGE_KEY, readWalletRecords, removeWalletRecords, writeWalletRecords } from '@extension-base/stores/WalletStorage';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import BaseWebStore from '@extension-base/stores/BaseWeb';
import { tonStore } from '@extension-base/stores/TonStore';
import fixture from '../fixtures/3.0.5/ton-accounts.json';
import type { EventService } from '@extension-base/services';
import type { KeyringPasswordJson, KeyringPair$Json } from '@subwallet/keyring/types';
import type { TonKeyringService } from '@extension-base/services/keyring-service/TonKeyring';

vi.mock('@/consts/global', () => ({ IS_EXTENSION: true }));
vi.mock('@subwallet/ui-keyring', () => ({
  keyring: {
    getPair: vi.fn(), getAccounts: vi.fn(() => []), accounts: { add: vi.fn() },
    resetWallet: vi.fn(),
    lockAll: vi.fn(),
    unlockKeyring: vi.fn(),
    keyring: { setupMasterPassword: vi.fn(), addFromJson: vi.fn() },
  },
}));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { add: vi.fn() } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: {} }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@/helpers', () => ({ isSameString: (a: string, b: string) => a === b }));
vi.mock('@extension-base/stores/BaseExtension', () => ({ default: class { static flush = vi.fn(async () => {}); } }));
vi.mock('@extension-base/stores/BaseWeb', () => ({ default: class { static flush = vi.fn(async () => {}); } }));
vi.mock('@extension-base/stores/CurrentAccountStore', () => ({ __esModule: true, default: class {} }));
vi.mock('@extension-base/stores/Accounts', () => ({ default: class { static flush = vi.fn(async () => {}); } }));
vi.mock('@extension-base/stores/KeyringStore', () => ({ __esModule: true, default: class {} }));
vi.mock('@extension-base/stores/KeyringStoreWeb', () => ({ default: class { static flush = vi.fn(async () => {}); static applyCommittedPassword = vi.fn(); } }));
vi.mock('@extension-base/stores/TonStore', () => ({
  tonStore: {
    getPrefix: () => 'fw:ton:',
    readAll: vi.fn(),
    saveMany: vi.fn(),
  },
}));
vi.mock('@extension-base/stores/WalletStorage', () => ({
  PASSWORD_STORAGE_KEY: 'fw:keyring',
  readWalletRecords: vi.fn(),
  writeWalletRecords: vi.fn(),
  removeWalletRecords: vi.fn(),
}));
vi.mock('@extension-base/services/keyring-service/TonKeyring', () => ({
  TonKeyringService: class {
    reset = vi.fn((operation: () => Promise<void>) => operation());
    withStoreLock = vi.fn((operation: () => Promise<unknown>) => operation());
    preparePasswordChange = vi.fn(async () => []);
    applyAccounts = vi.fn();
    migrateOnUnlock = vi.fn(async () => undefined);
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

// Real scrypt fixture creation can exceed the default hook timeout on busy hosts.
beforeAll(async () => {
  await cryptoWaitReady();
  const isolated = new Keyring({ type: 'sr25519' });
  const password = isolated.changeMasterPassword(OLD);
  const pair = isolated.addFromUri(PHRASE, { isMasterPassword: true, name: 'Public regression fixture' }, 'sr25519');
  const evmPair = isolated.addFromUri(PHRASE, { isMasterPassword: true, name: 'Public EVM fixture' }, 'ethereum');

  accountStorageKey = `fw:${storedAccountKey(pair)}`;
  evmStorageKey = `fw:${storedAccountKey(evmPair)}`;
  records = {
    [PASSWORD_STORAGE_KEY]: password,
    [accountStorageKey]: pair.toJson(OLD),
    [evmStorageKey]: evmPair.toJson(OLD),
  };
  pair.lock();
  evmPair.lock();
  isolated.lockALl();
}, 30_000);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(removeWalletRecords).mockResolvedValue(undefined);
  vi.mocked(BaseExtensionStore.flush).mockResolvedValue(undefined);
  vi.mocked(BaseWebStore.flush).mockResolvedValue(undefined);
  vi.mocked(keyring.resetWallet).mockImplementation(() => {});
  (readWalletRecords as Mock).mockResolvedValue(structuredClone(records));
  (writeWalletRecords as Mock).mockResolvedValue(undefined);
  (keyring.unlockKeyring as Mock).mockImplementation(() => undefined);
  (keyring.keyring.addFromJson as Mock).mockImplementation((json: KeyringPair$Json) => ({
    address: json.address,
    type: 'sr25519', publicKey: new Uint8Array(32),
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
  }, 30000);

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
  vi.setConfig({ testTimeout: 30000 });
  it('finishes a queued modern metadata update before the atomic rotation snapshot', async () => {
    const wallet = service();
    const durable = structuredClone(records);
    const pending = deferred();
    let queue = Promise.resolve<unknown>(undefined);
    vi.mocked(wallet.tonKeyring.withStoreLock).mockImplementation((operation) => {
      const next = queue.then(operation);
      queue = next.catch(() => undefined);
      return next;
    });
    const pair = new Keyring().createFromJson(records[accountStorageKey] as KeyringPair$Json);
    vi.spyOn(wallet, 'getPair').mockReturnValue(pair);
    const update = vi.spyOn(accountMetadata, 'updateAccountMetadata').mockImplementation(async (_pair, transform) => {
      await pending.promise;
      const json = durable[accountStorageKey] as KeyringPair$Json;
      json.meta = transform(json.meta, json)!;
      return true;
    });
    vi.mocked(readWalletRecords).mockImplementation(async () => structuredClone(durable));
    vi.mocked(writeWalletRecords).mockImplementation(async (batch) => { Object.assign(durable, structuredClone(batch)); });
    const rename = wallet.saveAccountMeta(pair.address, { name: 'Renamed before rotation', walletSecurityGeneration: 1 });
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
    const changing = wallet.changeMasterPassword({ oldPassword: OLD, newPassword: NEXT });
    await Promise.resolve();
    expect(readWalletRecords).not.toHaveBeenCalled();
    pending.resolve();
    await rename;
    await expect(changing).resolves.toBe(true);
    const final = durable[accountStorageKey] as KeyringPair$Json;
    expect(final.meta.name).toBe('Renamed before rotation');
    expect(final.meta.walletSecurityGeneration).toBeUndefined();
    const reopened = new Keyring().createFromJson(final);
    expect(reopened.exportMnemonic(NEXT)).toBe(PHRASE);
    reopened.lock();
    update.mockRestore();
  });

  it('creates the initial password for an empty wallet', async () => {
    const wallet = service();

    (readWalletRecords as Mock).mockResolvedValue({});
    await expect(wallet.changeMasterPassword({ newPassword: NEXT })).resolves.toBe(true);
    expect(writeWalletRecords).toHaveBeenCalledTimes(1);
    expect(Object.keys((writeWalletRecords as Mock).mock.calls[0][0])).toEqual([PASSWORD_STORAGE_KEY]);
  });

  it('restores Substrate, EVM and both TON fixture accounts with unchanged keys after restart', async () => {
    const { TonKeyringService: RealTonKeyring } = await vi.importActual<{ TonKeyringService: typeof TonKeyringService }>(
      '@extension-base/services/keyring-service/TonKeyring'
    );
    const durable = structuredClone(records);

    fixture.accounts.forEach(({ stored }) => {
      durable[`fw:ton:${stored.address}`] = structuredClone(stored);
    });
    (tonStore.readAll as Mock).mockImplementation(async () =>
      Object.entries(durable)
        .filter(([key]) => key.startsWith('fw:ton:'))
        .map(([, value]) => structuredClone(value))
    );
    (readWalletRecords as Mock).mockImplementation(async () => structuredClone(durable));
    (writeWalletRecords as Mock).mockImplementation(async (batch) => {
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

    (wallet.tonKeyring.preparePasswordChange as Mock).mockResolvedValue([tonRecord]);
    (writeWalletRecords as Mock).mockImplementation(() => pending.promise);
    const change = wallet.changeMasterPassword({ oldPassword: OLD, newPassword: NEXT });

    while (!(writeWalletRecords as Mock).mock.calls.length) await Promise.resolve();
    expect(writeWalletRecords).toHaveBeenCalledTimes(1);
    const batch = (writeWalletRecords as Mock).mock.calls[0][0];

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

    (writeWalletRecords as Mock).mockRejectedValue(new Error('Synthetic quota failure'));
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

    (wallet.tonKeyring.preparePasswordChange as Mock).mockRejectedValue(new Error('Synthetic corrupt TON record'));
    await expect(wallet.changeMasterPassword({ oldPassword: OLD, newPassword: NEXT })).resolves.toBe(false);
    expect(writeWalletRecords).not.toHaveBeenCalled();
    expect(keyring.keyring.setupMasterPassword).not.toHaveBeenCalled();
  });

  it('honors a lock during persistence without restoring the new password session', async () => {
    const wallet = service();
    const pending = deferred();

    (writeWalletRecords as Mock).mockImplementation(() => pending.promise);
    const change = wallet.changeMasterPassword({ oldPassword: OLD, newPassword: NEXT });

    while (!(writeWalletRecords as Mock).mock.calls.length) await Promise.resolve();
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

    (keyring.unlockKeyring as Mock).mockImplementation(() => {
      throw new Error('Synthetic wrong password');
    });
    await expect(wallet.unlockKeyring({ password: 'incorrect' })).resolves.toBe(false);
    expect(wallet.getPassword()).toBe('');
    expect(wallet.tonKeyring.migrateOnUnlock).not.toHaveBeenCalled();
  });

  it('waits for TON migration, then discloses a failure without locking out other wallets', async () => {
    const wallet = service();
    const pending = deferred();

    (wallet.tonKeyring.migrateOnUnlock as Mock).mockImplementation(() => pending.promise);
    const unlock = wallet.unlockKeyring({ password: OLD });

    expect(wallet.getPassword()).toBe('');
    pending.reject();
    await expect(unlock).resolves.toBe('ton-storage-unavailable');
    expect(wallet.getPassword()).toBe(OLD);
  });

  it('a lock during migration prevents its completion from unlocking the wallet', async () => {
    const wallet = service();
    const pending = deferred();

    (wallet.tonKeyring.migrateOnUnlock as Mock).mockImplementation(() => pending.promise);
    const unlock = wallet.unlockKeyring({ password: OLD });

    wallet.lockKeyring();
    pending.resolve();
    await expect(unlock).resolves.toBe(false);
    expect(wallet.getPassword()).toBe('');
    expect(keyring.unlockKeyring).toHaveBeenCalledTimes(1);
  });
  it('discloses partially unreadable TON records while keeping the verified session available', async () => {
    const wallet = service();
    Object.defineProperty(wallet.tonKeyring, 'hasStorageIssues', { value: true });
    await expect(wallet.unlockKeyring({ password: OLD })).resolves.toBe('ton-storage-unavailable');
    expect(wallet.getPassword()).toBe(OLD);
  });

});

describe('3.0.6 review: queued writes, committed changes and reset', () => {
  vi.setConfig({ testTimeout: 30000 });

  it('waits for writes the keyring library queued before reading the records it re-encrypts', async () => {
    const wallet = service();
    const pending = deferred();

    (BaseExtensionStore.flush as Mock).mockImplementation(() => pending.promise);
    const change = wallet.changeMasterPassword({ oldPassword: OLD, newPassword: NEXT });

    for (let step = 0; step < 20; step += 1) await Promise.resolve();
    expect(readWalletRecords).not.toHaveBeenCalled();
    pending.resolve();
    await expect(change).resolves.toBe(true);
    expect((BaseExtensionStore.flush as Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (readWalletRecords as Mock).mock.invocationCallOrder[0]
    );
  });

  it('stops before writing anything when a queued earlier write failed', async () => {
    const wallet = service();

    (BaseExtensionStore.flush as Mock).mockRejectedValue(new Error('An earlier wallet write failed'));
    await expect(wallet.changeMasterPassword({ oldPassword: OLD, newPassword: NEXT })).resolves.toBe(false);
    expect(readWalletRecords).not.toHaveBeenCalled();
    expect(writeWalletRecords).not.toHaveBeenCalled();
    expect(keyring.keyring.setupMasterPassword).not.toHaveBeenCalled();
  });

  it('reports a stored change, locked, when refreshing memory fails; after a restart only the new password opens it', async () => {
    const durable = structuredClone(records);

    (readWalletRecords as Mock).mockImplementation(async () => structuredClone(durable));
    (writeWalletRecords as Mock).mockImplementation(async (batch) => {
      Object.assign(durable, structuredClone(batch));
    });
    (keyring.keyring.addFromJson as Mock).mockImplementation(() => {
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

    (readWalletRecords as Mock).mockResolvedValue(leftovers);
    await expect(wallet.changeMasterPassword({ newPassword: NEXT })).resolves.toBe(true);
    expect(wallet.tonKeyring.preparePasswordChange).not.toHaveBeenCalled();

    const [batch] = (writeWalletRecords as Mock).mock.calls[0] as [Record<string, unknown>];

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

    (readWalletRecords as Mock).mockResolvedValue(stored);
    await expect(wallet.resetWallet()).resolves.toBe(true);
    expect(removeWalletRecords).toHaveBeenCalledTimes(1);
    expect([...(removeWalletRecords as Mock).mock.calls[0][0]].sort()).toEqual(
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
    expect((removeWalletRecords as Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (keyring.resetWallet as Mock).mock.invocationCallOrder[0]
    );
    expect(wallet.getPassword()).toBe('');
  });

  it('changes nothing when the reset cannot remove the stored records', async () => {
    const wallet = service();

    (removeWalletRecords as Mock).mockRejectedValue(new Error('Cannot save wallet storage'));
    await expect(wallet.resetWallet()).resolves.toBe(false);
    expect(keyring.resetWallet).not.toHaveBeenCalled();
  });

  it('reports a reset whose records are removed as done, locked, when clearing memory fails', async () => {
    const wallet = service();

    (keyring.resetWallet as Mock).mockImplementationOnce(() => {
      throw new Error('Synthetic memory cleanup failure');
    });
    await expect(wallet.resetWallet()).resolves.toBe(true);
    expect(removeWalletRecords).toHaveBeenCalledTimes(1);
    expect(wallet.getPassword()).toBe('');
    expect(keyring.lockAll).toHaveBeenCalled();

    // After a restart the storage is empty and a first password can be set again.
    (readWalletRecords as Mock).mockResolvedValue({});
    await expect(wallet.changeMasterPassword({ newPassword: NEXT })).resolves.toBe(true);
  });
});

describe('3.0.6 review: reset, unlock and password change exclude one another', () => {
  vi.setConfig({ testTimeout: 30000 });

  it('refuses unlock, a password change, another reset and account changes while a reset runs, then releases', async () => {
    const wallet = service();
    const removal = deferred();

    (removeWalletRecords as Mock).mockImplementation(() => removal.promise);
    const reset = wallet.resetWallet();

    while (!(removeWalletRecords as Mock).mock.calls.length) await Promise.resolve();
    await expect(wallet.unlockKeyring({ password: OLD })).resolves.toBe(false);
    await expect(wallet.changeMasterPassword({ newPassword: NEXT })).resolves.toBe(false);
    await expect(wallet.resetWallet()).resolves.toBe(false);
    await expect(wallet.forgetAccount('any account')).rejects.toThrow(/being changed/);
    expect(() => wallet.saveAddress('contact', {}, 'address')).toThrow(/being changed/);
    expect(() => wallet.forgetAddress('contact')).toThrow(/being changed/);
    expect(writeWalletRecords).not.toHaveBeenCalled();
    removal.resolve();
    await expect(reset).resolves.toBe(true);

    (readWalletRecords as Mock).mockResolvedValue({});
    await expect(wallet.changeMasterPassword({ newPassword: NEXT })).resolves.toBe(true);
  });

  it('refuses a reset while a password change is writing its batch', async () => {
    const wallet = service();
    const batch = deferred();

    (writeWalletRecords as Mock).mockImplementation(() => batch.promise);
    const change = wallet.changeMasterPassword({ oldPassword: OLD, newPassword: NEXT });

    while (!(writeWalletRecords as Mock).mock.calls.length) await Promise.resolve();
    await expect(wallet.resetWallet()).resolves.toBe(false);
    expect(removeWalletRecords).not.toHaveBeenCalled();
    batch.resolve();
    await expect(change).resolves.toBe(true);
  });

  it('releases the gate after a failed reset', async () => {
    const wallet = service();

    (removeWalletRecords as Mock).mockRejectedValueOnce(new Error('Cannot save wallet storage'));
    await expect(wallet.resetWallet()).resolves.toBe(false);
    await expect(wallet.resetWallet()).resolves.toBe(true);
  });
});


describe('reset waits for modern persistence and enrollment', () => {
  it('takes the removal snapshot only after delayed account writes finish', async () => {
    const wallet = service();
    const pending = deferred();
    const durable: Record<string, unknown> = {};
    vi.mocked(BaseExtensionStore.flush).mockImplementationOnce(async () => {
      await pending.promise;
      durable['fw:account:delayed'] = { encoded: 'old encrypted record' };
    });
    vi.mocked(readWalletRecords).mockImplementation(async () => structuredClone(durable));
    vi.mocked(removeWalletRecords).mockImplementation(async (keys) => { keys.forEach((key) => delete durable[key]); });
    const reset = wallet.resetWallet();
    await vi.waitFor(() => expect(BaseExtensionStore.flush).toHaveBeenCalled());
    expect(readWalletRecords).not.toHaveBeenCalled();
    pending.resolve();
    await expect(reset).resolves.toBe(true);
    expect(removeWalletRecords).toHaveBeenCalledWith(['fw:account:delayed']);
    expect(durable).toEqual({});
  });
});
