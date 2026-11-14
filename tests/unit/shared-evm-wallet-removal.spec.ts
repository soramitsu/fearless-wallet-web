import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { keyring } from '@subwallet/ui-keyring';
import { BehaviorSubject } from 'rxjs';

const fixture = vi.hoisted(() => ({
  data: {} as Record<string, { address: string; accounts: Record<string, unknown> }>,
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
import State from '@extension-base/background/handlers/State';
import Extension from '@extension-base/background/handlers/Extension';
import { WalletEcosystem } from '@/interfaces';

const PASSWORD = 'Public shared EVM fixture password';
const PHRASE = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';
const EVM_PATH = "/m/44'/60'/0'/0/0";
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

// As AddWallet.saveKeypairFromSeed: the EVM key first, then the Substrate key naming it. The second
// import of the same phrase (another Substrate path) gets the first wallet's EVM record back.
async function wallet(name: string, path = '') {
  const ethereumAddress = await service.addAccount(`${PHRASE}${EVM_PATH}`, { name, ethereumAddress: '' }, WalletEcosystem.Substrate, 'ethereum');
  const address = await service.addAccount(`${PHRASE}${path}`, { name, ethereumAddress }, WalletEcosystem.Substrate, 'sr25519');
  return { address, ethereumAddress };
}
const archives = () => Object.entries(fixture.data).filter(([key]) => key.startsWith('fw:deletedWallet:'));
const evmRecordKey = (address: string) => `fw:account:${address.toLowerCase()}`;

function handler() {
  const state = Object.create(State.prototype) as State;
  const urls = { 'public.example': { authorizedAccounts: [] as string[], evmAuthorizedAccount: '' } };
  Object.assign(state, {
    keyringService: service,
    requestService: { mutateAuthorizations: async (mutate: (auth: typeof urls) => void) => { mutate(urls); return urls; } },
    walletConnectService: { removeSessions: vi.fn().mockResolvedValue(undefined) },
    walletConnectDappService: { disconnect: vi.fn().mockResolvedValue(undefined) },
    networkService: { selectedNetworks: {} }, cleanupDeletedAccount: vi.fn(),
  });
  const extension = Object.create(Extension.prototype) as Extension;
  Object.assign(extension, { state });
  return { state, extension, urls };
}

describe('deleting one of two wallets that link the same EVM account', { timeout: 60_000 }, () => {
  it('keeps the EVM key for the remaining wallet and removes it with the last wallet that links it', async () => {
    const a = await wallet('A');
    const b = await wallet('B', '//staking');
    expect(b.ethereumAddress).toBe(a.ethereumAddress);
    const evm = a.ethereumAddress;

    await service.forgetAccount(b.address);

    expect(service.getPair(b.address)).toBeNull();
    expect(service.getPair(a.address)!.meta.ethereumAddress).toBe(evm);
    expect(service.getPair(evm)).toBeTruthy();
    expect(fixture.data[evmRecordKey(evm)]).toBeDefined();
    expect(service.accountExportPrivateKey({ address: evm }).privateKey).toMatch(/^0x[0-9a-f]{64}$/);
    // B's recovery copy holds B's key; the EVM key stays live for A.
    expect(archives()).toHaveLength(1);
    expect(Object.keys(archives()[0][1].accounts)).toEqual([expect.not.stringMatching(evm.toLowerCase())]);

    await service.forgetAccount(a.address);

    expect(service.getPair(evm)).toBeNull();
    expect(fixture.data[evmRecordKey(evm)]).toBeUndefined();
    const copyOfA = archives().find(([, value]) => value.address === a.address)![1];
    expect(copyOfA.accounts[`account:${evm.toLowerCase()}`]).toBeDefined();
  });

  it('restores the deleted wallet next to the remaining one, with its EVM account', async () => {
    const a = await wallet('A');
    const b = await wallet('B', '//staking');
    await service.forgetAccount(b.address);
    const [deleted] = await service.getDeletedWallets();

    expect(await service.restoreDeletedWallet(deleted.id)).toMatchObject({ ok: true, address: b.address });
    expect(service.getPair(b.address)!.meta.ethereumAddress).toBe(a.ethereumAddress);
    expect(service.getPair(a.address)!.meta.ethereumAddress).toBe(a.ethereumAddress);
    expect(service.getPair(a.ethereumAddress)).toBeTruthy();
  });

  it('keeps the EVM site grant and WalletConnect sessions while another wallet links the account', async () => {
    const a = await wallet('A');
    const b = await wallet('B', '//staking');
    const { state, extension, urls } = handler();
    urls['public.example'].evmAuthorizedAccount = a.ethereumAddress;

    expect(await extension.accountsForget({ address: b.address, type: 'native' })).toBe(true);
    expect(urls['public.example'].evmAuthorizedAccount).toBe(a.ethereumAddress);
    expect(state.walletConnectService.removeSessions).toHaveBeenCalledWith(b.address, undefined);

    expect(await extension.accountsForget({ address: a.address, type: 'native' })).toBe(true);
    expect(urls['public.example'].evmAuthorizedAccount).toBe('');
    expect(state.walletConnectService.removeSessions).toHaveBeenLastCalledWith(a.address, a.ethereumAddress);
    expect(service.getPair(a.ethereumAddress)).toBeNull();
  });
});
