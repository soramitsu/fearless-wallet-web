import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { keyring } from '@subwallet/ui-keyring';
import { BehaviorSubject } from 'rxjs';

const fixture = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  runtime: { lastError: undefined as { message: string } | undefined, getURL: (path: string) => path },
}));
vi.mock('@subwallet/keyring/pair/nobody', () => ({ nobody: () => { throw new Error('Unused development pair'); } }));
vi.mock('@/consts/global', async (original) => ({ ...(await original<Record<string, unknown>>()), IS_EXTENSION: true }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {
  runtime: fixture.runtime,
  storage: { local: {
    get: (keys: string[] | null, callback: (data: Record<string, unknown>) => void) => {
      setTimeout(() => callback(structuredClone(keys
        ? Object.fromEntries(keys.map((key) => [key, fixture.data[key]]).filter(([, value]) => value !== undefined))
        : fixture.data)));
    },
    set: (data: Record<string, unknown>, callback: () => void) => {
      const snapshot = structuredClone(data);
      setTimeout(() => { Object.assign(fixture.data, snapshot); callback(); });
    },
    remove: (keys: string | string[], callback: () => void) => {
      setTimeout(() => { [keys].flat().forEach((key) => delete fixture.data[key]); callback(); });
    },
  } },
} }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
vi.mock('@extension-base/services/keyring-service/LegacyNetworkEnrollment', () => ({ enrollLegacyAccountNetworks: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));

import { KeyringService } from '@extension-base/services/keyring-service';
import { TonKeyringService } from '@extension-base/services/keyring-service/TonKeyring';
import AccountsStore from '@extension-base/stores/Accounts';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import CurrentAccountStore from '@extension-base/stores/CurrentAccountStore';
import Extension from '@extension-base/background/handlers/Extension';
import { WalletEcosystem } from '@/interfaces';

const PASSWORD = 'Public derived export fixture password';
const PHRASE = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';
let service: KeyringService;

beforeEach(async () => {
  await cryptoWaitReady();
  fixture.data = {};
  for (const subject of [keyring.accounts, keyring.addresses, keyring.contracts]) {
    for (const address of Object.keys(subject.subject.value)) subject.removeSubjectOnly(address);
  }
  vi.spyOn(keyring.keyringOption, 'init').mockImplementation(() => {});
  keyring.loadAll({ type: 'sr25519', isDevelopment: false, store: new AccountsStore(),
    password_store: { get: (callback) => callback(undefined), set: () => {}, remove: () => {} },
  });
  keyring.keyring.changeMasterPassword(PASSWORD);
  service = Object.create(KeyringService.prototype);
  Object.assign(service, { password: PASSWORD, tonKeyring: new TonKeyringService(service),
    currentAccountStore: new CurrentAccountStore(), currentAccountSubject: new BehaviorSubject(null),
    selectionRevision: 0, selectionRequestRevision: 0,
    accountAccess: { scheduleScan: vi.fn(), flagPreviousMasterPair: vi.fn() }, scheduleLegacyNetworkEnrollment: vi.fn() });
});
afterEach(async () => {
  await BaseExtensionStore.flush().catch(() => undefined);
  vi.restoreAllMocks();
});

const opens = (seed: string, type: 'sr25519' | 'ethereum' = 'sr25519') => keyring.createFromUri(seed, {}, type).address;
// The message the export choices send: the handler answers with the keyring service's boolean.
function rawSeedAvailable(address: string, password: string) {
  const extension = Object.create(Extension.prototype) as Extension;
  Object.assign(extension, { state: { keyringService: service } });
  return extension.handle('public-check', 'pri(keyring.export.rawSeedAvailable)', { address, password });
}

describe('mnemonic and raw-seed export of a wallet made with a derivation path or password', () => {
  for (const suffix of ['//staking', '///public-bip39-password']) {
    it(`says the phrase alone opens another account and refuses the raw seed (${suffix})`, async () => {
      const address = await service.addAccount(`${PHRASE}${suffix}`, { name: 'Path', ethereumAddress: '' }, WalletEcosystem.Substrate, 'sr25519');
      const request = { address, password: PASSWORD, walletEcosystem: WalletEcosystem.Substrate };

      expect(await service.exportAccountMnemonic(request)).toEqual({ seed: PHRASE, restoresOtherAccount: true });
      expect(opens(PHRASE)).not.toBe(address);
      expect(() => service.accountExportRawSeed(request)).toThrow('derivation path or password');
      expect(await rawSeedAvailable(address, PASSWORD)).toBe(false);
      // Internal callers still get the stored phrase as before.
      expect(service.exportMnemonic(request)).toEqual({ seed: PHRASE });
    });
  }

  it('exports the phrase and raw seed of a wallet the phrase opens, without a note', async () => {
    const address = await service.addAccount(PHRASE, { name: 'Root', ethereumAddress: '' }, WalletEcosystem.Substrate, 'sr25519');
    const request = { address, password: PASSWORD, walletEcosystem: WalletEcosystem.Substrate };

    expect(await service.exportAccountMnemonic(request)).toEqual({ seed: PHRASE });
    expect(opens(service.accountExportRawSeed(request).seed)).toBe(address);
    expect(await rawSeedAvailable(address, PASSWORD)).toBe(true);
    // The password is checked as the export checks it.
    expect(await rawSeedAvailable(address, 'Public wrong password')).toBe(false);
    expect(await rawSeedAvailable(address, '')).toBe(false);
  });

  it('checks an EVM wallet with the path Fearless creates EVM accounts with', async () => {
    const standard = await service.addAccount(`${PHRASE}/m/44'/60'/0'/0/0`, { name: 'EVM', ethereumAddress: '' }, WalletEcosystem.Evm, 'ethereum');
    const custom = await service.addAccount(`${PHRASE}/m/44'/60'/0'/0/1`, { name: 'EVM 1', ethereumAddress: '' }, WalletEcosystem.Evm, 'ethereum');

    expect(await service.exportAccountMnemonic({ address: standard, password: PASSWORD, walletEcosystem: WalletEcosystem.Evm }))
      .toEqual({ seed: PHRASE });
    expect(await service.exportAccountMnemonic({ address: custom, password: PASSWORD, walletEcosystem: WalletEcosystem.Evm }))
      .toEqual({ seed: PHRASE, restoresOtherAccount: true });
    // An EVM raw seed is the account's own private key.
    expect(service.accountExportRawSeed({ address: custom, password: PASSWORD, isEVM: true }).seed).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
