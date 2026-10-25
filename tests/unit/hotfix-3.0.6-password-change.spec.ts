// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
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
import type { TransformStoredRecords } from '@extension-base/stores/StoreMutation';

const memory = vi.hoisted(() => ({ backend: undefined as unknown as Keyring, passwordHash: '', locked: true, accounts: { value: {} as Record<string, unknown> } }));

vi.mock('@/consts/global', () => ({ IS_EXTENSION: true }));
vi.mock('@subwallet/ui-keyring', () => ({
  keyring: {
    getPair: vi.fn((address: string) => memory.backend.getPair(address)),
    getAccounts: vi.fn(() => memory.backend.getPairs().map(({ address, meta }) => ({ address, meta }))),
    createFromJson: (json: KeyringPair$Json) => memory.backend.createFromJson(json),
    accounts: { add: vi.fn(), subject: memory.accounts, removeSubjectOnly: vi.fn() },
    addresses: { subject: { value: {} }, removeSubjectOnly: vi.fn() },
    contracts: { subject: { value: {} }, removeSubjectOnly: vi.fn() },
    lockAll: vi.fn(() => { memory.locked = true; memory.backend.getPairs().forEach(pair => pair.lock()); }),
    unlockKeyring: vi.fn(() => { memory.locked = false; }),
    keyring: {
      get hasMasterPassword() { return !!memory.passwordHash; },
      get isLocked() { return memory.locked; },
      setupMasterPassword: vi.fn((hash: string) => { memory.passwordHash = hash; }),
      addFromJson: vi.fn((json: KeyringPair$Json) => memory.backend.addFromJson(json)),
      removePair: vi.fn((address: string) => memory.backend.removePair(address)),
      resetPassword: vi.fn(() => { memory.passwordHash = ''; }),
    },
  },
}));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: memory.accounts } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@/helpers', () => ({ isSameString: (a: string, b: string) => a === b }));
vi.mock('@extension-base/stores/BaseExtension', () => ({ default: class { static flush = vi.fn(async () => {}); } }));
vi.mock('@extension-base/stores/BaseWeb', () => ({ default: class { static flush = vi.fn(async () => {}); } }));
vi.mock('@extension-base/stores/CurrentAccountStore', () => ({ __esModule: true, default: class {} }));
vi.mock('@extension-base/stores/Accounts', () => ({ default: class {
  static flush = vi.fn(async () => {});
  async allMap(update: (records: Record<string, unknown>) => void) {
    update(Object.fromEntries(Object.entries(await readWalletRecords()).map(([key, value]) => [key.slice(3), value])));
  }
  async mutateRecordsAndWait(_keys: string[] | null, transform: TransformStoredRecords, publish?: () => void) {
    // Match the production acknowledgement boundary, including reset's archive-before-remove ordering.
    await BaseExtensionStore.flush();
    const current = Object.fromEntries(Object.entries(await readWalletRecords()).map(([key, value]) => [key.slice(3), value]));
    const { entries, remove } = transform(current);
    if (Object.keys(entries).length) await writeWalletRecords(Object.fromEntries(Object.entries(entries).map(([key, value]) => [`fw:${key}`, value])));
    if (remove.length) await removeWalletRecords(remove.map(key => `fw:${key}`));
    publish?.();
  }
} }));
vi.mock('@extension-base/stores/KeyringStore', () => ({ __esModule: true, default: class {} }));
vi.mock('@extension-base/stores/KeyringStoreWeb', () => ({ default: class { static flush = vi.fn(async () => {}); static applyCommittedPassword = vi.fn(); } }));
vi.mock('@extension-base/stores/TonStore', () => ({
  tonStore: {
    getPrefix: () => 'fw:ton:',
    readAll: vi.fn(),
    saveMany: vi.fn(),
    getAndWait: vi.fn(),
    updateAndWait: vi.fn(),
  },
}));
vi.mock('@extension-base/stores/WalletStorage', () => ({
  PASSWORD_STORAGE_KEY: 'fw:keyring',
  readWalletRecords: vi.fn(),
  writeWalletRecords: vi.fn(),
  removeWalletRecords: vi.fn(),
}));
vi.mock('@extension-base/services/keyring-service/LegacyNetworkEnrollment', () => ({ enrollLegacyAccountNetworks: vi.fn() }));
vi.mock('@extension-base/stores/LegacyPasswordPromptStore', () => ({ default: class { getAndWait = async () => undefined; } }));

