import CryptoJS from 'crypto-js';
import { Keyring as DetachedKeyring } from '@subwallet/keyring/keyring';
import * as tonWebMnemonic from 'tonweb-mnemonic';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tonStore } from '@extension-base/stores/TonStore';
import { KeyringService } from '@extension-base/services/keyring-service';
import { decryptTonSeed } from '@extension-base/services/keyring-service/TonSeedVault';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import legacyVectors from '../fixtures/ton/ton-bip39-3.0.5-vectors.json';
import type { KeyringPasswordJson } from '@subwallet/keyring/types';
import type { TonStoreAccount } from '@extension-base/stores/TonStore';
import { createTonWalletContractV4R2 } from '@/util/tonKeyring';
import { WalletEcosystem } from '@/interfaces';

const mocks = vi.hoisted(() => ({
  records: new Map<string, TonStoreAccount>(),
  failWrites: false,
  failReads: false,
  beforeWrite: undefined as undefined | (() => Promise<void>),
  keyring: { hash: '', master: '' },
  passwordRecord: undefined as KeyringPasswordJson | undefined,
  changeMasterPassword: vi.fn(),
  prompt: new Map<string, unknown>(),
}));

// An in-memory chrome.storage double for `fw:ton:*` that, like BaseExtensionStore.updateAndWait,
// hands the transform a copy of the stored record and publishes only after the write.
vi.mock('@extension-base/stores/TonStore', () => {
  const copy = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

  return {
    tonStore: {
      // Like chrome.storage, the records arrive after the keyring service is constructed.
      all: async (update: (address: string, record: TonStoreAccount) => void) => {
        await Promise.resolve();
        for (const [address, record] of mocks.records) update(address, copy(record));
      },
      set: vi.fn((address: string, record: TonStoreAccount) => mocks.records.set(address, copy(record))),
      getAndWait: vi.fn(async (address: string) => {
        if (mocks.failReads) throw new Error('read unavailable');
        return copy(mocks.records.get(address));
      }),
      remove: vi.fn((address: string) => mocks.records.delete(address)),
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
  },
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
  changeMasterPassword: mocks.changeMasterPassword,
  lockAll: () => { mocks.keyring.master = ''; },
  resetWallet: () => { mocks.keyring.hash = ''; mocks.keyring.master = ''; },
} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@extension-base/stores/CurrentAccountStore', () => ({ default: class {} }));
vi.mock('@extension-base/stores/Accounts', () => {
  const snapshot = () => ({ keyring: structuredClone(mocks.passwordRecord),
    ...Object.fromEntries([...mocks.records].map(([address, record]) => [`ton:${address}`, structuredClone(record)])) });
  return { default: class {
    async allMap(update: (records: Record<string, unknown>) => void) {
      if (mocks.failReads) throw new Error('read unavailable');
      update(snapshot());
    }
    async mutateRecordsAndWait(_keys: string[], transform, publish: () => void) {
      const { entries, remove } = transform(snapshot());
      expect(remove).toEqual([]);
      await mocks.beforeWrite?.();
      if (mocks.failWrites) throw new Error('disk unavailable');
      for (const [key, value] of Object.entries(entries)) {
        if (key === 'keyring') mocks.passwordRecord = structuredClone(value) as KeyringPasswordJson;
        else if (key.startsWith('ton:')) mocks.records.set(key.slice(4), structuredClone(value) as TonStoreAccount);
      }
      publish();
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
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));

// tonweb derives native and 3.0.x keys with 100 000 PBKDF2 rounds per check.
const PBKDF2_SUITE = { timeout: 120_000 };
const P0 = 'password used before the 3.0.5 change';
const P1 = 'current master password';
const P2 = 'new master password';

type Fixture = { name: string; phrase: string; publicKeyHex: string; address: string };

function fixture(name: string, phrase: string, publicKeyHex: string): Fixture {
  const address = createTonWalletContractV4R2(Buffer.from(publicKeyHex, 'hex')).address.toString({ bounceable: false, urlSafe: true });

  return { name, phrase, publicKeyHex, address };
}

// Public test phrases only; never fund them.
const NATIVE = fixture(
  'Native TON',
  'cluster notice abandon frost gospel boring element situate click mix vague replace imitate garment useful crater resource dose tenant theme foam ancient phrase slight',
  '34eb4b67d64f74d989ce2bc2e3dfddb7ed4cb0eec92f29fbecd05b1eabab0254'
);
const UNIVERSAL = fixture('Universal TON', vectors.vectors[0].mnemonic, vectors.vectors[0].expected.ton.publicKeyHex);
const LEGACY = fixture('TON from BIP39 in 3.0.5', legacyVectors.vectors[0].mnemonic, legacyVectors.vectors[0].publicKeyHex);
const ALL = [NATIVE, UNIVERSAL, LEGACY];

function record(source: Fixture, password: string, extra: Partial<TonStoreAccount> = {}): TonStoreAccount {
  return {
    name: source.name,
    address: source.address,
    cipherSeed: CryptoJS.AES.encrypt(source.phrase, password).toString(),
    publicKeyHex: source.publicKeyHex,
    ...extra,
  };
}

// A fresh service worker over the stored records, with the keyring's password hash set to `hash`.
async function wallet(hash: string, records?: TonStoreAccount[]) {
  if (records) mocks.records = new Map(records.map((value) => [value.address, value]));
  mocks.keyring.hash = hash;
  mocks.passwordRecord = hash ? new DetachedKeyring().changeMasterPassword(hash) : undefined;
  mocks.keyring.master = '';
  const service = new KeyringService({ waitCryptoReady: new Promise(() => {}) } as never);
  await service.tonKeyring.loadAll();

  return service;
}

const exportTon = (service: KeyringService, address: string, password?: string) =>
  service.exportAccountMnemonic({ address, password, walletEcosystem: WalletEcosystem.Ton });

const stored = (address: string) => mocks.records.get(address)!;
const publicKey = (source: Fixture) => Buffer.from(source.publicKeyHex, 'hex');

beforeEach(() => {
  vi.mocked(tonStore.updateAndWait).mockClear();
  mocks.failWrites = false;
  mocks.failReads = false;
  mocks.beforeWrite = undefined;
  mocks.prompt.clear();
  mocks.changeMasterPassword.mockReset().mockImplementation((next: string, old?: string) => {
    if (mocks.keyring.hash && old !== mocks.keyring.hash) throw new Error('Invalid master password');
    if (!next) throw new Error('Require new password');
    mocks.keyring.hash = next;
    mocks.keyring.master = next;
  });
});

describe('durable TON account import', PBKDF2_SUITE, () => {
  const importUniversal = (service: KeyringService, name = 'Imported TON') =>
    service.addAccount(UNIVERSAL.phrase, { name }, WalletEcosystem.Ton);
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
  };

  it('does not publish or answer success before the seed write commits', async () => {
    const service = await wallet(P1, []);
    expect(service.unlockKeyring({ password: P1 })).toBe(true);
    const entered = deferred();
    const release = deferred();
    mocks.beforeWrite = async () => { entered.resolve(); await release.promise; };
    let answered = false;
    const imported = importUniversal(service).then((address) => { answered = true; return address; });
    try {
      await Promise.race([entered.promise, imported]);
      expect(answered).toBe(false);
      expect(service.tonKeyring.getAccounts()).toEqual([]);
      expect(mocks.records.size).toBe(0);
    } finally {
      release.resolve();
      await imported;
    }
    expect(service.tonKeyring.getAccounts().map(({ address }) => address)).toEqual([UNIVERSAL.address]);
    const restarted = await wallet(P1);
    expect(restarted.unlockKeyring({ password: P1 })).toBe(true);
    await expect(exportTon(restarted, UNIVERSAL.address, P1)).resolves.toEqual({ seed: UNIVERSAL.phrase });
  });

  it('rejects a failed write, publishes nothing, and allows an explicit retry', async () => {
    const service = await wallet(P1, []);
    expect(service.unlockKeyring({ password: P1 })).toBe(true);
    mocks.failWrites = true;
    await expect(importUniversal(service)).rejects.toThrow('disk unavailable');
    expect(service.tonKeyring.getAccounts()).toEqual([]);
    expect(mocks.records.size).toBe(0);
    mocks.failWrites = false;
    await expect(importUniversal(service)).resolves.toBe(UNIVERSAL.address);
    expect(await decryptTonSeed(stored(UNIVERSAL.address).cipherSeed, P1, publicKey(UNIVERSAL))).toBe(UNIVERSAL.phrase);
  });

  it('rejects a failed durable read without treating the account as new', async () => {
    const service = await wallet(P1, []);
    expect(service.unlockKeyring({ password: P1 })).toBe(true);
    const existing = { ...record(UNIVERSAL, P1), futureField: 'preserved' };
    mocks.records.set(UNIVERSAL.address, existing);
    mocks.failReads = true;
    await expect(importUniversal(service)).rejects.toThrow('read unavailable');
    expect(stored(UNIVERSAL.address)).toEqual(existing);
    expect(service.tonKeyring.getAccounts()).toEqual([]);
  });

  it('preserves an existing durable record absent from the in-memory inventory', async () => {
    const service = await wallet(P1, []);
    expect(service.unlockKeyring({ password: P1 })).toBe(true);
    const existing = { ...record(UNIVERSAL, P1), futureField: 'preserved' };
    mocks.records.set(UNIVERSAL.address, existing);
    await expect(importUniversal(service, 'Do not rename')).resolves.toBe(UNIVERSAL.address);
    expect(stored(UNIVERSAL.address)).toEqual(existing);
    expect(service.tonKeyring.accountSubject.value[UNIVERSAL.address].name).toBe(existing.name);
  });

  it('coalesces concurrent imports without replacing the first committed record', async () => {
    const service = await wallet(P1, []);
    expect(service.unlockKeyring({ password: P1 })).toBe(true);
    await expect(Promise.all([importUniversal(service, 'First import'), importUniversal(service, 'Second import')]))
      .resolves.toEqual([UNIVERSAL.address, UNIVERSAL.address]);
    expect(stored(UNIVERSAL.address).name).toBe('First import');
    expect(tonStore.updateAndWait).toHaveBeenCalledOnce();
  });

  it('queues imports behind a password change and reads the new password when it runs', async () => {
    const service = await wallet(P1, []);
    expect(service.unlockKeyring({ password: P1 })).toBe(true);
    const release = deferred();
    const blocker = service.tonKeyring.vault.exclusive(() => release.promise);
    const change = service.changeMasterPassword({ oldPassword: P1, newPassword: P2 });
    const imported = importUniversal(service);
    // Derivation may complete before the vault queue opens. It must not persist under P1.
    await new Promise((resolve) => setTimeout(resolve, 40));
    release.resolve();
    await blocker;
    await expect(change).resolves.toBe(true);
    await expect(imported).resolves.toBe(UNIVERSAL.address);
    expect(await decryptTonSeed(stored(UNIVERSAL.address).cipherSeed, P2, publicKey(UNIVERSAL))).toBe(UNIVERSAL.phrase);
    const restarted = await wallet(P2);
    expect(restarted.unlockKeyring({ password: P2 })).toBe(true);
    await expect(exportTon(restarted, UNIVERSAL.address, P2)).resolves.toEqual({ seed: UNIVERSAL.phrase });
  });

  it('does not import under the old password after a password change has already taken its account snapshot', async () => {
    const service = await wallet(P1, [record(NATIVE, P1)]);
    expect(service.unlockKeyring({ password: P1 })).toBe(true);
    const entered = deferred();
    const release = deferred();
    mocks.beforeWrite = async () => { entered.resolve(); await release.promise; };
    const change = service.changeMasterPassword({ oldPassword: P1, newPassword: P2 });
    await entered.promise;
    const imported = importUniversal(service);
    mocks.beforeWrite = undefined;
    // The password/account commit is pending. A late import must wait for P2.
    await new Promise((resolve) => setTimeout(resolve, 40));
    release.resolve();
    await expect(change).resolves.toBe(true);
    await expect(imported).resolves.toBe(UNIVERSAL.address);
    expect(await decryptTonSeed(stored(UNIVERSAL.address).cipherSeed, P2, publicKey(UNIVERSAL))).toBe(UNIVERSAL.phrase);
  });

  it('keeps the earlier ciphertext and inventory when repairing an existing import fails to persist', async () => {
    const original = { ...record(UNIVERSAL, P0), futureField: 'preserved' };
    const service = await wallet(P1, [original]);
    expect(service.unlockKeyring({ password: P1 })).toBe(true);
    mocks.failWrites = true;
    await expect(importUniversal(service)).rejects.toThrow('disk unavailable');
    expect(stored(UNIVERSAL.address)).toEqual(original);
    expect(service.tonKeyring.accountSubject.value[UNIVERSAL.address].cipherSeed).toBe(original.cipherSeed);
    mocks.failWrites = false;
    await expect(importUniversal(service)).resolves.toBe(UNIVERSAL.address);
    expect(stored(UNIVERSAL.address)).toMatchObject({ name: original.name, futureField: 'preserved' });
    expect(await decryptTonSeed(stored(UNIVERSAL.address).cipherSeed, P1, publicKey(UNIVERSAL))).toBe(UNIVERSAL.phrase);
  });

  it('rejects a conflicting durable public key without replacing or publishing that record', async () => {
    const service = await wallet(P1, []);
    expect(service.unlockKeyring({ password: P1 })).toBe(true);
    const original = { ...record(UNIVERSAL, P1), publicKeyHex: NATIVE.publicKeyHex };
    mocks.records.set(UNIVERSAL.address, original);
    await expect(importUniversal(service)).rejects.toMatchObject({ code: 'account_key_mismatch' });
    expect(stored(UNIVERSAL.address)).toEqual(original);
    expect(service.tonKeyring.getAccounts()).toEqual([]);
    expect(tonStore.updateAndWait).not.toHaveBeenCalled();
  });

  it('keeps a record that appears after the import read, requiring a fresh retry', async () => {
    const service = await wallet(P1, []);
    expect(service.unlockKeyring({ password: P1 })).toBe(true);
    const original = { ...record(UNIVERSAL, P1), futureField: 'preserved' };
    vi.mocked(tonStore.getAndWait).mockImplementationOnce(async () => {
      mocks.records.set(UNIVERSAL.address, original);
      return undefined;
    });
    await expect(importUniversal(service)).rejects.toMatchObject({ code: 'account_changed' });
    expect(stored(UNIVERSAL.address)).toEqual(original);
    expect(service.tonKeyring.getAccounts()).toEqual([]);
    await expect(importUniversal(service)).resolves.toBe(UNIVERSAL.address);
    expect(stored(UNIVERSAL.address)).toEqual(original);
  });

  it('includes a pending import in the password change that follows it', async () => {
    const service = await wallet(P1, []);
    expect(service.unlockKeyring({ password: P1 })).toBe(true);
    const entered = deferred();
    const release = deferred();
    mocks.beforeWrite = async () => { entered.resolve(); await release.promise; };
    const imported = importUniversal(service);
    await Promise.race([entered.promise, imported]);
    const change = service.changeMasterPassword({ oldPassword: P1, newPassword: P2 });
    mocks.beforeWrite = undefined;
    release.resolve();
    await expect(imported).resolves.toBe(UNIVERSAL.address);
    await expect(change).resolves.toBe(true);
    expect(await decryptTonSeed(stored(UNIVERSAL.address).cipherSeed, P2, publicKey(UNIVERSAL))).toBe(UNIVERSAL.phrase);
  });

  it('rejects a locked import without returning an unstored address', async () => {
    const service = await wallet(P1, []);
    await expect(importUniversal(service)).rejects.toMatchObject({ code: 'keyring_locked' });
    expect(mocks.records.size).toBe(0);
    expect(service.tonKeyring.getAccounts()).toEqual([]);
  });

  it('rechecks a lock while an import waits for the vault', async () => {
    const service = await wallet(P1, []);
    expect(service.unlockKeyring({ password: P1 })).toBe(true);
    const release = deferred();
    const blocker = service.tonKeyring.vault.exclusive(() => release.promise);
    const imported = importUniversal(service);
    await new Promise((resolve) => setTimeout(resolve, 40));
    service.lockKeyring();
    release.resolve();
    await blocker;
    await expect(imported).rejects.toMatchObject({ code: 'keyring_locked' });
    expect(mocks.records.size).toBe(0);
  });
});

describe('TON seed vault', PBKDF2_SUITE, () => {
  it('exports every kind of stored TON phrase exactly as stored, once it derives the stored key', async () => {
    // 3.0.5 split on single spaces after trim(), so a double space is part of a legacy key.
    const spaced = 'legal  winner thank year wave sausage worth useful legal winner thank yellow';
    const spacedKey = await tonWebMnemonic.mnemonicToKeyPair(spaced.split(' '));
    const SPACED = fixture('Spaced 3.0.5 import', spaced, Buffer.from(spacedKey.publicKey).toString('hex'));
    const service = await wallet(P1, [...ALL, SPACED].map((source) => record(source, P1)));
    expect(service.unlockKeyring({ password: P1 })).toBe(true);

    for (const source of [...ALL, SPACED]) {
      await expect(exportTon(service, source.address, P1)).resolves.toEqual({ seed: source.phrase });
    }
    expect(tonStore.updateAndWait).not.toHaveBeenCalled();
  });

  it('never returns an empty or garbled phrase when the password does not open it', async () => {
    const service = await wallet(P1, [record(NATIVE, P0), record(UNIVERSAL, P1, { cipherSeed: CryptoJS.AES.encrypt('not a recovery phrase', P1).toString() })]);
    expect(service.unlockKeyring({ password: P1 })).toBe(true);
    // CryptoJS has no integrity check: a wrong password either throws 'Malformed UTF-8 data' or
    // decodes to '' (or to garbage). Find a password for each outcome on this very ciphertext.
    const { cipherSeed } = stored(NATIVE.address);
    const outcome = (password: string) => {
      try {
        return CryptoJS.AES.decrypt(cipherSeed, password).toString(CryptoJS.enc.Utf8) === '' ? 'empty' : 'garbage';
      } catch {
        return 'malformed';
      }
    };
    const candidates = Array.from({ length: 200 }, (_, index) => `wrong password ${index}`);
    const malformed = candidates.find((password) => outcome(password) === 'malformed')!;
    const empty = candidates.find((password) => outcome(password) === 'empty')!;
    expect([malformed, empty]).not.toContain(undefined);

    for (const wrong of [malformed, empty]) {
      await expect(service.tonKeyring.vault.decryptVerified(NATIVE.address, () => wrong)).rejects.toMatchObject({
        code: 'ton_seed_needs_previous_password',
      });
    }
    await expect(exportTon(service, NATIVE.address, P1)).rejects.toMatchObject({ code: 'ton_seed_needs_previous_password' });
    // Decrypts with the current password, but to text that is not this account's phrase.
    await expect(exportTon(service, UNIVERSAL.address, P1)).rejects.toMatchObject({ code: 'ton_seed_needs_previous_password' });
    expect(tonStore.updateAndWait).not.toHaveBeenCalled();
    expect(stored(NATIVE.address).cipherSeed).toBe(cipherSeed);
  });

  it('refuses an export password other than the current one, and a locked keyring, without flagging the account', async () => {
    const service = await wallet(P1, [record(NATIVE, P1)]);
    await expect(exportTon(service, NATIVE.address)).rejects.toMatchObject({ code: 'keyring_locked' });
    expect(service.unlockKeyring({ password: P1 })).toBe(true);
    await expect(exportTon(service, NATIVE.address, 'not the master password')).rejects.toMatchObject({ code: 'wrong_password' });
    expect(service.tonKeyring.vault.needsPreviousPassword.size).toBe(0);
    expect(() => service.exportMnemonic({ address: NATIVE.address, walletEcosystem: WalletEcosystem.Ton })).toThrow();
  });

  it('renames an account without dropping its pending copy, metadata or unknown fields', async () => {
    const pendingCipherSeed = CryptoJS.AES.encrypt(NATIVE.phrase, P2).toString();
    const meta = { name: 'Native TON', walletEcosystem: WalletEcosystem.Ton, tonAddress: NATIVE.address, walletSecurityGeneration: 1 };
    const service = await wallet(P1, [{ ...record(NATIVE, P1, { pendingCipherSeed, meta }), futureField: 'kept' } as TonStoreAccount]);

    await service.tonKeyring.updateAccountName(NATIVE.address, 'Savings');

    expect(stored(NATIVE.address)).toMatchObject({
      name: 'Savings',
      pendingCipherSeed,
      futureField: 'kept',
      meta: { name: 'Savings', walletEcosystem: 'ton', tonAddress: NATIVE.address, walletSecurityGeneration: 1 },
    });
    expect(service.tonKeyring.accountSubject.value[NATIVE.address]).toMatchObject({ name: 'Savings', pendingCipherSeed });
    expect(service.tonKeyring.getAccount(NATIVE.address).meta.walletSecurityGeneration).toBe(1);
  });
});

describe('changing the master password with TON accounts', PBKDF2_SUITE, () => {
  it('re-encrypts every TON phrase with the new password and leaves no pending copy', async () => {
    const service = await wallet(P1, ALL.map((source) => record(source, P1)));
    expect(service.unlockKeyring({ password: P1 })).toBe(true);

    expect(await service.changeMasterPassword({ oldPassword: P1, newPassword: P2 })).toBe(true);

    expect(mocks.keyring.hash).toBe(P2);
    for (const source of ALL) {
      const { cipherSeed, pendingCipherSeed } = stored(source.address);
      expect(pendingCipherSeed).toBeUndefined();
      expect(await decryptTonSeed(cipherSeed, P2, publicKey(source))).toBe(source.phrase);
      expect(await decryptTonSeed(cipherSeed, P1, publicKey(source))).toBeUndefined();
      await expect(exportTon(service, source.address, P2)).resolves.toEqual({ seed: source.phrase });
    }
    await service.waitForAccessScan();
    expect((await service.getAccessStatus()).issues).toEqual([]);
  });

  it('writes nothing and keeps the password when the old password is wrong', async () => {
    const service = await wallet(P1, ALL.map((source) => record(source, P1)));
    const before = structuredClone([...mocks.records.values()]);
    expect(service.unlockKeyring({ password: P1 })).toBe(true);

    expect(await service.changeMasterPassword({ oldPassword: 'incorrect', newPassword: P2 })).toBe(false);

    expect(tonStore.updateAndWait).not.toHaveBeenCalled();
    expect(mocks.changeMasterPassword).not.toHaveBeenCalled();
    expect(mocks.keyring.hash).toBe(P1);
    expect([...mocks.records.values()]).toEqual(before);
    expect(service.getPassword()).toBe(P1);
  });

  it('keeps all TON ciphertext and the old password when the atomic commit fails', async () => {
    const service = await wallet(P1, ALL.map((source) => record(source, P1)));
    const before = structuredClone([...mocks.records.values()]);
    expect(service.unlockKeyring({ password: P1 })).toBe(true);
    mocks.failWrites = true;

    expect(await service.changeMasterPassword({ oldPassword: P1, newPassword: P2 })).toBe(false);

    expect([...mocks.records.values()]).toEqual(before);
    expect(mocks.keyring.hash).toBe(P1);
    for (const source of ALL) await expect(exportTon(service, source.address, P1)).resolves.toEqual({ seed: source.phrase });
  });

  it('keeps the old password working when interrupted after staging, and drops the stale copy', async () => {
    const before = await wallet(P1, ALL.map((source) => record(source, P1)));
    const originals = ALL.map((source) => stored(source.address).cipherSeed);
    const staged = await before.tonKeyring.vault.exclusive(() => before.tonKeyring.vault.stage(P1, P2));
    expect(staged).toHaveLength(ALL.length);
    expect(ALL.every((source) => stored(source.address).pendingCipherSeed)).toBe(true);

    // The service worker stops before the keyring password changed.
    const restarted = await wallet(P1);
    expect(restarted.unlockKeyring({ password: P1 })).toBe(true);
    await restarted.waitForAccessScan();

    ALL.forEach((source, index) => {
      expect(stored(source.address).cipherSeed).toBe(originals[index]);
      expect(stored(source.address).pendingCipherSeed).toBeUndefined();
    });
    for (const source of ALL) await expect(exportTon(restarted, source.address, P1)).resolves.toEqual({ seed: source.phrase });
  });

  it('opens the staged copy with the new password when interrupted after the keyring change, and promotes it', async () => {
    const before = await wallet(P1, ALL.map((source) => record(source, P1)));
    const staged = await before.tonKeyring.vault.exclusive(() => before.tonKeyring.vault.stage(P1, P2));

    // The new password hash was stored, then the service worker stopped before the commit.
    const restarted = await wallet(P2);
    expect(restarted.unlockKeyring({ password: P2 })).toBe(true);
    for (const source of ALL) await expect(exportTon(restarted, source.address, P2)).resolves.toEqual({ seed: source.phrase });

    for (const { address, pendingCipherSeed } of staged) {
      expect(stored(address).cipherSeed).toBe(pendingCipherSeed);
      expect(stored(address).pendingCipherSeed).toBeUndefined();
    }
  });

  it('does not let a phrase under an earlier password block the change, and recovers it with that password', async () => {
    const service = await wallet(P1, [record(NATIVE, P1), record(LEGACY, P0)]);
    const broken = structuredClone(stored(LEGACY.address));
    expect(service.unlockKeyring({ password: P1 })).toBe(true);

    expect(await service.changeMasterPassword({ oldPassword: P1, newPassword: P2 })).toBe(true);
    await service.waitForAccessScan();

    expect(stored(LEGACY.address)).toEqual(broken);
    const status = await service.getAccessStatus();
    expect(status.scanComplete).toBe(true);
    expect(status.issues).toEqual([{
      address: LEGACY.address,
      walletEcosystem: 'ton',
      kind: 'previous_master_password',
      name: LEGACY.name,
      canDownloadEncryptedBackup: false,
    }]);
    await expect(exportTon(service, LEGACY.address, P2)).rejects.toMatchObject({ code: 'ton_seed_needs_previous_password' });

    vi.mocked(tonStore.updateAndWait).mockClear();
    const request = { address: LEGACY.address, walletEcosystem: WalletEcosystem.Ton };
    expect(await service.recoverAccountWithPassword({ ...request, password: P1 })).toEqual({ ok: false, code: 'wrong_password' });
    expect(tonStore.updateAndWait).not.toHaveBeenCalled();
    expect(stored(LEGACY.address)).toEqual(broken);

    expect(await service.recoverAccountWithPassword({ ...request, password: P0 })).toEqual({ ok: true });
    expect(await decryptTonSeed(stored(LEGACY.address).cipherSeed, P2, publicKey(LEGACY))).toBe(LEGACY.phrase);
    await expect(exportTon(service, LEGACY.address, P2)).resolves.toEqual({ seed: LEGACY.phrase });
    expect((await service.getAccessStatus()).issues).toEqual([]);
  });
});

describe('TON phrase recovery', PBKDF2_SUITE, () => {
  it.each([
    ['a native TON phrase', NATIVE, (phrase: string) => `  ${phrase.toUpperCase()}\n`],
    ['a universal BIP39 phrase', UNIVERSAL, (phrase: string) => phrase.replace(/ /g, '   ')],
    ['a BIP39 phrase imported by 3.0.x', LEGACY, (phrase: string) => ` ${phrase} `],
  ])('accepts %s only when it derives the stored key', async (_, source, typed) => {
    const other = ALL.find((candidate) => candidate !== source)!;
    const service = await wallet(P1, [record(source, P0)]);
    expect(service.unlockKeyring({ password: P1 })).toBe(true);
    const request = { address: source.address, walletEcosystem: WalletEcosystem.Ton };
    const broken = structuredClone(stored(source.address));

    expect(await service.recoverAccountWithPhrase({ ...request, phrase: other.phrase })).toEqual({ ok: false, code: 'phrase_mismatch' });
    expect(tonStore.updateAndWait).not.toHaveBeenCalled();
    expect(stored(source.address)).toEqual(broken);

    expect(await service.recoverAccountWithPhrase({ ...request, phrase: typed(source.phrase) })).toEqual({ ok: true });
    expect(await decryptTonSeed(stored(source.address).cipherSeed, P1, publicKey(source))).toBe(source.phrase);
    await expect(exportTon(service, source.address, P1)).resolves.toEqual({ seed: source.phrase });
  });

  it('answers locked or not found without writing', async () => {
    const service = await wallet(P1, [record(NATIVE, P0)]);
    const request = { address: NATIVE.address, walletEcosystem: WalletEcosystem.Ton };
    expect(await service.recoverAccountWithPhrase({ ...request, phrase: NATIVE.phrase })).toEqual({ ok: false, code: 'locked' });
    expect(await service.recoverAccountWithPassword({ ...request, password: P0 })).toEqual({ ok: false, code: 'locked' });
    expect(service.unlockKeyring({ password: P1 })).toBe(true);
    expect(await service.recoverAccountWithPassword({ ...request, address: 'UQ-missing', password: P0 })).toEqual({ ok: false, code: 'not_found' });
    mocks.failWrites = true;
    expect(await service.recoverAccountWithPassword({ ...request, password: P0 })).toEqual({ ok: false, code: 'storage_failed' });
    expect(tonStore.updateAndWait).toHaveBeenCalledOnce();
    expect(await decryptTonSeed(stored(NATIVE.address).cipherSeed, P0, publicKey(NATIVE))).toBe(NATIVE.phrase);
  });
});

describe('TON access scan', PBKDF2_SUITE, () => {
  it('runs after the unlock answer and lists phrases that need a previous password', async () => {
    const service = await wallet(P1, [record(NATIVE, P1), record(UNIVERSAL, P0)]);
    const decrypt = vi.spyOn(service.tonKeyring.vault, 'decryptVerified');

    expect(service.unlockKeyring({ password: P1 })).toBe(true);
    expect(decrypt).not.toHaveBeenCalled();
    expect((await service.getAccessStatus()).scanComplete).toBe(false);

    await service.waitForAccessScan();
    expect(decrypt).toHaveBeenCalledTimes(2);
    const status = await service.getAccessStatus();
    expect(status.scanComplete).toBe(true);
    expect(status.issues.map(({ address }) => address)).toEqual([UNIVERSAL.address]);
    expect(tonStore.updateAndWait).not.toHaveBeenCalled();
  });

  it('is cancelled by lock', async () => {
    const service = await wallet(P1, [record(NATIVE, P0), record(UNIVERSAL, P0)]);
    const decrypt = vi.spyOn(service.tonKeyring.vault, 'decryptVerified');

    expect(service.unlockKeyring({ password: P1 })).toBe(true);
    expect(service.lockKeyring()).toBe(true);
    await service.waitForAccessScan();

    expect(decrypt).not.toHaveBeenCalled();
    const status = await service.getAccessStatus();
    expect(status.scanComplete).toBe(false);
    expect(status.issues).toEqual([]);
  });
});


describe('generated TON provenance', PBKDF2_SUITE, () => {
  it('persists generated provenance across a worker restart, rename and password rotation', async () => {
    const service = await wallet(P1, []);
    expect(service.unlockKeyring({ password: P1 })).toBe(true);
    const phrase = await service.mnemonicGenerate({ walletEcosystem: WalletEcosystem.Substrate, wordCount: 12 });
    const address = await service.addAccount(phrase, { name: 'Generated TON' }, WalletEcosystem.Ton, undefined, undefined, true);
    expect(stored(address).meta?.walletSecurityGeneration).toBe(1);
    const restarted = await wallet(P1);
    expect(restarted.tonKeyring.getAccount(address).meta.walletSecurityGeneration).toBe(1);
    await restarted.tonKeyring.updateAccountName(address, 'Renamed TON');
    expect(restarted.unlockKeyring({ password: P1 })).toBe(true);
    expect(await restarted.changeMasterPassword({ oldPassword: P1, newPassword: P2 })).toBe(true);
    expect(stored(address).meta?.walletSecurityGeneration).toBe(1);
    await expect(exportTon(restarted, address, P2)).resolves.toEqual({ seed: phrase });
  });
});
