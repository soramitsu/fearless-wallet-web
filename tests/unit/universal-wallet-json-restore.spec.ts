import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cryptoWaitReady } from '@polkadot/util-crypto';

// JSON backups as released builds wrote them (the file Export → JSON saves and a Google Drive backup holds), restored
// by this version on a real keyring over an in-memory chrome.storage.local. The backups and 4.2.2's own restore of
// them come from real builds (tests/fixtures/upgrade/json-backups, scripts/upgrade-e2e/capture-json-backups.mjs).
const fixture = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  passwordRecord: undefined as { passwordHash: string } | undefined,
  runtime: { lastError: undefined as { message: string } | undefined, getURL: (path: string) => path },
}));
// The unused built-in zero-key fixture eagerly constructs a TON contract with a different Buffer in Node.
vi.mock('@subwallet/keyring/pair/nobody', () => ({ nobody: () => { throw new Error('Unused development pair'); } }));
vi.mock('@/consts/global', async (original) => ({ ...(await original<Record<string, unknown>>()), IS_EXTENSION: true }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {
  runtime: fixture.runtime,
  storage: { local: {
    get: (_keys: unknown, callback: (data: Record<string, unknown>) => void) =>
      callback(structuredClone({ ...fixture.data, 'fw:keyring': fixture.passwordRecord })),
    set: (data: Record<string, unknown>, callback: () => void) => {
      const { ['fw:keyring']: password, ...accounts } = structuredClone(data);
      if (password) fixture.passwordRecord = password as { passwordHash: string };
      Object.assign(fixture.data, accounts);
      setTimeout(callback, 0);
    },
    remove: (keys: string | string[], callback?: () => void) => {
      [keys].flat().forEach((key) => delete fixture.data[key]);
      setTimeout(() => callback?.(), 0);
    },
  } },
} }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
// CJS TON dependencies and the keyring must share one Buffer implementation in the Node test runner.
vi.mock('vite-plugin-node-polyfills/shims/buffer', async () => {
  const { createRequire } = await import('node:module');
  const { Buffer } = createRequire(import.meta.url)('node:buffer');
  return { default: Buffer, Buffer };
});

import { keyring } from '@subwallet/ui-keyring';
import { KeyringService } from '@extension-base/services/keyring-service';
import { TonKeyringService } from '@extension-base/services/keyring-service/TonKeyring';
import { accountStorageKey } from '@extension-base/services/keyring-service/AccountMetadata';
import {
  exportUniversalWalletSecret,
  type UniversalWalletFundsProbe,
} from '@extension-base/services/keyring-service/UniversalWalletPassword';
import { resolveBitcoinTransferSource } from '@extension-base/api/bitcoin/transfer';
import AccountsStore from '@extension-base/stores/Accounts';
import Extension from '@extension-base/background/handlers/Extension';
import backups306 from '../fixtures/upgrade/json-backups/3.0.6-path-wallets.json';
import backups422 from '../fixtures/upgrade/json-backups/4.2.2-path-wallets.json';
import restored422 from '../fixtures/upgrade/json-backups/4.2.2-restored-3.0.6-backups.json';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import passphraseVectors from '../../docs/universal-wallet-v2-passphrase-vectors.json';
import type State from '@extension-base/background/handlers/State';
import type { FWKeyringMeta } from '@extension-base/types';
import type { KeyringPair$Json } from '@subwallet/keyring/types';
import { WalletEcosystem } from '@/interfaces';
import { deriveUniversalWalletNetworkFields } from '@/util/universalWalletKeyringFields';
import { UNIVERSAL_WALLET_PASSWORD_NETWORKS, type UniversalWalletPasswordNetwork } from '@/util/universalWalletPassphrase';

// The networks both vector files list (the v2 file also has the Substrate and EVM accounts).
type Expected = Pick<(typeof vectors.vectors)[number]['expected'], 'bitcoin' | 'solana' | 'ton' | 'iroha'>;
type Backups = typeof backups306;
type BackupWallet = Backups['wallets'][number] & { ethereumBackup?: KeyringPair$Json };

const DEVICE_PASSWORD = 'Master password on the new device';
const SCRYPT_SUITE = { timeout: 180_000 };
const [import12, default24] = vectors.vectors;
const [trezor, unicode] = passphraseVectors.vectors;

const fields = ({ bitcoin, solana, ton, iroha }: Expected) => ({
  bitcoinAddress: bitcoin.mainnet.firstReceiveAddress,
  bitcoinTestnetAddress: bitcoin.testnet.firstReceiveAddress,
  solanaAddress: solana.address,
  tonAddress: ton.addressNonBounceable,
  tonPublicKeyHex: ton.publicKeyHex,
  irohaAddress: iroha.taira.i105,
  irohaPublicKeyHex: iroha.taira.publicKeyHex,
});
const networkFields: Record<UniversalWalletPasswordNetwork, (keyof ReturnType<typeof fields>)[]> = {
  bitcoin: ['bitcoinAddress'],
  bitcoinTestnet: ['bitcoinTestnetAddress'],
  solana: ['solanaAddress'],
  ton: ['tonAddress', 'tonPublicKeyHex'],
  iroha: ['irohaAddress', 'irohaPublicKeyHex'],
};
// Each network from `legacy` (what the words alone open) where listed, else from `protectedFields`.
const mixed = (legacy: Expected, protectedFields: Expected, legacyNetworks: UniversalWalletPasswordNetwork[]) =>
  Object.fromEntries(UNIVERSAL_WALLET_PASSWORD_NETWORKS.flatMap((network) => networkFields[network].map((key) =>
    [key, fields(legacyNetworks.includes(network) ? legacy : protectedFields)[key]])));

let service: KeyringService;
let extension: Extension;
let probe: ReturnType<typeof vi.fn<UniversalWalletFundsProbe>>;

// What storage holds for the account, which is what the next start loads.
const metaOf = (address: string) =>
  (fixture.data[`fw:${accountStorageKey(keyring.getPair(address))}`] as KeyringPair$Json).meta as FWKeyringMeta;
const walletOf = (backups: Backups, name: string) => backups.wallets.find((wallet) => wallet.name === name) as BackupWallet;

function probeWith(funds: Partial<Record<UniversalWalletPasswordNetwork, 'funded' | 'empty' | 'unknown'>>) {
  probe = vi.fn<UniversalWalletFundsProbe>(async (network) => funds[network] ?? 'empty');
  service.setUniversalWalletFundsProbe(probe);
}

// A device that has (or, for a stored profile, had) this master password; `storage` is what an earlier build left.
async function startDevice(password: string, storage: Record<string, unknown> = {}, passwordRecord?: { passwordHash: string }) {
  fixture.data = structuredClone(storage);
  fixture.passwordRecord = structuredClone(passwordRecord);
  for (const address of Object.keys(keyring.accounts.subject.value)) keyring.accounts.removeSubjectOnly(address);
  keyring.loadAll({ type: 'sr25519', isDevelopment: false, store: new AccountsStore(), password_store: {
    get: (callback) => callback(fixture.passwordRecord!),
    set: (record) => { fixture.passwordRecord = structuredClone(record); },
    remove: () => { fixture.passwordRecord = undefined; },
  } });
  service = Object.create(KeyringService.prototype) as KeyringService;
  Object.assign(service, { tonKeyring: new TonKeyringService(service), accountAccess: { scheduleScan: vi.fn(), cancelScan: vi.fn(), flagPreviousMasterPair: vi.fn() } });
  if (passwordRecord) {
    // As the background's start-up does before the first unlock.
    await keyring.restoreKeyringPassword();
    expect(service.unlockKeyring({ password })).toBe(true);
  } else {
    keyring.changeMasterPassword(password);
    Object.assign(service, { password });
  }
  extension = Object.create(Extension.prototype) as Extension;
  Object.assign(extension, { state: { keyringService: service, updateCurrentAccount: vi.fn(), updateNetworkForNewWallet: vi.fn() } });
  probeWith({});
}

// As Google Drive restore (BackupWalletsList.vue) and Import → JSON (AddWallet.vue) do: the Ethereum file first.
async function restoreWallet(backups: Backups, name: string) {
  const wallet = walletOf(backups, name);
  const linkedEthereumAddress = wallet.ethereumBackup
    ? await extension.jsonRestore({ file: wallet.ethereumBackup as KeyringPair$Json, password: backups.masterPassword })
    : undefined;
  const address = await extension.jsonRestore({ file: wallet.backup as KeyringPair$Json, password: backups.masterPassword, linkedEthereumAddress });

  expect(address).toBe(wallet.address);
  return { address, ethereumAddress: linkedEthereumAddress };
}

const secret = (address: string, network: UniversalWalletPasswordNetwork) =>
  exportUniversalWalletSecret(service, { address, walletEcosystem: metaOf(address).walletEcosystem }, network, metaOf(address));

beforeAll(async () => {
  await cryptoWaitReady();
  vi.spyOn(keyring.keyringOption, 'init').mockImplementation(() => {});
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each([
  ['3.0.6', backups306],
  ['4.2.2', backups422],
])('a %s JSON backup of a wallet imported with a derivation path', SCRYPT_SUITE, (version, backups) => {
  it('asks for the path, then shows every account: the funded or unchecked old address stays, the rest is protected', async () => {
    await startDevice(DEVICE_PASSWORD);
    const { address, ethereumAddress } = await restoreWallet(backups, 'Password wallet');

    // The words open the Ethereum key at Fearless's standard path, which needs no asking; the Substrate key needs its path.
    expect(metaOf(ethereumAddress!).isMnemonicUnverified).toBe(false);
    expect(metaOf(address).isMnemonicUnverified).toBe(true);
    expect(metaOf(address).bitcoinAddress).toBeUndefined();
    expect(service.universalWalletPasswordStatus(address)).toEqual({ state: 'path-required' });

    const before = structuredClone(fixture.data);
    for (const wrong of ['//polkadot', '//polkadot///wrong', `//kusama///${trezor.passphrase}`]) {
      expect(await service.addUniversalWalletPasswordPath({ address, derivationPath: wrong })).toEqual({ ok: false, code: 'path_mismatch' });
    }
    expect(fixture.data).toEqual(before);
    expect(probe).not.toHaveBeenCalled();

    probeWith({ bitcoin: 'funded', ton: 'unknown' });
    const result = await service.addUniversalWalletPasswordPath({ address, derivationPath: ` //polkadot///${trezor.passphrase} ` });
    const legacy = fields(import12.expected);
    const protectedAccounts = fields(trezor.expected);

    expect(result).toEqual({ ok: true, status: { state: 'legacy', rows: [
      { network: 'bitcoin', legacyAddress: legacy.bitcoinAddress, protectedAddress: protectedAccounts.bitcoinAddress },
      { network: 'ton', legacyAddress: legacy.tonAddress, protectedAddress: protectedAccounts.tonAddress },
    ] } });
    // Every no-password address was checked once, before anything was written, for both keys of the wallet.
    expect(probe.mock.calls.map(([network, mnemonic, probed]) => [network, mnemonic, probed])).toEqual(
      UNIVERSAL_WALLET_PASSWORD_NETWORKS.map((network) => [network, import12.mnemonic, deriveUniversalWalletNetworkFields(network, import12.mnemonic, '')])
    );
    for (const account of [address, ethereumAddress!]) {
      expect(metaOf(account)).toMatchObject({
        ...mixed(import12.expected, trezor.expected, ['bitcoin', 'ton']),
        universalWalletLegacyNetworks: ['bitcoin', 'ton'],
        // Rule 9: an old address found empty stays watched, since funds can still reach it.
        universalWalletWatchedNetworks: ['bitcoinTestnet', 'solana', 'iroha'],
      });
    }
    expect(metaOf(address)).toMatchObject({ isMnemonicUnverified: false, isMasterAccount: true, universalWalletPasswordKnown: true });
    // The funded and unchecked addresses are exactly the ones the original install showed.
    const shown = version === '4.2.2' ? walletOf(backups, 'Password wallet').backup.meta as FWKeyringMeta : legacy;
    expect(metaOf(address).bitcoinAddress).toBe(shown.bitcoinAddress);
    expect(metaOf(address).tonAddress).toBe(shown.tonAddress);
    // The password is kept sealed, never in the clear.
    expect(metaOf(address).universalWalletPassphrase).toMatchObject({ version: 1 });
    expect(JSON.stringify(fixture.data)).not.toContain(trezor.passphrase);

    // Each account signs with the passphrase that opens it.
    for (const network of UNIVERSAL_WALLET_PASSWORD_NETWORKS) {
      expect(secret(address, network)).toEqual({
        seed: import12.mnemonic,
        passphrase: ['bitcoin', 'ton'].includes(network) ? '' : trezor.passphrase,
      });
    }
    expect(resolveBitcoinTransferSource({ keyringService: service } as unknown as State, legacy.bitcoinAddress, 'mainnet'))
      .toMatchObject({ passphrase: '', source: { address: legacy.bitcoinAddress } });
    expect(resolveBitcoinTransferSource({ keyringService: service } as unknown as State, protectedAccounts.bitcoinTestnetAddress, 'testnet'))
      .toMatchObject({ passphrase: trezor.passphrase, source: { address: protectedAccounts.bitcoinTestnetAddress } });
    expect(service.exportMnemonic({ address, walletEcosystem: WalletEcosystem.Substrate })).toEqual({ seed: import12.mnemonic });

    // The next unlock adds nothing and looks only at the watched old addresses, which are still empty.
    const after = structuredClone(fixture.data);
    probeWith({});
    service.resumeLegacyNetworkEnrollment();
    await service.waitForLegacyNetworkEnrollment();
    expect(fixture.data).toEqual(after);
    expect(probe.mock.calls.map(([network, , , passphrase]) => [network, passphrase])).toEqual([
      ['bitcoinTestnet', ''], ['solana', ''], ['iroha', ''],
    ]);
    expect(service.universalWalletPasswordStatus(address)).toMatchObject({ state: 'legacy' });
  });

  it('moves the last old address to its protected one once it is empty, and lists nothing old afterwards', async () => {
    await startDevice(DEVICE_PASSWORD);
    const { address, ethereumAddress } = await restoreWallet(backups, 'Password wallet');

    probeWith({ solana: 'funded' });
    await service.addUniversalWalletPasswordPath({ address, derivationPath: `//polkadot///${trezor.passphrase}` });
    expect(service.universalWalletPasswordStatus(address)).toMatchObject({ state: 'legacy', rows: [{ network: 'solana' }] });

    probeWith({});
    expect(await service.switchUniversalWalletAccounts(address, probe)).toEqual([{ network: 'solana', outcome: 'switched' }]);
    expect(service.universalWalletPasswordStatus(address)).toEqual({ state: 'protected' });
    for (const account of [address, ethereumAddress!]) {
      expect(metaOf(account)).toMatchObject({ ...fields(trezor.expected), universalWalletWatchedNetworks: [...UNIVERSAL_WALLET_PASSWORD_NETWORKS] });
      expect(metaOf(account).universalWalletLegacyNetworks).toBeUndefined();
    }
    expect(secret(address, 'solana')).toEqual({ seed: import12.mnemonic, passphrase: trezor.passphrase });
  });

  it('gives a path without a password every address earlier versions showed, with nothing to check', async () => {
    await startDevice(DEVICE_PASSWORD);
    const { address } = await restoreWallet(backups, 'Staking');

    expect(service.universalWalletPasswordStatus(address)).toEqual({ state: 'path-required' });
    expect(await service.addUniversalWalletPasswordPath({ address, derivationPath: '//staking' }))
      .toEqual({ ok: true, status: { state: 'none' } });
    expect(probe).not.toHaveBeenCalled();
    expect(metaOf(address)).toMatchObject({ ...fields(default24.expected), universalWalletPasswordKnown: true });
    expect(metaOf(address).universalWalletLegacyNetworks).toBeUndefined();
    expect(metaOf(address).universalWalletWatchedNetworks).toBeUndefined();
    expect(metaOf(address).universalWalletPassphrase).toBeUndefined();
    for (const network of UNIVERSAL_WALLET_PASSWORD_NETWORKS) {
      expect(secret(address, network)).toEqual({ seed: default24.mnemonic, passphrase: '' });
    }
  });

  it('protects every account of a Unicode password whose old addresses are confirmed empty', async () => {
    await startDevice(DEVICE_PASSWORD);
    const { address } = await restoreWallet(backups, 'Unicode password');

    probeWith({});
    expect(await service.addUniversalWalletPasswordPath({ address, derivationPath: `//unicode///${unicode.passphrase}` }))
      .toEqual({ ok: true, status: { state: 'protected' } });
    expect(metaOf(address)).toMatchObject({ ...fields(unicode.expected), universalWalletWatchedNetworks: [...UNIVERSAL_WALLET_PASSWORD_NETWORKS] });
    for (const network of UNIVERSAL_WALLET_PASSWORD_NETWORKS) {
      expect(secret(address, network)).toEqual({ seed: default24.mnemonic, passphrase: unicode.passphrase });
    }
  });

  it('shows the accounts of a wallet whose words open its key alone from the next unlock, on both keys', async () => {
    await startDevice(DEVICE_PASSWORD);
    const { address, ethereumAddress } = await restoreWallet(backups, 'Plain');

    expect(service.universalWalletPasswordStatus(address)).toEqual({ state: 'none' });
    expect(metaOf(ethereumAddress!).isMnemonicUnverified).toBe(false);
    service.resumeLegacyNetworkEnrollment();
    await service.waitForLegacyNetworkEnrollment();
    for (const account of [address, ethereumAddress!]) {
      expect(metaOf(account)).toMatchObject({ ...fields(default24.expected), isMnemonicUnverified: false });
    }
    expect(probe).not.toHaveBeenCalled();
  });

  it('shows the accounts of an Ethereum backup restored on its own without asking', async () => {
    await startDevice(DEVICE_PASSWORD);
    const wallet = walletOf(backups, 'Password wallet');
    const address = await extension.jsonRestore({ file: wallet.ethereumBackup as KeyringPair$Json, password: backups.masterPassword });

    expect(metaOf(address)).toMatchObject({ isMnemonicUnverified: false, isMasterAccount: true });
    expect(service.universalWalletPasswordStatus(address)).toEqual({ state: 'none' });
    // As for every restore, the next unlock adds them.
    service.resumeLegacyNetworkEnrollment();
    await service.waitForLegacyNetworkEnrollment();
    // Nothing tells which password, if any, the wallet's other key had: the addresses earlier versions showed.
    expect(metaOf(address)).toMatchObject(fields(import12.expected));
    expect(probe).not.toHaveBeenCalled();
  });
});

describe('a wallet 4.2.2 restored from a 3.0.6 backup, after the update', SCRYPT_SUITE, () => {
  const { masterPassword, storage } = restored422;
  const { ['fw:keyring']: passwordRecord, ...records } = storage;
  const wallet = (name: string) => restored422.wallets.find((entry) => entry.name === name)!;

  it('was left by 4.2.2 with every key unverified that is not opened by its words alone, and no Universal Wallet account', () => {
    const plain = wallet('Plain').address;
    for (const record of Object.values(records).filter((value) => 'encoded' in (value as object)) as KeyringPair$Json[]) {
      expect(record.meta).toMatchObject({ isMnemonicUnverified: record.address !== plain, isMasterPassword: true });
      expect(record.meta.bitcoinAddress).toBeUndefined();
    }
  });

  it('asks each wallet for its path once unlocked, and its accounts are back after it', async () => {
    await startDevice(masterPassword, records, passwordRecord);
    await service.waitForLegacyNetworkEnrollment();
    const passwordWallet = wallet('Password wallet');

    // The Ethereum key at the standard path is verified by the unlock's enrollment, but waits for its wallet.
    expect(metaOf(passwordWallet.ethereumAddress)).toMatchObject({ isMnemonicUnverified: false });
    expect(metaOf(passwordWallet.ethereumAddress).bitcoinAddress).toBeUndefined();
    for (const name of ['Password wallet', 'Staking', 'Unicode password']) {
      expect(service.universalWalletPasswordStatus(wallet(name).address)).toEqual({ state: 'path-required' });
    }
    // A wallet without a path has its accounts at once, on both keys.
    for (const account of [wallet('Plain').address, wallet('Plain').ethereumAddress]) {
      expect(metaOf(account)).toMatchObject({ ...fields(default24.expected), isMnemonicUnverified: false });
    }
    expect(service.universalWalletPasswordStatus(wallet('Plain').address)).toEqual({ state: 'none' });

    probeWith({ solana: 'funded' });
    expect(await service.addUniversalWalletPasswordPath({ address: passwordWallet.address, derivationPath: `//polkadot///${trezor.passphrase}` }))
      .toMatchObject({ ok: true, status: { state: 'legacy', rows: [{ network: 'solana', legacyAddress: import12.expected.solana.address }] } });
    for (const account of [passwordWallet.address, passwordWallet.ethereumAddress]) {
      expect(metaOf(account)).toMatchObject({
        ...mixed(import12.expected, trezor.expected, ['solana']),
        universalWalletWatchedNetworks: ['bitcoin', 'bitcoinTestnet', 'ton', 'iroha'],
      });
    }
    expect(await service.addUniversalWalletPasswordPath({ address: wallet('Staking').address, derivationPath: '//staking' }))
      .toEqual({ ok: true, status: { state: 'none' } });
    expect(metaOf(wallet('Staking').address)).toMatchObject(fields(default24.expected));

    // After the next start the same accounts are listed; only the watched old addresses are looked at again.
    const after = structuredClone(fixture.data);
    await startDevice(masterPassword, after, fixture.passwordRecord);
    await service.waitForLegacyNetworkEnrollment();
    expect(fixture.data).toEqual(after);
    expect(probe.mock.calls.map(([network, , , passphrase]) => [network, passphrase])).toEqual([
      ['bitcoin', ''], ['bitcoinTestnet', ''], ['ton', ''], ['iroha', ''],
    ]);
    expect(service.universalWalletPasswordStatus(passwordWallet.address)).toMatchObject({ state: 'legacy' });
    expect(service.universalWalletPasswordStatus(wallet('Staking').address)).toEqual({ state: 'none' });
    expect(service.universalWalletPasswordStatus(wallet('Unicode password').address)).toEqual({ state: 'path-required' });
    expect(secret(passwordWallet.address, 'iroha')).toEqual({ seed: import12.mnemonic, passphrase: trezor.passphrase });
  });

  it('adds nothing to a wallet the security notice still holds back, and nothing when the wallet locks meanwhile', async () => {
    await startDevice(masterPassword, records, passwordRecord);
    await service.waitForLegacyNetworkEnrollment();
    const { address } = wallet('Staking');

    service.setLegacyNetworkEnrollmentGate(() => false);
    expect(await service.addUniversalWalletPasswordPath({ address, derivationPath: '//staking' }))
      .toEqual({ ok: true, status: { state: 'none' } });
    expect(metaOf(address)).toMatchObject({ isMnemonicUnverified: false });
    expect(metaOf(address).bitcoinAddress).toBeUndefined();
    service.setLegacyNetworkEnrollmentGate(() => true);
    service.resumeLegacyNetworkEnrollment();
    await service.waitForLegacyNetworkEnrollment();
    expect(metaOf(address)).toMatchObject(fields(default24.expected));

    const unicodeWallet = wallet('Unicode password').address;
    const before = structuredClone(fixture.data);
    probe = vi.fn<UniversalWalletFundsProbe>(async () => {
      service.lockKeyring();
      return 'empty';
    });
    service.setUniversalWalletFundsProbe(probe);
    expect(await service.addUniversalWalletPasswordPath({ address: unicodeWallet, derivationPath: `//unicode///${unicode.passphrase}` }))
      .toEqual({ ok: false, code: 'locked' });
    expect(fixture.data).toEqual(before);
  });
});