const OLD = fixture.password;
const NEXT = 'public-test-only-new-password';
const PHRASE = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
let records: Record<string, unknown>;
let accountStorageKey: string;
let evmStorageKey: string;

const services: KeyringService[] = [];
function service() {
  const wallet = new KeyringService({ waitCryptoReady: new Promise(() => undefined) } as unknown as EventService);
  vi.spyOn(wallet, 'setCurrentAccount').mockResolvedValue(undefined);
  services.push(wallet);
  return wallet;
}
afterEach(() => { services.splice(0).forEach(wallet => wallet.lockKeyring()); vi.restoreAllMocks(); });

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
  memory.backend = new Keyring({ type: 'sr25519' });
  memory.passwordHash = (records[PASSWORD_STORAGE_KEY] as KeyringPasswordJson).passwordHash;
  memory.locked = true;
  const durable = structuredClone(records);
  for (const key of [accountStorageKey, evmStorageKey]) memory.backend.addFromJson(durable[key] as KeyringPair$Json);
  memory.accounts.value = Object.fromEntries(memory.backend.getPairs().map(pair => [pair.address, {}]));
  vi.mocked(keyring.getPair).mockImplementation(address => memory.backend.getPair(address));
  vi.mocked(keyring.getAccounts).mockImplementation(() => memory.backend.getPairs().map(({ address, meta }) => ({ address, meta })) as never);
  vi.mocked(keyring.keyring.setupMasterPassword).mockImplementation(hash => { memory.passwordHash = hash!; });
  vi.mocked(keyring.keyring.addFromJson).mockImplementation(json => memory.backend.addFromJson(json));
  vi.mocked(keyring.keyring.resetPassword).mockImplementation(() => { memory.passwordHash = ''; });
  vi.mocked(keyring.unlockKeyring).mockImplementation(() => { memory.locked = false; });
  vi.mocked(removeWalletRecords).mockImplementation(async keys => { keys.forEach(key => delete durable[key]); });
  vi.mocked(BaseExtensionStore.flush).mockResolvedValue(undefined);
  vi.mocked(BaseWebStore.flush).mockResolvedValue(undefined);
  vi.mocked(readWalletRecords).mockImplementation(async () => structuredClone(durable));
  vi.mocked(writeWalletRecords).mockImplementation(async batch => { Object.assign(durable, structuredClone(batch)); });
  vi.mocked(tonStore.readAll).mockResolvedValue([]);
  vi.mocked(tonStore.getAndWait).mockImplementation(async address => (await readWalletRecords())[`fw:ton:${address}`] as never);
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
    vi.spyOn(wallet.tonKeyring.vault, 'exclusive').mockImplementation((operation) => {
      const next = queue.then(operation);
      queue = next.catch(() => undefined);
      return next;
    });
    const pair = memory.backend.getPair((records[accountStorageKey] as KeyringPair$Json).address);
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

    memory.passwordHash = '';
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
    const tonRecord = structuredClone(fixture.accounts[0].stored);
    vi.mocked(tonStore.readAll).mockResolvedValue([tonRecord]);
    vi.mocked(readWalletRecords).mockResolvedValue({ ...records, [`fw:ton:${tonRecord.address}`]: tonRecord });
    const wallet = service();
    await wallet.tonKeyring.loadAll();
    const publish = vi.spyOn(wallet.tonKeyring, 'setAccounts');
    const pending = deferred();
    const submitted = deferred();
    vi.mocked(writeWalletRecords).mockImplementation(() => {
      submitted.resolve();
      return pending.promise;
    });
    const change = wallet.changeMasterPassword({ oldPassword: OLD, newPassword: NEXT });

    // Real key derivation can take over a second on a busy host. Synchronize on
    // the storage boundary being tested, rather than Vitest's 1s polling limit.
    await Promise.race([
      submitted.promise,
      change.then(() => { throw new Error('Password change completed before submitting storage'); }),
    ]);
    expect(writeWalletRecords).toHaveBeenCalledOnce();
    const batch = vi.mocked(writeWalletRecords).mock.calls[0][0];
    expect(Object.keys(batch).sort()).toEqual([PASSWORD_STORAGE_KEY, accountStorageKey, evmStorageKey, `fw:ton:${tonRecord.address}`].sort());
    expect(keyring.keyring.setupMasterPassword).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(wallet.getPassword()).toBe('');
    pending.resolve();
    await expect(change).resolves.toBe(true);
    expect(publish).toHaveBeenCalledOnce();
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
    expect(keyring.accounts.add).not.toHaveBeenCalled();
    expect(wallet.getPassword()).toBe('');
    const isolated = new Keyring();

    isolated.setupMasterPassword((records[PASSWORD_STORAGE_KEY] as KeyringPasswordJson).passwordHash);
    expect(() => isolated.unlockKeyring(OLD)).not.toThrow();
  });

  it('preserves an inaccessible TON record while rotating accounts that verify', async () => {
    const tonRecord = { ...fixture.accounts[0].stored, cipherSeed: 'invalid encrypted account' };
    vi.mocked(tonStore.readAll).mockResolvedValue([tonRecord]);
    vi.mocked(readWalletRecords).mockResolvedValue({ ...records, [`fw:ton:${tonRecord.address}`]: tonRecord });
    const wallet = service();
    await wallet.tonKeyring.loadAll();
    await expect(wallet.changeMasterPassword({ oldPassword: OLD, newPassword: NEXT })).resolves.toBe(true);
    const batch = vi.mocked(writeWalletRecords).mock.calls[0][0];
    expect(batch).not.toHaveProperty(`fw:ton:${tonRecord.address}`);
    expect(wallet.tonKeyring.accountSubject.value[tonRecord.address].cipherSeed).toBe(tonRecord.cipherSeed);
    expect(batch).toHaveProperty(PASSWORD_STORAGE_KEY);
  });

  it('honors a lock during persistence without restoring the new password session', async () => {
    const wallet = service();
    const pending = deferred();

    (writeWalletRecords as Mock).mockImplementation(() => pending.promise);
    const change = wallet.changeMasterPassword({ oldPassword: OLD, newPassword: NEXT });

    await vi.waitFor(() => expect(writeWalletRecords).toHaveBeenCalled());
    wallet.lockKeyring();
    pending.resolve();
    await expect(change).resolves.toBe(false);
    expect(wallet.getPassword()).toBe('');
    expect(keyring.unlockKeyring).not.toHaveBeenCalled();
  });
});

