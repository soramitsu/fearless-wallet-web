import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// @subwallet/keyring needs Cardano WASM the unit environment cannot load. @polkadot/keyring pairs
// have the same encrypted JSON, decodePkcs8/toJson/lock behaviour and addresses, so the account
// cryptography below is real; only the ui-keyring bookkeeping is a stand-in.
const mocks = vi.hoisted(() => ({
  backend: undefined as unknown as Keyring,
  hash: '',
  master: '',
  stored: new Map<string, KeyringPair$Json>(),
  update: vi.fn(),
  published: vi.fn(),
}));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {
  keyring: {
    get hasMasterPassword() { return !!mocks.hash; },
    get isLocked() { return !mocks.master; },
    createJsonPairWithMasterPassword: (pair: KeyringPair) => {
      if (!mocks.master) throw new Error('Please unlock first');
      return pair.toJson(mocks.master);
    },
    addFromJson: (json: KeyringPair$Json) => mocks.backend.addFromJson(json),
  },
  getPair: (address: string) => mocks.backend.getPair(address),
  getAccounts: () => mocks.backend.getPairs().map(({ address, meta }) => ({ address, meta })),
  getAddresses: () => [],
  createFromUri: (suri: string, meta: Record<string, unknown>, type: 'sr25519' | 'ethereum') => mocks.backend.createFromUri(suri, meta, type),
  createFromJson: (json: KeyringPair$Json) => mocks.backend.createFromJson(json),
  unlockKeyring: (password: string) => {
    if (!mocks.hash || password !== mocks.hash) throw new Error('Invalid master password');
    mocks.master = password;
  },
  unlockPair: (address: string) => {
    if (!mocks.master) throw new Error('Please unlock first');
    const pair = mocks.backend.getPair(address);
    try { pair.decodePkcs8(mocks.master); } catch { throw new Error(`Fail to unlock with address: ${address}`); }
  },
  backupAccount: (pair: KeyringPair, password: string) => {
    if (!pair.isLocked) pair.lock();
    pair.decodePkcs8(password);
    return pair.toJson(password);
  },
  // @subwallet/ui-keyring 0.1.14 changeMasterPassword: stores the new hash, re-encrypts each
  // master-password pair (a failure is swallowed), then encodes all of them again with the new
  // password, which throws for a locked pair that did not open with the old one.
  changeMasterPassword: (next: string, old: string) => {
    if (mocks.hash && old !== mocks.hash) throw new Error('Invalid master password');
    mocks.hash = next;
    mocks.master = next;
    const pairs = mocks.backend.getPairs().filter(({ meta }) => meta.isMasterPassword);
    for (const pair of pairs) { try { pair.decodePkcs8(old); } catch { /* "Fail to change passphrase" */ } }
    const jsons = pairs.map((pair) => {
      if (pair.isLocked) pair.decodePkcs8(next);
      return pair.toJson(next);
    });
    jsons.forEach((json) => mocks.backend.addFromJson(json));
  },
  lockAll: () => {
    mocks.master = '';
    mocks.backend.getPairs().forEach((pair) => pair.lock());
  },
  accounts: { add: mocks.published },
} }));
vi.mock('@extension-base/stores/Accounts', () => ({ default: class {
  updateAndWait = mocks.update;
} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@extension-base/stores/CurrentAccountStore', () => ({ default: class {} }));
vi.mock('@extension-base/stores/KeyringStore', () => ({ default: class {} }));
vi.mock('@extension-base/stores/KeyringStoreWeb', () => ({ default: class {} }));
vi.mock('@extension-base/stores/LegacyPasswordPromptStore', () => ({ default: class {
  getAndWait = async () => undefined;
} }));
vi.mock('@extension-base/services/keyring-service/TonKeyring', () => ({ TonKeyringService: class {} }));
vi.mock('@extension-base/services/keyring-service/LegacyNetworkEnrollment', () => ({ enrollLegacyAccountNetworks: vi.fn() }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));

import { KeyringService } from '@extension-base/services/keyring-service';
import { accountStorageKey } from '@extension-base/services/keyring-service/AccountMetadata';
import { TonSeedVault } from '@extension-base/services/keyring-service/TonSeedVault';
import type { KeyringPair, KeyringPair$Json } from '@polkadot/keyring/types';
import { WalletEcosystem } from '@/interfaces';

// Public test phrases only; never fund them.
const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const OTHER_MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const EVM_PATH = "/m/44'/60'/0'/0/0";
const LEGACY_PASSWORD = '2.6.3 per-account password';
const P0 = 'master password before an interrupted change';
const P1 = 'current master password';
const P2 = 'new master password';
const payload = new TextEncoder().encode('Fearless account recovery signing check');
// Every step is real scrypt (N = 2^15), about 100 ms each on an idle machine and far more on a busy CI runner.
const SCRYPT_SUITE = { timeout: 120_000 };

// Writes the account as an earlier version left it in storage and loads it, locked, into the keyring.
function storedAccount(suri: string, type: 'sr25519' | 'ethereum', password: string, meta: Record<string, unknown>): KeyringPair {
  const json = mocks.backend.createFromUri(suri, meta, type).toJson(password);
  const pair = mocks.backend.addFromJson(json);
  mocks.stored.set(accountStorageKey(pair as never), json);
  return pair;
}

const record = (pair: KeyringPair) => mocks.stored.get(accountStorageKey(pair as never))!;

function opensWith(json: KeyringPair$Json, password: string): KeyringPair {
  const pair = mocks.backend.createFromJson(json);
  pair.decodePkcs8(password);
  return pair;
}

function service(): KeyringService {
  const value = Object.create(KeyringService.prototype) as KeyringService;
  const tonKeyring = { getAccounts: () => [], accountSubject: { value: {} } };
  Object.defineProperty(value, 'tonKeyring', {
    value: { ...tonKeyring, vault: new TonSeedVault({ ...tonKeyring, setAccounts: () => {} }) },
  });
  return value;
}

function unlocked(): KeyringService {
  const keyring = service();
  expect(keyring.unlockKeyring({ password: mocks.hash })).toBe(true);
  return keyring;
}

beforeAll(async () => {
  await cryptoWaitReady();
});

beforeEach(() => {
  mocks.backend = new Keyring({ type: 'sr25519' });
  mocks.stored.clear();
  mocks.hash = P1;
  mocks.master = '';
  mocks.published.mockReset();
  // AccountsStore.updateAndWait over the stored records.
  mocks.update.mockReset().mockImplementation(async (key: string, transform, publish) => {
    const next = transform(structuredClone(mocks.stored.get(key)));
    if (next === undefined) return undefined;
    mocks.stored.set(key, next);
    publish?.(next);
    return next;
  });
});

describe('recovery with the recovery phrase', SCRYPT_SUITE, () => {
  it('re-encrypts a legacy account with the master password when the phrase reproduces its address', async () => {
    const legacy = storedAccount(MNEMONIC, 'sr25519', LEGACY_PASSWORD, { name: 'Polkadot', whenCreated: 1 });
    const keyring = unlocked();
    expect(() => keyring.exportMnemonic({ address: legacy.address })).toThrow('legacy_password_required');

    const result = await keyring.recoverAccountWithPhrase({
      address: legacy.address,
      walletEcosystem: WalletEcosystem.Substrate,
      phrase: `  ${MNEMONIC.toUpperCase().replace(/ /g, '  ')}\n`,
    });

    expect(result).toEqual({ ok: true });
    expect(record(legacy).meta).toMatchObject({ name: 'Polkadot', whenCreated: 1, isMasterPassword: true });
    const reopened = opensWith(record(legacy), P1);
    expect(reopened.address).toBe(legacy.address);
    expect(reopened.verify(payload, reopened.sign(payload), legacy.publicKey)).toBe(true);
    expect(() => opensWith(record(legacy), LEGACY_PASSWORD)).toThrow();
    expect(keyring.getMigrationAccounts()).toEqual([]);
    expect(keyring.unlockPair(legacy.address)).toBe(true);
  });

  it('writes nothing for a phrase of another account', async () => {
    const legacy = storedAccount(MNEMONIC, 'sr25519', LEGACY_PASSWORD, { name: 'Polkadot' });
    const before = structuredClone(record(legacy));
    const keyring = unlocked();

    expect(await keyring.recoverAccountWithPhrase({
      address: legacy.address, walletEcosystem: WalletEcosystem.Substrate, phrase: OTHER_MNEMONIC,
    })).toEqual({ ok: false, code: 'phrase_mismatch' });
    expect(await keyring.recoverAccountWithPhrase({
      address: legacy.address, walletEcosystem: WalletEcosystem.Substrate, phrase: 'not a recovery phrase',
    })).toEqual({ ok: false, code: 'phrase_mismatch' });

    expect(mocks.update).not.toHaveBeenCalled();
    expect(record(legacy)).toEqual(before);
    expect(keyring.getMigrationAccounts().map(({ address }) => address)).toEqual([legacy.address]);
  });

  it('derives a linked EVM account on the path Fearless creates it with', async () => {
    const child = storedAccount(`${MNEMONIC}${EVM_PATH}`, 'ethereum', LEGACY_PASSWORD, { name: '' });
    const keyring = unlocked();

    expect(await keyring.recoverAccountWithPhrase({
      address: child.address, walletEcosystem: WalletEcosystem.Evm, phrase: MNEMONIC,
    })).toEqual({ ok: true });

    expect(opensWith(record(child), P1).address).toBe(child.address);
    expect(record(child).meta.isMasterPassword).toBe(true);
  });

  it('needs the derivation path an account was created with', async () => {
    const derived = storedAccount(`${MNEMONIC}//polkadot`, 'sr25519', LEGACY_PASSWORD, { name: 'Derived' });
    const keyring = unlocked();
    const request = { address: derived.address, walletEcosystem: WalletEcosystem.Substrate, phrase: MNEMONIC };

    expect(await keyring.recoverAccountWithPhrase(request)).toEqual({ ok: false, code: 'phrase_mismatch' });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(await keyring.recoverAccountWithPhrase({ ...request, derivationPath: '//polkadot' })).toEqual({ ok: true });
    expect(opensWith(record(derived), P1).address).toBe(derived.address);
  });

  it('answers locked or not found without writing', async () => {
    const legacy = storedAccount(MNEMONIC, 'sr25519', LEGACY_PASSWORD, {});
    const external = mocks.backend.addFromAddress(storedAccount(OTHER_MNEMONIC, 'sr25519', P1, {}).address, { isExternal: true });
    const request = { address: legacy.address, walletEcosystem: WalletEcosystem.Substrate, phrase: MNEMONIC };

    expect(await service().recoverAccountWithPhrase(request)).toEqual({ ok: false, code: 'locked' });
    const keyring = unlocked();
    expect(await keyring.recoverAccountWithPhrase({ ...request, address: external.address, phrase: OTHER_MNEMONIC })).toEqual({ ok: false, code: 'not_found' });
    expect(await keyring.recoverAccountWithPhrase({ ...request, address: '5Missing' })).toEqual({ ok: false, code: 'not_found' });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe('keys left under an earlier master password', SCRYPT_SUITE, () => {
  it('are found when used, and recovered with the password that opens them', async () => {
    const previous = storedAccount(MNEMONIC, 'sr25519', P0, { name: 'Polkadot', isMasterPassword: true });
    const keyring = unlocked();
    expect((await keyring.getAccessStatus()).issues).toEqual([]);

    expect(() => keyring.unlockPair(previous.address)).toThrow('previous_password_required');
    expect(() => keyring.accountExportPrivateKey({ address: previous.address })).toThrow('previous_password_required');
    expect((await keyring.getAccessStatus()).issues).toEqual([{
      address: previous.address,
      walletEcosystem: 'substrate',
      kind: 'previous_master_password',
      name: 'Polkadot',
      canDownloadEncryptedBackup: false,
    }]);

    const request = { address: previous.address, walletEcosystem: WalletEcosystem.Substrate };
    expect(await keyring.recoverAccountWithPassword({ ...request, password: 'not used before' })).toEqual({ ok: false, code: 'wrong_password' });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(previous.isLocked).toBe(true);

    expect(await keyring.recoverAccountWithPassword({ ...request, password: P0 })).toEqual({ ok: true });
    const reopened = opensWith(record(previous), P1);
    expect(reopened.address).toBe(previous.address);
    expect(record(previous).meta).toMatchObject({ name: 'Polkadot', isMasterPassword: true });
    expect(keyring.unlockPair(previous.address)).toBe(true);
    expect((await keyring.getAccessStatus()).issues).toEqual([]);
  });

  it('do not stop the linked account from signing', async () => {
    const child = storedAccount(`${MNEMONIC}${EVM_PATH}`, 'ethereum', P0, { isMasterPassword: true });
    const parent = storedAccount(MNEMONIC, 'sr25519', P1, { name: 'Polkadot', isMasterPassword: true, ethereumAddress: child.address });
    const keyring = unlocked();

    expect(keyring.unlockPair(parent.address)).toBe(true);
    expect(parent.isLocked).toBe(false);
    expect(child.isLocked).toBe(true);
    expect((await keyring.getAccessStatus()).issues).toEqual([expect.objectContaining({
      address: child.address, walletEcosystem: 'evm', kind: 'previous_master_password', linkedParentAddress: parent.address,
    })]);
    expect(() => keyring.unlockPair(child.address)).toThrow('previous_password_required');
  });

  it('are set aside by a password change instead of aborting it, and stay recoverable', async () => {
    const current = storedAccount(MNEMONIC, 'sr25519', P1, { name: 'Current', isMasterPassword: true });
    const previous = storedAccount(OTHER_MNEMONIC, 'sr25519', P0, { name: 'Previous', isMasterPassword: true });
    const keyring = unlocked();

    expect(await keyring.changeMasterPassword({ oldPassword: P1, newPassword: P2 })).toBe(true);

    expect(mocks.hash).toBe(P2);
    expect(keyring.unlockPair(current.address)).toBe(true);
    expect(mocks.backend.getPair(previous.address)).toBe(previous);
    expect(previous.meta.isMasterPassword).toBe(true);
    expect(opensWith(record(previous), P0).address).toBe(previous.address);
    expect((await keyring.getAccessStatus()).issues).toEqual([expect.objectContaining({
      address: previous.address, kind: 'previous_master_password',
    })]);

    expect(await keyring.recoverAccountWithPassword({
      address: previous.address, walletEcosystem: WalletEcosystem.Substrate, password: P0,
    })).toEqual({ ok: true });
    expect(opensWith(record(previous), P2).address).toBe(previous.address);
    expect((await keyring.getAccessStatus()).issues).toEqual([]);
  });

  it('would otherwise make ui-keyring store the new password and then abort (the hazard the change avoids)', async () => {
    storedAccount(MNEMONIC, 'sr25519', P1, { isMasterPassword: true });
    storedAccount(OTHER_MNEMONIC, 'sr25519', P0, { isMasterPassword: true });
    const { keyring: uiKeyring } = await import('@subwallet/ui-keyring');

    expect(() => uiKeyring.changeMasterPassword(P2, P1)).toThrow();
    expect(mocks.hash).toBe(P2);
  });

  it('answers locked without writing', async () => {
    const previous = storedAccount(MNEMONIC, 'sr25519', P0, { isMasterPassword: true });

    expect(await service().recoverAccountWithPassword({
      address: previous.address, walletEcosystem: WalletEcosystem.Substrate, password: P0,
    })).toEqual({ ok: false, code: 'locked' });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe('legacy accounts through recovery with a password', SCRYPT_SUITE, () => {
  it('migrate with their own old password, and a wrong one writes nothing', async () => {
    const legacy = storedAccount(MNEMONIC, 'sr25519', LEGACY_PASSWORD, { name: 'Polkadot' });
    const keyring = unlocked();
    const request = { address: legacy.address, walletEcosystem: WalletEcosystem.Substrate };

    expect(await keyring.recoverAccountWithPassword({ ...request, password: P1 })).toEqual({ ok: false, code: 'wrong_password' });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(await keyring.recoverAccountWithPassword({ ...request, password: LEGACY_PASSWORD })).toEqual({ ok: true });
    expect(opensWith(record(legacy), P1).address).toBe(legacy.address);
    expect(keyring.getMigrationAccounts()).toEqual([]);
  });
});
