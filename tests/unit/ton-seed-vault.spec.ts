import CryptoJS from 'crypto-js';
import * as tonWebMnemonic from 'tonweb-mnemonic';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tonStore } from '@extension-base/stores/TonStore';
import { KeyringService } from '@extension-base/services/keyring-service';
import { decryptTonSeed } from '@extension-base/services/keyring-service/TonSeedVault';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import legacyVectors from '../fixtures/ton/ton-bip39-3.0.5-vectors.json';
import type { TonStoreAccount } from '@extension-base/stores/TonStore';
import { createTonWalletContractV4R2 } from '@/util/tonKeyring';
import { WalletEcosystem } from '@/interfaces';

const mocks = vi.hoisted(() => ({
  records: new Map<string, TonStoreAccount>(),
  failWrites: false,
  keyring: { hash: '', master: '' },
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
      remove: vi.fn((address: string) => mocks.records.delete(address)),
      updateAndWait: vi.fn(async (address: string, transform, publish?: (record: TonStoreAccount) => void) => {
        const next = transform(copy(mocks.records.get(address)));
        if (next === undefined) return undefined;
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
  },
  getAccounts: () => [],
  getAddresses: () => [],
  getPair: () => { throw new Error('Missing pair'); },
  unlockKeyring: (password: string) => {
    if (!mocks.keyring.hash || password !== mocks.keyring.hash) throw new Error('Invalid master password');
    mocks.keyring.master = password;
  },
  changeMasterPassword: mocks.changeMasterPassword,
  lockAll: () => { mocks.keyring.master = ''; },
  resetWallet: () => { mocks.keyring.hash = ''; mocks.keyring.master = ''; },
} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@extension-base/stores/CurrentAccountStore', () => ({ default: class {} }));
vi.mock('@extension-base/stores/Accounts', () => ({ default: class {} }));
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
  mocks.prompt.clear();
  mocks.changeMasterPassword.mockReset().mockImplementation((next: string, old?: string) => {
    if (mocks.keyring.hash && old !== mocks.keyring.hash) throw new Error('Invalid master password');
    if (!next) throw new Error('Require new password');
    mocks.keyring.hash = next;
    mocks.keyring.master = next;
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
    const meta = { name: 'Native TON', walletEcosystem: WalletEcosystem.Ton, tonAddress: NATIVE.address };
    const service = await wallet(P1, [{ ...record(NATIVE, P1, { pendingCipherSeed, meta }), futureField: 'kept' } as TonStoreAccount]);

    await service.tonKeyring.updateAccountName(NATIVE.address, 'Savings');

    expect(stored(NATIVE.address)).toMatchObject({
      name: 'Savings',
      pendingCipherSeed,
      futureField: 'kept',
      meta: { name: 'Savings', walletEcosystem: 'ton', tonAddress: NATIVE.address },
    });
    expect(service.tonKeyring.accountSubject.value[NATIVE.address]).toMatchObject({ name: 'Savings', pendingCipherSeed });
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

  it('removes the staged copies when the keyring refuses the change', async () => {
    const service = await wallet(P1, ALL.map((source) => record(source, P1)));
    const before = structuredClone([...mocks.records.values()]);
    expect(service.unlockKeyring({ password: P1 })).toBe(true);
    mocks.changeMasterPassword.mockImplementationOnce(() => { throw new Error('Require new password'); });

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
