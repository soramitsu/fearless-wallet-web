import { Keyring } from '@subwallet/keyring';
import { Keyring as DetachedKeyring } from '@subwallet/keyring/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The keyring-recovery harness with @subwallet/keyring pairs, whose encrypted records carry the phrase entropy as
// the extension stores it; only the ui-keyring bookkeeping and storage are stand-ins.
const mocks = vi.hoisted(() => ({
  backend: undefined as unknown as Keyring,
  hash: '',
  passwordRecord: undefined as { passwordHash: string } | undefined,
  master: '',
  stored: new Map<string, KeyringPair$Json>(),
  published: vi.fn(),
}));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {
  keyring: {
    setupMasterPassword: (hash: string) => { mocks.hash = hash; },
    get hasMasterPassword() { return !!mocks.hash; },
    get isLocked() { return !mocks.master; },
    addFromJson: (json: KeyringPair$Json) => mocks.backend.addFromJson(json),
  },
  getPair: (address: string) => mocks.backend.getPair(address),
  getAccounts: () => mocks.backend.getPairs().map(({ address, meta }) => ({ address, meta })),
  getAddresses: () => [],
  createFromUri: (suri: string, meta: Record<string, unknown>, type: 'sr25519' | 'ethereum') =>
    mocks.backend.createFromUri(suri, meta, type),
  createFromJson: (json: KeyringPair$Json) => mocks.backend.createFromJson(json),
  unlockKeyring: (password: string) => {
    const verifier = new DetachedKeyring();
    verifier.setupMasterPassword(mocks.passwordRecord?.passwordHash);
    verifier.unlockKeyring(password);
    mocks.hash = password;
    mocks.master = password;
  },
  backupAccount: (pair: KeyringPair, password: string) => {
    if (!pair.isLocked) pair.lock();
    pair.decodePkcs8(password);
    return pair.toJson(password);
  },
  lockAll: () => {
    mocks.master = '';
    mocks.backend.getPairs().forEach((pair) => pair.lock());
  },
  accounts: { add: mocks.published },
} }));
vi.mock('@extension-base/stores/Accounts', () => ({ default: class {
  getAndWait = async (key: string) => structuredClone(mocks.stored.get(key));
  updateAndWait = async (key: string, transform, publish) => {
    const next = transform(structuredClone(mocks.stored.get(key)));
    if (next === undefined) return undefined;
    mocks.stored.set(key, next);
    publish?.(next);
    return next;
  };
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
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
// CJS TON dependencies and the keyring must share one Buffer implementation in the Node test runner.
vi.mock('vite-plugin-node-polyfills/shims/buffer', async () => {
  const { createRequire } = await import('node:module');
  const { Buffer } = createRequire(import.meta.url)('node:buffer');
  return { default: Buffer, Buffer };
});

import { KeyringService } from '@extension-base/services/keyring-service';
import { accountStorageKey } from '@extension-base/services/keyring-service/AccountMetadata';
import { TonSeedVault } from '@extension-base/services/keyring-service/TonSeedVault';
import {
  exportUniversalWalletSecret,
  type UniversalWalletFundsProbe,
} from '@extension-base/services/keyring-service/UniversalWalletPassword';
import { resolveBitcoinTransferSource } from '@extension-base/api/bitcoin/transfer';
import passphraseVectors from '../../docs/universal-wallet-v2-passphrase-vectors.json';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import type State from '@extension-base/background/handlers/State';
import type { FWKeyringMeta } from '@extension-base/types';
import type { KeyringPair, KeyringPair$Json } from '@subwallet/keyring/types';
import { WalletEcosystem } from '@/interfaces';
import { deriveUniversalWalletKeyringFields, deriveUniversalWalletNetworkFields } from '@/util/universalWalletKeyringFields';
import { withUniversalWalletKeyringMeta } from '@/util/universalWalletKeyringMeta';
import { UNIVERSAL_WALLET_PASSWORD_NETWORKS, type UniversalWalletPasswordNetwork } from '@/util/universalWalletPassphrase';

// Public test phrase only; never fund it.
const MNEMONIC = vectors.vectors[0].mnemonic;
const PASSWORD = passphraseVectors.vectors[0].passphrase;
const SURI = `${MNEMONIC}//polkadot///${PASSWORD}`;
const P1 = 'current master password';
const P2 = 'new master password';
const legacy = vectors.vectors[0].expected;
const protectedAccounts = passphraseVectors.vectors[0].expected;
const SCRYPT_SUITE = { timeout: 120_000 };

function service(): KeyringService {
  const value = Object.create(KeyringService.prototype) as KeyringService;
  const tonKeyring = { getAccounts: () => [], accountSubject: { value: {} } };
  Object.defineProperty(value, 'tonKeyring', {
    value: { ...tonKeyring, vault: new TonSeedVault({ ...tonKeyring, setAccounts: () => {} }) },
  });
  return value;
}

function unlocked(password = P1): KeyringService {
  const keyring = service();
  expect(keyring.unlockKeyring({ password })).toBe(true);
  return keyring;
}

// A password wallet exactly as Fearless 4.2.x stored it: the SURI's password reached the sr25519 key, while the
// Universal Wallet fields came from the words alone and nothing kept the password.
function storedPasswordWalletFrom42(): KeyringPair {
  const meta = withUniversalWalletKeyringMeta('', {
    name: 'Password wallet', isMasterPassword: true, isMasterAccount: true, walletEcosystem: WalletEcosystem.Substrate,
    ...deriveUniversalWalletKeyringFields(MNEMONIC),
  } as FWKeyringMeta, WalletEcosystem.Substrate);
  const json = mocks.backend.createFromUri(SURI, meta, 'sr25519').toJson(P1);
  const pair = mocks.backend.addFromJson(json);
  mocks.stored.set(accountStorageKey(pair as never), { ...json, meta: { ...pair.meta } });
  return pair;
}

const record = (pair: KeyringPair) => mocks.stored.get(accountStorageKey(pair as never))!;
const metaOf = (pair: KeyringPair) => record(pair).meta as FWKeyringMeta;
const secret = (keyring: KeyringService, pair: KeyringPair, network: UniversalWalletPasswordNetwork) =>
  exportUniversalWalletSecret(keyring, { address: pair.address, walletEcosystem: WalletEcosystem.Substrate }, network,
    metaOf(pair));
const probeAll = (funds: Partial<Record<UniversalWalletPasswordNetwork, 'funded' | 'empty' | 'unknown'>>): UniversalWalletFundsProbe =>
  vi.fn(async (network) => funds[network] ?? 'unknown');

beforeAll(async () => {
  await cryptoWaitReady();
});

beforeEach(() => {
  mocks.backend = new Keyring({ type: 'sr25519' });
  mocks.stored.clear();
  mocks.hash = P1;
  mocks.passwordRecord = new DetachedKeyring().changeMasterPassword(P1);
  mocks.master = '';
  mocks.published.mockReset();
});

describe('a password wallet saved by Fearless 4.2.x', SCRYPT_SUITE, () => {
  it('keeps every no-password address it showed, and each still opens for signing', () => {
    const pair = storedPasswordWalletFrom42();
    const keyring = unlocked();

    for (const network of UNIVERSAL_WALLET_PASSWORD_NETWORKS) {
      expect(secret(keyring, pair, network)).toEqual({ seed: MNEMONIC, passphrase: '' });
    }
    const source = resolveBitcoinTransferSource({ keyringService: keyring } as unknown as State,
      legacy.bitcoin.mainnet.firstReceiveAddress, 'mainnet');
    expect(source).toMatchObject({ passphrase: '', source: { address: legacy.bitcoin.mainnet.firstReceiveAddress } });
    expect(metaOf(pair)).toMatchObject({
      bitcoinAddress: legacy.bitcoin.mainnet.firstReceiveAddress,
      bitcoinTestnetAddress: legacy.bitcoin.testnet.firstReceiveAddress,
      solanaAddress: legacy.solana.address,
      tonAddress: legacy.ton.addressNonBounceable,
      irohaAddress: legacy.iroha.taira.i105,
    });
    // Nothing kept the password, but the key shows a path was used: the person is asked about it.
    expect(keyring.universalWalletPasswordStatus(pair.address)).toEqual({ state: 'password-unknown' });
  });

  it('keeps the password only when the typed path reproduces the stored key', async () => {
    const pair = storedPasswordWalletFrom42();
    const keyring = unlocked();
    const before = structuredClone(record(pair));

    expect(await keyring.addUniversalWalletPasswordPath({ address: pair.address, derivationPath: '//polkadot///wrong' }))
      .toEqual({ ok: false, code: 'path_mismatch' });
    expect(await keyring.addUniversalWalletPasswordPath({ address: pair.address, derivationPath: '//polkadot' }))
      .toEqual({ ok: false, code: 'path_mismatch' });
    expect(record(pair)).toEqual(before);

    const result = await keyring.addUniversalWalletPasswordPath({ address: pair.address, derivationPath: `//polkadot///${PASSWORD}` });

    expect(result).toEqual({ ok: true, status: { state: 'legacy', rows: [
      { network: 'bitcoin', legacyAddress: legacy.bitcoin.mainnet.firstReceiveAddress,
        protectedAddress: protectedAccounts.bitcoin.mainnet.firstReceiveAddress },
      { network: 'bitcoinTestnet', legacyAddress: legacy.bitcoin.testnet.firstReceiveAddress,
        protectedAddress: protectedAccounts.bitcoin.testnet.firstReceiveAddress },
      { network: 'solana', legacyAddress: legacy.solana.address, protectedAddress: protectedAccounts.solana.address },
      { network: 'ton', legacyAddress: legacy.ton.addressNonBounceable, protectedAddress: protectedAccounts.ton.addressNonBounceable },
      { network: 'iroha', legacyAddress: legacy.iroha.taira.i105, protectedAddress: protectedAccounts.iroha.taira.i105 },
    ] } });
    // The encrypted key and every address are untouched; only the sealed password and the legacy list are new.
    expect(record(pair).encoded).toBe(before.encoded);
    expect(metaOf(pair).universalWalletLegacyNetworks).toEqual([...UNIVERSAL_WALLET_PASSWORD_NETWORKS]);
    expect(JSON.stringify(record(pair))).not.toContain(PASSWORD);
    for (const network of UNIVERSAL_WALLET_PASSWORD_NETWORKS) expect(secret(keyring, pair, network).passphrase).toBe('');
  });

  it('switches only addresses a probe confirms empty, after which they sign with the password', async () => {
    const pair = storedPasswordWalletFrom42();
    const keyring = unlocked();
    await keyring.addUniversalWalletPasswordPath({ address: pair.address, derivationPath: `//polkadot///${PASSWORD}` });
    const probe = probeAll({ bitcoin: 'empty', iroha: 'empty', solana: 'funded' });

    expect(await keyring.switchUniversalWalletAccounts(pair.address, probe)).toEqual([
      { network: 'bitcoin', outcome: 'switched' },
      { network: 'bitcoinTestnet', outcome: 'unknown' },
      { network: 'solana', outcome: 'funded' },
      { network: 'ton', outcome: 'unknown' },
      { network: 'iroha', outcome: 'switched' },
    ]);
    // Probes only ever look at the addresses the words alone open.
    expect(vi.mocked(probe).mock.calls.map(([network, mnemonic, fields]) => [network, mnemonic, fields])).toEqual(
      UNIVERSAL_WALLET_PASSWORD_NETWORKS.map((network) => [network, MNEMONIC, deriveUniversalWalletNetworkFields(network, MNEMONIC, '')])
    );
    expect(metaOf(pair)).toMatchObject({
      bitcoinAddress: protectedAccounts.bitcoin.mainnet.firstReceiveAddress,
      irohaPublicKeyHex: protectedAccounts.iroha.taira.publicKeyHex,
      irohaAddress: protectedAccounts.iroha.taira.i105,
      bitcoinTestnetAddress: legacy.bitcoin.testnet.firstReceiveAddress,
      solanaAddress: legacy.solana.address,
      tonPublicKeyHex: legacy.ton.publicKeyHex,
      universalWalletLegacyNetworks: ['bitcoinTestnet', 'solana', 'ton'],
      // The old addresses of switched networks stay watched for late deposits.
      universalWalletWatchedNetworks: ['bitcoin', 'iroha'],
    });
    const accounts = Object.fromEntries(metaOf(pair).universalWallet!.publicAccounts.map(({ accountId, address }) => [accountId, address]));
    expect(accounts).toMatchObject({
      'bitcoin-mainnet': protectedAccounts.bitcoin.mainnet.firstReceiveAddress,
      'iroha-taira': protectedAccounts.iroha.taira.i105,
      'iroha-nexus': protectedAccounts.iroha.nexus.i105,
      'solana-mainnet': legacy.solana.address,
    });
    expect(secret(keyring, pair, 'bitcoin').passphrase).toBe(PASSWORD);
    expect(secret(keyring, pair, 'iroha').passphrase).toBe(PASSWORD);
    expect(secret(keyring, pair, 'solana').passphrase).toBe('');
    expect(resolveBitcoinTransferSource({ keyringService: keyring } as unknown as State,
      protectedAccounts.bitcoin.mainnet.firstReceiveAddress, 'mainnet')).toMatchObject({ passphrase: PASSWORD });

    // Nothing left that a probe confirms empty: a second switch changes nothing.
    const after = structuredClone(record(pair));
    expect((await keyring.switchUniversalWalletAccounts(pair.address, probeAll({ solana: 'funded' })))
      .map(({ outcome }) => outcome)).toEqual(['unknown', 'funded', 'unknown']);
    expect(record(pair)).toEqual(after);
  });

  it('brings back an old address that is paid after the switch when the protected account is empty', async () => {
    const pair = storedPasswordWalletFrom42();
    const keyring = unlocked();
    await keyring.addUniversalWalletPasswordPath({ address: pair.address, derivationPath: `//polkadot///${PASSWORD}` });
    // The probe read Bitcoin index 0 as empty; the deposit lands there before or after the replacement commits.
    await keyring.switchUniversalWalletAccounts(pair.address, probeAll({ bitcoin: 'empty' }));
    expect(metaOf(pair).bitcoinAddress).toBe(protectedAccounts.bitcoin.mainnet.firstReceiveAddress);
    const paid = vi.fn<UniversalWalletFundsProbe>(async (network, _mnemonic, _fields, passphrase = '') =>
      network === 'bitcoin' && passphrase === '' ? 'funded' : 'empty');

    const result = await keyring.checkWatchedUniversalWalletAccounts(pair.address, paid);

    expect(result.changed).toBe(true);
    expect(paid.mock.calls.map(([network, , , passphrase]) => [network, passphrase])).toEqual([['bitcoin', ''], ['bitcoin', PASSWORD]]);
    expect(metaOf(pair)).toMatchObject({
      bitcoinAddress: legacy.bitcoin.mainnet.firstReceiveAddress,
      universalWalletLegacyNetworks: ['bitcoin', 'bitcoinTestnet', 'solana', 'ton', 'iroha'],
    });
    expect(metaOf(pair).universalWalletWatchedNetworks).toBeUndefined();
    expect(secret(keyring, pair, 'bitcoin').passphrase).toBe('');
    expect(result.status).toMatchObject({ state: 'legacy' });
    expect((result.status as { rows: { network: string }[] }).rows.map(({ network }) => network)).toContain('bitcoin');
  });

  it('keeps a funded protected account and reports funds that reach its old address', async () => {
    const pair = storedPasswordWalletFrom42();
    const keyring = unlocked();
    await keyring.addUniversalWalletPasswordPath({ address: pair.address, derivationPath: `//polkadot///${PASSWORD}` });
    await keyring.switchUniversalWalletAccounts(pair.address, probeAll({ bitcoin: 'empty', iroha: 'empty' }));
    const funds: Record<string, 'funded' | 'empty' | 'unknown'> = { 'iroha:': 'funded', [`iroha:${PASSWORD}`]: 'unknown' };
    const probe = vi.fn<UniversalWalletFundsProbe>(async (network, _mnemonic, _fields, passphrase = '') =>
      funds[`${network}:${passphrase}`] ?? 'empty');

    const result = await keyring.checkWatchedUniversalWalletAccounts(pair.address, probe);

    expect(result.changed).toBe(true);
    expect(metaOf(pair)).toMatchObject({
      irohaPublicKeyHex: protectedAccounts.iroha.taira.publicKeyHex,
      universalWalletWatchedNetworks: ['bitcoin', 'iroha'],
      universalWalletArrivedNetworks: ['iroha'],
    });
    expect(result.status).toMatchObject({ state: 'legacy', arrived: [{ network: 'iroha', legacyAddress: legacy.iroha.taira.i105 }] });
    // Reported once: the same funds do not count as new, and an emptied old address clears the report.
    expect((await keyring.checkWatchedUniversalWalletAccounts(pair.address, probe)).changed).toBe(false);
    funds['iroha:'] = 'empty';
    await keyring.checkWatchedUniversalWalletAccounts(pair.address, probe);
    expect(metaOf(pair).universalWalletArrivedNetworks).toBeUndefined();
    expect(metaOf(pair).universalWalletWatchedNetworks).toEqual(['bitcoin', 'iroha']);
  });

  it('still opens the sealed password after the master password changes', async () => {
    const pair = storedPasswordWalletFrom42();
    await unlocked().addUniversalWalletPasswordPath({ address: pair.address, derivationPath: `//polkadot///${PASSWORD}` });
    const meta = metaOf(pair);
    const reencrypted = mocks.backend.createFromJson(record(pair));
    reencrypted.decodePkcs8(P1);
    const json = { ...reencrypted.toJson(P2), meta };
    mocks.stored.set(accountStorageKey(pair as never), json);
    mocks.backend.addFromJson(json);
    mocks.passwordRecord = new DetachedKeyring().changeMasterPassword(P2);
    mocks.hash = P2;

    const keyring = unlocked(P2);

    expect(keyring.universalWalletPassphraseCandidates(pair.address)).toEqual([PASSWORD]);
    expect(keyring.universalWalletPasswordStatus(pair.address)).toMatchObject({ state: 'legacy' });
    keyring.lockKeyring();
    expect(keyring.universalWalletPassphraseCandidates(pair.address)).toEqual([]);
  });
});

describe('a password wallet created or imported by this version', SCRYPT_SUITE, () => {
  it('seals the SURI password and signs every protected account with it', async () => {
    const keyring = unlocked();
    const meta = { name: 'New', ethereumAddress: '', walletEcosystem: WalletEcosystem.Substrate,
      ...deriveUniversalWalletKeyringFields(MNEMONIC, PASSWORD) } as FWKeyringMeta;

    const address = await keyring.addAccount(SURI, meta, WalletEcosystem.Substrate, 'sr25519');
    const pair = mocks.backend.getPair(address);

    expect(metaOf(pair).universalWalletPassphrase).toMatchObject({ version: 1 });
    expect(JSON.stringify(record(pair))).not.toContain(PASSWORD);
    expect(keyring.universalWalletPassphraseCandidates(address)).toEqual([PASSWORD]);
    expect(keyring.universalWalletPasswordStatus(address)).toEqual({ state: 'protected' });
    for (const network of UNIVERSAL_WALLET_PASSWORD_NETWORKS) {
      expect(secret(keyring, pair, network)).toEqual({ seed: MNEMONIC, passphrase: PASSWORD });
    }
  });

  it('seals nothing for a wallet without a password, which keeps the no-password accounts', async () => {
    const keyring = unlocked();
    const meta = { name: 'Plain', ethereumAddress: '', walletEcosystem: WalletEcosystem.Substrate,
      ...deriveUniversalWalletKeyringFields(MNEMONIC) } as FWKeyringMeta;

    const address = await keyring.addAccount(`${MNEMONIC}//polkadot`, meta, WalletEcosystem.Substrate, 'sr25519');
    const pair = mocks.backend.getPair(address);

    expect(metaOf(pair).universalWalletPassphrase).toBeUndefined();
    expect(keyring.universalWalletPassphraseCandidates(address)).toEqual([]);
    expect(secret(keyring, pair, 'solana')).toEqual({ seed: MNEMONIC, passphrase: '' });
    // A path without a password: the person may say so once; the switch has nothing to do.
    expect(keyring.universalWalletPasswordStatus(address)).toEqual({ state: 'password-unknown' });
    expect(await keyring.addUniversalWalletPasswordPath({ address, derivationPath: '//polkadot' }))
      .toEqual({ ok: false, code: 'no_password' });
    expect(await keyring.switchUniversalWalletAccounts(address, probeAll({}))).toEqual([]);
  });

  it('reports no notice for a wallet made from the bare phrase', async () => {
    const keyring = unlocked();
    const address = await keyring.addAccount(MNEMONIC, { name: 'Bare', walletEcosystem: WalletEcosystem.Substrate,
      ...deriveUniversalWalletKeyringFields(MNEMONIC) } as FWKeyringMeta, WalletEcosystem.Substrate, 'sr25519');

    expect(keyring.universalWalletPasswordStatus(address)).toEqual({ state: 'none' });
  });
});
