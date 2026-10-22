// Ported from 3.0.6's tests/unit/hotfix-3.0.6-ton-accounts.spec.ts: the TON records 3.0.5 wrote
// (tests/fixtures/3.0.5) stay readable as they are, before anything moves them to the current formats.
import { Keyring as DetachedKeyring } from '@subwallet/keyring/keyring';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tonStore } from '@extension-base/stores/TonStore';
import { KeyringService } from '@extension-base/services/keyring-service';
import fixture from '../fixtures/3.0.5/ton-accounts.json';
import type { KeyringPasswordJson } from '@subwallet/keyring/types';
import type { TonStoreAccount } from '@extension-base/stores/TonStore';

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
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));

// tonweb derives native and 3.0.x keys with 100 000 PBKDF2 rounds per check.
const PBKDF2_SUITE = { timeout: 120_000 };

const records305 = () => fixture.accounts.map(({ stored }) => structuredClone(stored) as TonStoreAccount);

// A fresh service worker over the records 3.0.5 wrote, with the keyring's password record set to `password`.
async function startWithStoredAccounts(password: string) {
  mocks.records = new Map(records305().map((value) => [value.address, value]));
  mocks.keyring.hash = password;
  mocks.passwordRecord = new DetachedKeyring().changeMasterPassword(password);
  mocks.keyring.master = '';
  const service = new KeyringService({ waitCryptoReady: new Promise(() => {}) } as never);
  await service.tonKeyring.loadAll();

  return service;
}

beforeEach(() => {
  vi.mocked(tonStore.updateAndWait).mockClear();
  vi.mocked(tonStore.getAndWait).mockClear();
});

describe('4.2.0 reads TON accounts written by 3.0.5', PBKDF2_SUITE, () => {
  it('uses a fixture written by the published source', () => {
    expect(fixture.source.commit).toBe('129807f0deff4b1cd028b4152084b66d5de77f58');
    expect(fixture.accounts.map(({ kind }) => kind)).toEqual(['ton-native-24', 'bip39-12']);
  });

  it.each(fixture.accounts)('lists the $kind account with the same address and public key', async ({ stored }) => {
    const service = await startWithStoredAccounts(fixture.password);
    const account = service.tonKeyring.accountSubject.value[stored.address];

    expect(service.tonKeyring.getAccounts().map(({ address }) => address)).toContain(stored.address);
    expect(Buffer.from(account.publicKey).toString('hex')).toBe(stored.publicKeyHex);
    expect(service.tonKeyring.getUserFriendlyAddress(account.walletContract.address)).toBe(stored.address);
    expect(account.cipherSeed).toBe(stored.cipherSeed);
  });

  it.each(fixture.accounts)('decrypts the $kind phrase and derives the same signing key', async ({ phrase, stored }) => {
    const service = await startWithStoredAccounts(fixture.password);
    const decrypted = await service.tonKeyring.vault.decryptVerified(stored.address, () => fixture.password);

    expect(decrypted === phrase).toBe(true);

    // An existing account's key decides its derivation: 3.0.x ran tonweb's over BIP39 phrases too.
    const storedKey = Buffer.from(stored.publicKeyHex, 'hex');
    const { publicKey } = await service.tonKeyring.mnemonicToKeyPair(decrypted.split(' '), undefined, storedKey);

    expect(Buffer.from(publicKey).toString('hex')).toBe(stored.publicKeyHex);
  });

  it('does not write, rewrite or remove any stored record while loading and reading', async () => {
    const service = await startWithStoredAccounts(fixture.password);

    for (const { stored } of fixture.accounts) {
      await service.tonKeyring.vault.decryptVerified(stored.address, () => fixture.password);
    }

    expect(tonStore.updateAndWait).not.toHaveBeenCalled();
    expect([...mocks.records.values()]).toEqual(records305());
  });

  it('does not return a phrase for a wrong password', async () => {
    const service = await startWithStoredAccounts('not the password');

    for (const { phrase, stored } of fixture.accounts) {
      let decrypted = '';

      try {
        decrypted = await service.tonKeyring.vault.decryptVerified(stored.address, () => 'not the password');
      } catch {
        // ton_seed_needs_previous_password: no phrase either way.
      }

      expect(decrypted === phrase).toBe(false);
    }
  });
});
