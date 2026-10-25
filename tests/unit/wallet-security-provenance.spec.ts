import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyringService } from '@extension-base/services/keyring-service';
import { WalletSecurityProvenance } from '@extension-base/services/keyring-service/WalletSecurityProvenance';
import type { KeyringPair$Json } from '@subwallet/keyring/types';
import type { FWKeyringMeta } from '@extension-base/types';

const mocks = vi.hoisted(() => ({
  pairs: new Map<string, { address: string; meta: FWKeyringMeta }>(),
  addUri: vi.fn(), restore: vi.fn(), fromJson: vi.fn(), fromUri: vi.fn(), update: vi.fn(),
}));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {
  addUri: mocks.addUri,
  keyring: { isLocked: false },
  getPair: (address: string) => mocks.pairs.get(address),
  getAccount: (address: string) => mocks.pairs.get(address),
  restoreAccount: mocks.restore, createFromJson: mocks.fromJson, createFromUri: mocks.fromUri,
} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: {} }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: {} }));
vi.mock('@extension-base/stores/CurrentAccountStore', () => ({ default: class {} }));
vi.mock('@extension-base/stores/Accounts', () => ({ default: class {} }));
vi.mock('@extension-base/stores/KeyringStore', () => ({ default: class {} }));
vi.mock('@extension-base/stores/KeyringStoreWeb', () => ({ default: class {} }));
vi.mock('@extension-base/services/keyring-service/TonKeyring', () => ({ TonKeyringService: class {} }));
vi.mock('@extension-base/services/keyring-service/AccountMetadata', () => ({ updateAccountMetadata: mocks.update }));
vi.mock('@extension-base/services/keyring-service/LocalAccountImport', () => ({ importLocalAccount: async (pair) => pair.address }));
vi.mock('@extension-base/services/keyring-service/JsonAccountImport', () => ({ decodeJsonAccount: mocks.restore }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));

import { WalletEcosystem } from '@/interfaces';
import { isRecoveryOnlyWallet, isWalletGenerationExpired } from '@/util/walletSecurity';

const EVM = '0x1111111111111111111111111111111111111111';
const SUBSTRATE = '5GeneratedAccount';
const OLD_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const flags = ['isExternal', 'isHardware', 'isInjected', 'isMobile', 'isReadOnly', 'isWatchOnly', 'noPublicKey'];
const claims = { walletSecurityGeneration: 1, ...Object.fromEntries(flags.map((flag) => [flag, true])) };
const service = () => {
  const value = Object.create(KeyringService.prototype) as KeyringService;
  Object.defineProperty(value, 'tonKeyring', { configurable: true, value: { vault: { exclusive: (fn) => fn() } } });
  Object.assign(value, { password: 'fixture-password' });
  return value;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pairs.clear();
  mocks.addUri.mockImplementation((_suri: string, meta: FWKeyringMeta, type: string) => {
    const pair = { address: type === 'ethereum' ? EVM : SUBSTRATE, meta: { ...meta } };
    mocks.pairs.set(pair.address, pair);
    return { pair };
  });
  mocks.update.mockImplementation(async (pair, update) => {
    pair.meta = update(pair.meta, { meta: pair.meta });
    return true;
  });
  mocks.fromUri.mockImplementation((suri, meta, type) => mocks.addUri(suri, meta, type).pair);
  mocks.restore.mockImplementation((json) => ({ address: SUBSTRATE, type: 'sr25519', meta: json.meta, lock: vi.fn() }));
});