describe('unlock session and optional account-access scan', () => {
  it('reports an older-password TON account through Account access without blocking unlock', async () => {
    const record = fixture.accounts[0].stored;
    vi.mocked(tonStore.readAll).mockResolvedValue([record]);
    vi.mocked(readWalletRecords).mockResolvedValue({ ...records, [`fw:ton:${record.address}`]: record });
    const wallet = service();
    await wallet.tonKeyring.loadAll();
    expect(wallet.unlockKeyring({ password: NEXT })).toBe(true);
    await wallet.waitForAccessScan();
    expect(wallet.getPassword()).toBe(NEXT);
    expect((await wallet.getAccessStatus()).issues).toContainEqual(expect.objectContaining({ address: record.address, kind: 'previous_master_password' }));
  });

  it('never retains a password rejected by the master verifier', () => {
    const wallet = service();
    const scan = vi.spyOn(wallet.tonKeyring.vault, 'decryptVerified');
    vi.mocked(keyring.unlockKeyring).mockImplementation(() => { throw new Error('Synthetic wrong password'); });
    expect(wallet.unlockKeyring({ password: 'incorrect' })).toBe(false);
    expect(wallet.getPassword()).toBe('');
    expect(scan).not.toHaveBeenCalled();
  });

  it('keeps the verified session available if the optional TON scan fails', async () => {
    vi.mocked(tonStore.readAll).mockResolvedValue([fixture.accounts[0].stored]);
    const wallet = service();
    await wallet.tonKeyring.loadAll();
    const pending = deferred();
    vi.spyOn(wallet.tonKeyring.vault, 'decryptVerified').mockImplementation(async () => { await pending.promise; return ''; });
    expect(wallet.unlockKeyring({ password: OLD })).toBe(true);
    expect(wallet.getPassword()).toBe(OLD);
    await vi.waitFor(() => expect(wallet.tonKeyring.vault.decryptVerified).toHaveBeenCalled());
    pending.reject();
    await wallet.waitForAccessScan();
    expect(wallet.getPassword()).toBe(OLD);
    expect((await wallet.getAccessStatus()).scanComplete).toBe(true);
  });

  it('a lock cancels a pending optional scan without reopening the wallet', async () => {
    vi.mocked(tonStore.readAll).mockResolvedValue([fixture.accounts[0].stored]);
    const wallet = service();
    await wallet.tonKeyring.loadAll();
    const pending = deferred();
    const scan = vi.spyOn(wallet.tonKeyring.vault, 'decryptVerified').mockImplementation(async () => { await pending.promise; return ''; });
    expect(wallet.unlockKeyring({ password: OLD })).toBe(true);
    await vi.waitFor(() => expect(scan).toHaveBeenCalled());
    wallet.lockKeyring();
    expect(scan.mock.calls[0][2]!()).toBe(false);
    pending.resolve();
    await wallet.waitForAccessScan();
    expect(wallet.getPassword()).toBe('');
    expect((await wallet.getAccessStatus()).scanComplete).toBe(false);
  });

  it('retains partially unreadable TON storage for recovery without blocking the verified session', async () => {
    const wallet = service();
    Object.defineProperty(wallet.tonKeyring, 'hasStorageIssues', { value: true });
    expect(wallet.unlockKeyring({ password: OLD })).toBe(true);
    expect(wallet.tonKeyring.hasStorageIssues).toBe(true);
    expect(wallet.getPassword()).toBe(OLD);
    expect(removeWalletRecords).not.toHaveBeenCalled();
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

  it('reports a stored change as unconfirmed and locked when memory fails; after restart only the new password opens it', async () => {
    const durable = structuredClone(records);

    (readWalletRecords as Mock).mockImplementation(async () => structuredClone(durable));
    (writeWalletRecords as Mock).mockImplementation(async (batch) => {
      Object.assign(durable, structuredClone(batch));
    });
    (keyring.keyring.addFromJson as Mock).mockImplementation(() => {
      throw new Error('Synthetic in-memory refresh failure');
    });
    const wallet = service();

    await expect(wallet.changeMasterPassword({ oldPassword: OLD, newPassword: NEXT })).resolves.toBe(false);
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

    memory.passwordHash = '';
    (readWalletRecords as Mock).mockResolvedValue(leftovers);
    await expect(wallet.changeMasterPassword({ newPassword: NEXT })).resolves.toBe(true);
    expect(leftovers['fw:ton:leftover']).toMatchObject({ cipherSeed: 'x' });

    const [batch] = (writeWalletRecords as Mock).mock.calls[0] as [Record<string, unknown>];

    expect(Object.keys(batch)).toEqual([PASSWORD_STORAGE_KEY]);
  });

  it('archives native wallets, retains TON and removes active records before clearing memory', async () => {
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
        'fw:legacyPasswordPrompt',
      ].sort()
    );
    const archives = Object.keys(vi.mocked(writeWalletRecords).mock.calls[0][0]);
    expect(archives.every(key => key.startsWith('fw:deletedWallet:'))).toBe(true);
    expect(keyring.keyring.resetPassword).toHaveBeenCalledOnce();
    expect((removeWalletRecords as Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (keyring.keyring.resetPassword as Mock).mock.invocationCallOrder[0]
    );
    expect(wallet.getPassword()).toBe('');
  });

  it('changes nothing when the reset cannot remove the stored records', async () => {
    const wallet = service();

    (removeWalletRecords as Mock).mockRejectedValue(new Error('Cannot save wallet storage'));
    await expect(wallet.resetWallet()).resolves.toBe(false);
    expect(keyring.keyring.resetPassword).not.toHaveBeenCalled();
  });

  it('reports a reset whose records are removed as done, locked, when clearing memory fails', async () => {
    const wallet = service();

    (keyring.keyring.resetPassword as Mock).mockImplementationOnce(() => {
      throw new Error('Synthetic memory cleanup failure');
    });
    await expect(wallet.resetWallet()).resolves.toBe(true);
    expect(removeWalletRecords).toHaveBeenCalledTimes(1);
    expect(wallet.getPassword()).toBe('');
    expect(memory.backend.getPairs().every(pair => pair.isLocked)).toBe(true);

    // After a restart the storage is empty and a first password can be set again.
    memory.passwordHash = '';
    (readWalletRecords as Mock).mockResolvedValue({});
    await expect(wallet.changeMasterPassword({ newPassword: NEXT })).resolves.toBe(true);
  });
});

describe('3.0.6 review: reset, unlock and password change exclude one another', () => {
  vi.setConfig({ testTimeout: 30000 });

  it('refuses unlock and password changes, coalesces reset and queues account removal until reset completes', async () => {
    const wallet = service();
    const removal = deferred();
    vi.mocked(removeWalletRecords).mockImplementationOnce(() => removal.promise);
    const reset = wallet.resetWallet();
    await vi.waitFor(() => expect(removeWalletRecords).toHaveBeenCalled());
    expect(wallet.unlockKeyring({ password: OLD })).toBe(false);
    expect(keyring.unlockKeyring).not.toHaveBeenCalled();
    await expect(wallet.changeMasterPassword({ newPassword: NEXT })).resolves.toBe(false);
    expect(wallet.resetWallet()).toBe(reset);
    let forgotten = false;
    const forgetting = wallet.forgetAccount((records[accountStorageKey] as KeyringPair$Json).address).then(() => { forgotten = true; });
    await Promise.resolve();
    expect(forgotten).toBe(false);
    const writesBeforeRemoval = vi.mocked(writeWalletRecords).mock.calls.length;
    removal.resolve();
    await expect(reset).resolves.toBe(true);
    await forgetting;
    expect(writeWalletRecords).toHaveBeenCalledTimes(writesBeforeRemoval);
    memory.passwordHash = '';
    vi.mocked(readWalletRecords).mockResolvedValue({});
    await expect(wallet.changeMasterPassword({ newPassword: NEXT })).resolves.toBe(true);
  });

  it('queues a reset until an earlier password batch is acknowledged', async () => {
    const wallet = service();
    const batch = deferred();
    vi.mocked(writeWalletRecords).mockImplementationOnce(() => batch.promise);
    const changing = wallet.changeMasterPassword({ oldPassword: OLD, newPassword: NEXT });
    await vi.waitFor(() => expect(writeWalletRecords).toHaveBeenCalled());
    const reset = wallet.resetWallet();
    expect(removeWalletRecords).not.toHaveBeenCalled();
    batch.resolve();
    await expect(changing).resolves.toBe(true);
    await expect(reset).resolves.toBe(true);
    expect(removeWalletRecords).toHaveBeenCalledOnce();
    expect(wallet.getPassword()).toBe('');
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
      Object.assign(durable, structuredClone(records));
    });
    vi.mocked(readWalletRecords).mockImplementation(async () => structuredClone(durable));
    vi.mocked(removeWalletRecords).mockImplementation(async (keys) => { keys.forEach((key) => delete durable[key]); });
    const reset = wallet.resetWallet();
    await vi.waitFor(() => expect(BaseExtensionStore.flush).toHaveBeenCalled());
    expect(readWalletRecords).not.toHaveBeenCalled();
    pending.resolve();
    await expect(reset).resolves.toBe(true);
    expect(removeWalletRecords).toHaveBeenCalledWith(expect.arrayContaining([accountStorageKey, evmStorageKey, PASSWORD_STORAGE_KEY]));
    expect(durable).toEqual({});
  });
});
