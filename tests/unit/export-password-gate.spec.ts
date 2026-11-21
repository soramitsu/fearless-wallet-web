// An unlocked session is not a password: every export a wallet page can ask for needs the password typed for it,
// and no message hands the master password to a page. Harness as in derived-wallet-export.spec.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { keyring } from '@subwallet/ui-keyring';
import { BehaviorSubject } from 'rxjs';
import { decryptKeystoreJsonSync } from 'ethers';

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

const PASSWORD = 'Public export gate fixture password';
const PHRASE = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';
let service: KeyringService;
// Every case encrypts with real scrypt (and the EVM keystore with ethers' N = 2^17): bounded like the other scrypt suites.
const SCRYPT_SUITE = { timeout: 120_000 };

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

// What a wallet page's port delivers: the request after JSON transport, so a left-out password is absent.
function send(type: string, request: unknown) {
  const extension = Object.create(Extension.prototype) as Extension;
  Object.assign(extension, { state: { keyringService: service } });
  return (extension.handle as (id: string, t: string, r: unknown) => Promise<unknown>)(
    'public-gate', type, JSON.parse(JSON.stringify(request ?? null)));
}

const substrate = () => service.addAccount(PHRASE, { name: 'Root', ethereumAddress: '' }, WalletEcosystem.Substrate, 'sr25519');
const evm = () => service.addAccount(`${PHRASE}/m/44'/60'/0'/0/0`, { name: 'EVM', ethereumAddress: '' }, WalletEcosystem.Evm, 'ethereum');
const refusals = (password?: string) => [
  ['left out', undefined], ['empty', ''], ['wrong', 'Public wrong password'], ['the master password with a space', `${PASSWORD} `],
].filter(([, value]) => value !== password) as [string, string | undefined][];

describe('no message hands the master password to a wallet page', SCRYPT_SUITE, () => {
  it('does not know pri(keyring.getPassword)', async () => {
    await expect(send('pri(keyring.getPassword)', null)).rejects.toThrow('Unable to handle message');
  });
});

describe('recovery phrase export', SCRYPT_SUITE, () => {
  it.each(refusals())('refuses a password that is %s', async (_label, password) => {
    const address = await substrate();
    await expect(send('pri(keyring.export.mnemonic)', { address, password, walletEcosystem: WalletEcosystem.Substrate }))
      .rejects.toThrow('wrong_password');
  });

  it('exports the phrase with the wallet password', async () => {
    const address = await substrate();
    expect(await send('pri(keyring.export.mnemonic)', { address, password: PASSWORD, walletEcosystem: WalletEcosystem.Substrate }))
      .toEqual({ seed: PHRASE });
  });

  it('refuses the right password once the session is locked', async () => {
    const address = await substrate();
    Object.assign(service, { password: '' });
    await expect(send('pri(keyring.export.mnemonic)', { address, password: PASSWORD, walletEcosystem: WalletEcosystem.Substrate }))
      .rejects.toThrow('keyring_locked');
    await expect(send('pri(keyring.export.rowSeed)', { address, password: PASSWORD })).rejects.toThrow('keyring_locked');
    await expect(send('pri(accounts.export.json)', { address, password: PASSWORD })).rejects.toThrow('keyring_locked');
  });

  it('leaves the background signers their in-memory phrase', async () => {
    const address = await substrate();
    expect(service.exportMnemonic({ address, walletEcosystem: WalletEcosystem.Substrate })).toEqual({ seed: PHRASE });
  });
});

describe('raw seed and private key export', SCRYPT_SUITE, () => {
  it.each(refusals())('refuses an EVM private key for a password that is %s', async (_label, password) => {
    const address = await evm();
    await expect(send('pri(keyring.export.rowSeed)', { address, password, isEVM: true })).rejects.toThrow('wrong_password');
  });

  it.each(refusals())('refuses a Substrate raw seed for a password that is %s', async (_label, password) => {
    const address = await substrate();
    await expect(send('pri(keyring.export.rowSeed)', { address, password })).rejects.toThrow('wrong_password');
  });

  it('exports the EVM private key and the raw seed with the wallet password', async () => {
    const address = await evm();
    const { seed } = await send('pri(keyring.export.rowSeed)', { address, password: PASSWORD, isEVM: true }) as { seed: string };
    expect(keyring.createFromUri(seed, {}, 'ethereum').address.toLowerCase()).toBe(address.toLowerCase());
    const root = await substrate();
    expect(await send('pri(keyring.export.rowSeed)', { address: root, password: PASSWORD }))
      .toMatchObject({ seed: expect.stringMatching(/^0x[0-9a-f]{64}$/) });
  });
});

describe('JSON export', SCRYPT_SUITE, () => {
  it.each(refusals())('refuses an EVM keystore for a password that is %s', async (_label, password) => {
    const address = await evm();
    await expect(send('pri(accounts.export.json)', { address, password, network: 'Ethereum' })).rejects.toThrow('wrong_password');
  });

  it('never re-encrypts a key under a password the page picked', async () => {
    const address = await evm();
    await expect(send('pri(accounts.export.json)', { address, password: 'Public page-picked password', network: 'Ethereum' }))
      .rejects.toThrow('wrong_password');
  });

  it('writes the EVM keystore and the Substrate JSON under the wallet password', async () => {
    const address = await evm();
    const { json } = await send('pri(accounts.export.json)', { address, password: PASSWORD, network: 'Ethereum' }) as { json: unknown };
    expect(decryptKeystoreJsonSync(JSON.stringify(json), PASSWORD).address.toLowerCase()).toBe(address.toLowerCase());
    const root = await substrate();
    const backup = await send('pri(accounts.export.json)', { address: root, password: PASSWORD }) as { json: Parameters<typeof keyring.createFromJson>[0] };
    const reopened = keyring.createFromJson(backup.json);
    reopened.decodePkcs8(PASSWORD);
    expect(reopened.address).toBe(root);
  });
});

describe('Google Drive backup of a wallet being created', SCRYPT_SUITE, () => {
  it('returns the wallet JSON under the master password without the page sending or receiving it', async () => {
    const address = await substrate();
    const { json } = await send('pri(accounts.export.backup)', address) as { json: Parameters<typeof keyring.createFromJson>[0] };
    const reopened = keyring.createFromJson(json);
    expect(() => reopened.decodePkcs8('Public wrong password')).toThrow();
    reopened.decodePkcs8(PASSWORD);
    expect(reopened.address).toBe(address);
    expect(JSON.stringify(json)).not.toContain(PASSWORD);
  });

  it('refuses while the wallet is locked', async () => {
    const address = await substrate();
    Object.assign(service, { password: '' });
    await expect(send('pri(accounts.export.backup)', address)).rejects.toThrow('Wallet locked');
  });
});

describe('a new master password', SCRYPT_SUITE, () => {
  it('is refused by the background when it is too easy to guess, whatever page sent it', async () => {
    for (const weak of ['', 'short', 'password', '12345678']) {
      expect(await service.changeMasterPassword({ oldPassword: PASSWORD, newPassword: weak }), weak).toBe(false);
    }
    expect(service.getPassword()).toBe(PASSWORD);
  });
});