describe('fresh wallet security provenance', () => {
  it('treats unmarked wallets as recovery-only independently of universal metadata', () => {
    expect(isRecoveryOnlyWallet({})).toBe(true);
    for (const walletSecurityGeneration of [undefined, 0, 2, '1', NaN]) {
      expect(isRecoveryOnlyWallet({ walletSecurityGeneration })).toBe(true);
    }
    expect(isRecoveryOnlyWallet({ walletSecurityGeneration: 1 })).toBe(false);
    for (const flag of flags) expect(isRecoveryOnlyWallet({ [flag]: true })).toBe(false);
  });

  it('stamps a backend-generated root and its parent/EVM derivations', async () => {
    const wallet = service();
    const phrase = await wallet.mnemonicGenerate({ walletEcosystem: WalletEcosystem.Substrate, wordCount: 24 });
    const childAddress = await wallet.addAccount(`${phrase}/m/44'/60'/0'/0/0`, {}, WalletEcosystem.Substrate, 'ethereum', true);
    const parentAddress = await wallet.addAccount(`${phrase}//0`, { ethereumAddress: childAddress }, WalletEcosystem.Substrate, 'sr25519', true);
    expect(mocks.pairs.get(childAddress)!.meta.walletSecurityGeneration).toBe(1);
    expect(mocks.pairs.get(parentAddress)!.meta).toMatchObject({ walletSecurityGeneration: 1, ethereumAddress: childAddress });
  });

  it('does not trust a marker or remote-signer flags on imported local secrets', async () => {
    const wallet = service();
    await wallet.addAccount(OLD_PHRASE, claims, WalletEcosystem.Substrate, 'sr25519');
    const meta = mocks.pairs.get(SUBSTRATE)!.meta;
    expect(meta.walletSecurityGeneration).toBeUndefined();
    for (const flag of flags) expect(meta[flag]).toBeFalsy();
    expect(isRecoveryOnlyWallet(meta)).toBe(true);
    expect(claims.walletSecurityGeneration).toBe(1);
  });

  it.each(['restoreAccount', 'createFromJson'] as const)('strips untrusted backup claims in %s', async (method) => {
    const wallet = service();
    const backup = { address: SUBSTRATE, meta: { ...claims, name: 'Old backup' } } as unknown as KeyringPair$Json;
    if (method === 'restoreAccount') await wallet.restoreAccount(backup, 'fixture-password');
    else wallet.createFromJson(backup);
    const imported = method === 'restoreAccount' ? mocks.restore.mock.calls[0][0] : backup;
    expect(imported.meta.walletSecurityGeneration).toBeUndefined();
    for (const flag of flags) expect(imported.meta[flag]).toBeUndefined();
    expect(imported.meta.name).toBe('Old backup');
  });

  it('preserves trusted provenance during rename but cannot mint it for an old account', async () => {
    const wallet = service();
    const old = { address: SUBSTRATE, meta: { name: 'Old wallet' } as FWKeyringMeta };
    mocks.pairs.set(SUBSTRATE, old);
    await wallet.saveAccountMeta(SUBSTRATE, { ...claims, name: 'Renamed old' });
    expect(isRecoveryOnlyWallet(old.meta)).toBe(true);
    expect(old.meta.name).toBe('Renamed old');
    old.meta.walletSecurityGeneration = 1;
    await wallet.saveAccountMeta(SUBSTRATE, { name: 'Renamed fresh', walletSecurityGeneration: 0 });
    expect(old.meta.walletSecurityGeneration).toBe(1);
    expect(old.meta.name).toBe('Renamed fresh');
  });

  it('rejects an expired fresh-creation request before any account is stored', async () => {
    const firstWorker = service();
    const phrase = await firstWorker.mnemonicGenerate({ walletEcosystem: WalletEcosystem.Substrate, wordCount: 24 });
    const restartedWorker = service();
    const failure = await restartedWorker.addAccount(phrase, claims, WalletEcosystem.Substrate, 'sr25519', true).catch((error) => error);
    expect(isWalletGenerationExpired(failure)).toBe(true);
    expect(mocks.addUri).not.toHaveBeenCalled();
    expect(mocks.pairs.size).toBe(0);
  });

  it('recognizes issued TON roots and excludes arbitrary fingerprints after restart', async () => {
    const wallet = service();
    Object.defineProperty(wallet, 'tonKeyring', { value: { generateMnemonic: vi.fn().mockResolvedValue(OLD_PHRASE.split(' ')) } });
    const phrase = await wallet.mnemonicGenerate({ walletEcosystem: WalletEcosystem.Ton, wordCount: 24 });
    expect(wallet.getAccountCreationMeta(phrase, {})).toMatchObject({ walletSecurityGeneration: 1 });
    expect(service().getAccountCreationMeta(phrase, claims).walletSecurityGeneration).toBeUndefined();
  });

  it('limits abandoned generation sessions without removing both sibling derivation proofs', () => {
    const provenance = new WalletSecurityProvenance();
    for (let i = 0; i < 33; i++) provenance.rememberGeneratedMnemonic(`public-fixture-${i}`);
    expect(provenance.accountMetadata('public-fixture-0', {}).walletSecurityGeneration).toBeUndefined();
    expect(provenance.accountMetadata('public-fixture-32//0', {}).walletSecurityGeneration).toBe(1);
    expect(provenance.accountMetadata("public-fixture-32/m/44'/60'/0'/0/0", {}).walletSecurityGeneration).toBe(1);
  });
});
