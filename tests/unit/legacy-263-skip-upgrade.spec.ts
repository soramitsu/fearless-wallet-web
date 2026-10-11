import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The upgrade of a real Fearless Wallet 2.6.3 profile (accounts with their own passwords, no master
// password) in which the user no longer knows one of the passwords. The account records are the ones the
// 2.6.3 build itself wrote to chrome.storage.local (tests/fixtures/upgrade/README.md); the migration
// screens, the router guard and the keyring service are the real ones.
//
// @subwallet/keyring needs Cardano WASM the unit environment cannot load. @polkadot/keyring pairs have
// the same encrypted JSON, decodePkcs8/toJson/lock behaviour and addresses, so the account cryptography
// below is real; only the ui-keyring bookkeeping is a stand-in (as in keyring-recovery.spec.ts).
const mocks = vi.hoisted(() => ({
  backend: undefined as unknown as Keyring,
  hash: '',
  master: '',
  stored: new Map<string, KeyringPair$Json>(),
  prompt: new Map<string, unknown>(),
  service: undefined as unknown as KeyringService,
  guard: undefined as unknown as (to: object, from: object, next: (...args: unknown[]) => void) => Promise<void>,
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  go: vi.fn(),
  notify: vi.fn(),
  download: vi.fn(),
  storageGet: vi.fn(),
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
  // A 2.6.3 profile has no master-password key yet, so creating the password re-encrypts nothing.
  changeMasterPassword: (next: string, old?: string) => {
    if (mocks.hash && old !== mocks.hash) throw new Error('Invalid master password');
    mocks.hash = next;
    mocks.master = next;
  },
  lockAll: () => {
    mocks.master = '';
    mocks.backend.getPairs().forEach((pair) => pair.lock());
  },
  accounts: { add: vi.fn() },
} }));
// AccountsStore.updateAndWait over the stored records.
vi.mock('@extension-base/stores/Accounts', () => ({ default: class {
  updateAndWait = async (
    key: string,
    transform: (current?: KeyringPair$Json) => KeyringPair$Json | undefined,
    publish?: (saved: KeyringPair$Json) => void
  ) => {
    const current = mocks.stored.get(key);
    const next = transform(current && structuredClone(current));
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
// The "Skip for now" choice, kept across a service worker restart like chrome.storage keeps it.
vi.mock('@extension-base/stores/LegacyPasswordPromptStore', () => ({ default: class {
  getAndWait = async (key: string) => mocks.prompt.get(key);
  setAndWait = async (key: string, value: unknown) => { mocks.prompt.set(key, value); };
  remove = (key: string) => { mocks.prompt.delete(key); };
} }));
vi.mock('@extension-base/services/keyring-service/TonKeyring', () => ({ TonKeyringService: class {} }));
vi.mock('@extension-base/services/keyring-service/LegacyNetworkEnrollment', () => ({ enrollLegacyAccountNetworks: vi.fn() }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@/extension/background/extension-base/src/background/handlers/utils', () => ({ isNativeEVMNetwork: () => false }));

// The popup's messages, answered by the real service. structuredClone stands for the extension port,
// which refuses anything that is not plain data ("Could not serialize message" after a 2.6.3 upgrade).
vi.mock('@/extension/messaging', () => ({
  isOnboardingRequired: async () => false,
  keyringIsLocked: async () => mocks.service.keyringIsLocked,
  hasMasterPassword: async () => mocks.service.hasMasterPassword,
  hasAccounts: async () => mocks.service.getAccounts().length > 0,
  isNeedMigration: () => mocks.service.isNeedMigration(),
  getAccessStatus: async () => structuredClone(await mocks.service.getAccessStatus()),
  getMigrationAccounts: async () => structuredClone(mocks.service.getMigrationAccounts()),
  migrateMasterPassword: (request: RequestMigratePassword) => mocks.service.keyringMigrateMasterPassword(request),
  deferLegacyPasswordMigration: () => mocks.service.deferLegacyPasswordMigration(),
  recoverAccountWithPassword: (request: RequestRecoverAccountWithPassword) => mocks.service.recoverAccountWithPassword(request),
  recoverAccountWithPhrase: (request: RequestRecoverAccountWithPhrase) => mocks.service.recoverAccountWithPhrase(request),
  migrateExportJSON: (address: string) => FWExtensionBase.prototype.migrateExportJSON.call({}, address),
  getUniversalWalletMigrationSnapshot: vi.fn(),
  isJsonValid: vi.fn(),
  jsonRestore: vi.fn(),
  updateCurrentAccount: vi.fn(),
}));
vi.mock('vue-router', () => ({
  createWebHashHistory: vi.fn(),
  createRouter: () => ({ beforeEach: (guard: typeof mocks.guard) => { mocks.guard = guard; }, back: vi.fn() }),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, back: mocks.back, go: mocks.go }),
}));
vi.mock('@/router/helpers', () => ({ updateTitle: vi.fn() }));
vi.mock('@/router/routes', () => ({
  default: [],
  Components: Object.fromEntries(
    ['Onboarding', 'MigrationDescription', 'MigrationAccounts', 'ChangePassword', 'Welcome', 'Unlock', 'ResetWallet',
      'Wallet', 'Settings', 'AccountAccessRecovery'].map((name) => [name, name])
  ),
}));
vi.mock('@/stores/accounts', () => ({
  useAccountsStore: () => ({ selectedWallet: {}, accounts: profile.wallets.map(({ address, name }) => ({ address, name })) }),
}));
vi.mock('@/helpers/files', () => ({ downloadJsonAccount: mocks.download }));
vi.mock('@/plugins/soramitsuUI', () => ({ useNotify: () => mocks.notify }));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string>) => (values ? `${key}:${JSON.stringify(values)}` : key),
  }),
}));

import FWExtensionBase from '@extension-base/background/handlers/ExtensionBase';
import { KeyringService } from '@extension-base/services/keyring-service';
import { accountStorageKey } from '@extension-base/services/keyring-service/AccountMetadata';
import { TonSeedVault } from '@extension-base/services/keyring-service/TonSeedVault';
import type {
  RequestMigratePassword,
  RequestRecoverAccountWithPassword,
  RequestRecoverAccountWithPhrase,
} from '@extension-base/background/types/types';
import type { KeyringPair, KeyringPair$Json } from '@polkadot/keyring/types';
import BackupWalletsList from '@/screens/addWallet/BackupWalletsList.vue';
import MigrationAccounts from '@/screens/addWallet/keyringMigration/MigrationAccounts.vue';
import AccountAccessRecovery from '@/screens/settings/AccountAccessRecovery.vue';
// chrome.storage.local as the 2.6.3 build left it, with the public test phrases and passwords it was given.
import profile from '../fixtures/upgrade/s1-2.6.3-per-account-passwords.json';

const [savings, forgotten, staking] = profile.wallets;
const MASTER = 'Master password created during the upgrade';
const payload = new TextEncoder().encode('Fearless 2.6.3 upgrade signing check');
// Every step is real scrypt (2.6.3 wrote N = 2^15), about 100 ms each on an idle machine and far more on a busy runner.
const SCRYPT_SUITE = { timeout: 240_000 };

const shippedRecords = (): Array<[string, KeyringPair$Json]> =>
  Object.entries(profile.storage as unknown as Record<string, KeyringPair$Json>)
    .filter(([key]) => key.startsWith('fw:account:'))
    .map(([key, json]) => [key.slice('fw:'.length), structuredClone(json)]);

const shipped = (address: string): KeyringPair$Json =>
  structuredClone(mocks.stored.get(accountStorageKey(mocks.backend.getPair(address) as never))!);
const record = (address: string) => mocks.stored.get(accountStorageKey(mocks.backend.getPair(address) as never))!;

function opensWith(json: KeyringPair$Json, password: string): KeyringPair {
  const pair = mocks.backend.createFromJson(json);
  pair.decodePkcs8(password);
  return pair;
}

// A service worker start: the keyring loads every stored record, locked, and nothing is remembered in memory.
function startWorker(): void {
  mocks.backend = new Keyring({ type: 'sr25519' });
  mocks.master = '';
  mocks.stored.forEach((json) => mocks.backend.addFromJson(structuredClone(json)));

  const service = Object.create(KeyringService.prototype) as KeyringService;
  const tonKeyring = { getAccounts: () => [], accountSubject: { value: {} } };
  Object.defineProperty(service, 'tonKeyring', {
    value: { ...tonKeyring, vault: new TonSeedVault({ ...tonKeyring, setAccounts: () => {} }) },
  });
  mocks.service = service;
}

async function navigate(name: string, from: { name?: string } = {}): Promise<unknown[]> {
  if (!mocks.guard) await import('@/router');

  const next = vi.fn();
  await mocks.guard({ name, fullPath: `/${name}` }, from, next);

  expect(next).toHaveBeenCalledOnce();

  return next.mock.calls[0];
}

const stubs = {
  AboveForm: { emits: ['closeHandler'], template: '<main><slot /></main>' },
  Scroll: { template: '<div><slot /></div>' },
  Loader: { template: '<span />' },
  FCorners: { template: '<div><slot /></div>' },
  Checkbox: { props: ['label'], template: '<span class="row-name">{{ label }}</span>' },
  ValidatedInput: {
    props: ['value', 'isError', 'errorDescriptions'],
    emits: ['change', 'pressEnter'],
    template:
      '<label><input :value="value" @input="$emit(\'change\', $event.target.value)" />' +
      '<span v-if="isError" class="input-error">{{ errorDescriptions }}</span></label>',
  },
  FButton: {
    props: ['text', 'disabled'],
    emits: ['click'],
    template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')">{{ text }}</button>',
  },
  NotificationPopup: {
    emits: ['handlerAccept', 'handlerClose'],
    template: '<aside><button type="button" data-testid="acceptBtn" @click="$emit(\'handlerAccept\')" /></aside>',
  },
};

async function openPasswordRows(): Promise<VueWrapper> {
  const wrapper = mount(MigrationAccounts, { global: { stubs, mocks: { $t: (key: string) => key } } });
  await flushPromises();
  return wrapper;
}

type Row = { address: string; name: string; isComplete: boolean; isError: boolean };
const rowsOf = (wrapper: VueWrapper) => wrapper.findComponent(BackupWalletsList).props('items') as Row[];
const rowOf = (wrapper: VueWrapper, address: string) => rowsOf(wrapper).find((row) => row.address === address)!;

// What the user does in a row: tick it, type the password, press Confirm.
async function enterPassword(wrapper: VueWrapper, address: string, password: string): Promise<void> {
  const index = rowsOf(wrapper).findIndex((row) => row.address === address);
  const list = wrapper.findComponent(BackupWalletsList);

  (list.vm as unknown as { onSelect: (value: boolean, index: number) => void }).onSelect(true, index);
  await flushPromises();

  const row = list.findAll('li')[index];
  await row.get('input').setValue(password);
  await row.get('.button__confirm').trigger('click');
  await vi.waitFor(() => expect(rowOf(wrapper, address).isComplete || rowOf(wrapper, address).isError).toBe(true), {
    timeout: 60_000,
  });
  await flushPromises();
}

async function openAccountAccess(address: string, mode?: string): Promise<VueWrapper> {
  const wrapper = mount(AccountAccessRecovery, { props: { address, mode }, global: { stubs } });
  await flushPromises();
  return wrapper;
}

const accessRow = (wrapper: VueWrapper, address: string) =>
  wrapper.get(`[data-testid="accessRow"][data-address="${address}"]`);

async function unlockWith(wrapper: VueWrapper, address: string, secret: string, derivationPath?: string) {
  const row = accessRow(wrapper, address);

  if (derivationPath !== undefined) await row.get('[data-testid="accessDerivationPath"] input').setValue(derivationPath);
  await row.get('[data-testid="accessSecret"] input').setValue(secret);
  await row.get('[data-testid="accessUnlock"]').trigger('click');
  await vi.waitFor(
    () => {
      const still = wrapper.find(`[data-testid="accessRow"][data-address="${address}"]`);
      expect(!still.exists() || still.find('.input-error').exists()).toBe(true);
    },
    { timeout: 60_000 }
  );
  await flushPromises();
}

beforeAll(async () => {
  await cryptoWaitReady();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hash = '';
  mocks.prompt.clear();
  mocks.stored.clear();
  shippedRecords().forEach(([key, json]) => mocks.stored.set(key, json));
  // What FWExtensionBase.migrateExportJSON reads: the stored records as they are right now.
  mocks.storageGet.mockImplementation(async () =>
    Object.fromEntries([...mocks.stored].map(([key, json]) => [`fw:${key}`, structuredClone(json)]))
  );
  vi.stubGlobal('chrome', { storage: { local: { get: mocks.storageGet } } });
  startWorker();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('upgrading a 2.6.3 wallet with one forgotten account password', SCRYPT_SUITE, () => {
  it('loads the profile 2.6.3 wrote: five keys on three passwords, no master password', async () => {
    expect(profile.provenance.syntheticSecretsOnly).toBe(true);
    expect(mocks.service.hasMasterPassword).toBe(false);
    // In the order the keyring loads them (by storage key), each wallet followed by its own Ethereum account.
    expect(mocks.service.getMigrationAccounts().map(({ address, name, linkedParentName }) => [address, name, linkedParentName])).toEqual([
      [staking.address, 'Staking', undefined],
      [forgotten.address, 'Forgotten', undefined],
      [forgotten.ethereumAddress, 'Forgotten', 'Forgotten'],
      [savings.address, 'Savings', undefined],
      [savings.ethereumAddress, 'Savings', 'Savings'],
    ]);
    // The prompt is due and cannot be skipped yet: without a master password nothing opens the wallet.
    expect(await mocks.service.getAccessStatus()).toMatchObject({ mustCreateMasterPassword: true, promptPending: true, deferred: false });
    expect(await mocks.service.deferLegacyPasswordMigration()).toBe(false);
    expect(await navigate('Wallet')).toEqual([{ name: 'MigrationDescription' }]);
  });

  it('reaches the wallet with the remembered account working and the others untouched', async () => {
    const before = new Map(shippedRecords());

    // Step 1 of the prompt: the master password.
    expect(await navigate('ChangePassword', { name: 'MigrationDescription' })).toEqual([]);
    expect(await mocks.service.changeMasterPassword({ oldPassword: '', newPassword: MASTER })).toBe(true);
    expect(await navigate('MigrationAccounts', { name: 'ChangePassword' })).toEqual([]);

    // Step 2: one row per key, the Ethereum accounts under their wallet's name.
    const wrapper = await openPasswordRows();
    expect(rowsOf(wrapper).map(({ address, name }) => [address, name])).toEqual([
      [staking.address, 'Staking'],
      [forgotten.address, 'Forgotten'],
      [forgotten.ethereumAddress, 'accountAccess.evmAccountOf:{"name":"Forgotten"}'],
      [savings.address, 'Savings'],
      [savings.ethereumAddress, 'accountAccess.evmAccountOf:{"name":"Savings"}'],
    ]);

    // The remembered password opens the account and its Ethereum account.
    await enterPassword(wrapper, savings.address, savings.password);
    expect(rowsOf(wrapper).filter(({ isComplete }) => isComplete).map(({ address }) => address)).toEqual([
      savings.address,
      savings.ethereumAddress,
    ]);

    // A guess at the forgotten one changes nothing.
    await enterPassword(wrapper, forgotten.address, 'not the password it had');
    expect(rowOf(wrapper, forgotten.address)).toMatchObject({ isComplete: false, isError: true });
    expect(wrapper.get('[data-testid="migrationContinue"]').attributes('disabled')).toBeDefined();

    // 3.0.5 deleted skipped accounts; 4.2.0 before this change had no way on. Skip for now only postpones.
    await wrapper.get('[data-testid="migrationSkip"]').trigger('click');
    await wrapper.get('[data-testid="acceptBtn"]').trigger('click');
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Wallet' });
    expect(mocks.notify).not.toHaveBeenCalled();
    wrapper.unmount();

    // The wallet opens, and so does everything behind it.
    for (const name of ['Wallet', 'SendForm', 'ReceiveForm', 'Settings', 'AccountAccessRecovery']) {
      expect(await navigate(name), name).toEqual([]);
    }

    // The remembered account now opens with the master password and signs with the key 2.6.3 created.
    expect(mocks.service.unlockPair(savings.address)).toBe(true);
    const signer = mocks.backend.getPair(savings.address);
    expect(signer.verify(payload, signer.sign(payload), new Keyring({ type: 'sr25519' }).addFromUri(savings.mnemonic).publicKey)).toBe(true);
    expect(opensWith(record(savings.ethereumAddress), MASTER).address).toBe(savings.ethereumAddress);
    expect(record(savings.address).meta).toMatchObject({ name: 'Savings', isMasterPassword: true, whenCreated: before.get(accountStorageKey(signer as never))!.meta.whenCreated });

    // Every key that was skipped is still in storage byte for byte, and still opens with its 2.6.3 password.
    for (const address of [forgotten.address, forgotten.ethereumAddress, staking.address]) {
      const key = accountStorageKey(mocks.backend.getPair(address) as never);

      expect(mocks.stored.get(key), address).toEqual(before.get(key));
    }
    expect(mocks.stored.size).toBe(before.size);
    expect(opensWith(shipped(forgotten.address), forgotten.password).address).toBe(forgotten.address);
    expect(opensWith(shipped(staking.address), staking.password).address).toBe(staking.address);

    // They are listed, not hidden: sending from one says which password it waits for.
    const status = await mocks.service.getAccessStatus();
    expect(status).toMatchObject({ promptPending: false, deferred: true, mustCreateMasterPassword: false });
    expect(status.issues.map(({ address, kind }) => [address, kind])).toEqual([
      [forgotten.address, 'legacy_account_password'],
      [forgotten.ethereumAddress, 'legacy_account_password'],
      [staking.address, 'legacy_account_password'],
    ]);
    expect(() => mocks.service.unlockPair(forgotten.address)).toThrow('legacy_password_required');
    expect(() => mocks.service.exportMnemonic({ address: staking.address })).toThrow('legacy_password_required');
  });

  it('stays skipped across a restart and unlocks the skipped accounts later, by password or recovery phrase', async () => {
    expect(await mocks.service.changeMasterPassword({ oldPassword: '', newPassword: MASTER })).toBe(true);
    expect(await mocks.service.deferLegacyPasswordMigration()).toBe(true);

    // The service worker stops and starts; the popup opens locked, then unlocked.
    startWorker();
    expect(await navigate('Wallet')).toEqual([{ name: 'Unlock', query: { redirect: '/Wallet' } }]);
    expect(mocks.service.unlockKeyring({ password: MASTER })).toBe(true);
    expect(await navigate('Wallet')).toEqual([]);
    // The password rows stay reachable for as long as an account waits.
    expect(await navigate('MigrationAccounts')).toEqual([]);

    // The encrypted backup offered in Account access is the record 2.6.3 wrote.
    const everyAccount = await openAccountAccess('');
    const forgottenRecord = shipped(forgotten.address);
    await accessRow(everyAccount, forgotten.address).get('[data-testid="accessDownloadBackup"]').trigger('click');
    await flushPromises();
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith(forgotten.address, forgottenRecord);
    expect(record(forgotten.address)).toEqual(forgottenRecord);
    everyAccount.unmount();

    // An account created with a derivation path: the phrase alone gives another address and writes nothing.
    const stakingRecord = shipped(staking.address);
    const stakingAccess = await openAccountAccess(staking.address, 'phrase');
    await unlockWith(stakingAccess, staking.address, staking.mnemonic);
    expect(accessRow(stakingAccess, staking.address).get('.input-error').text()).toBe('accountAccess.phraseMismatch');
    expect(record(staking.address)).toEqual(stakingRecord);
    // With its path the phrase reproduces the address, and the key is stored under the master password.
    await unlockWith(stakingAccess, staking.address, staking.mnemonic, staking.derivationPath);
    expect(stakingAccess.find(`[data-testid="accessRow"][data-address="${staking.address}"]`).exists()).toBe(false);
    expect(opensWith(record(staking.address), MASTER).address).toBe(staking.address);
    expect(() => opensWith(record(staking.address), staking.password)).toThrow();
    stakingAccess.unmount();

    // The forgotten wallet: its phrase unlocks the account, and the same phrase its Ethereum account.
    const forgottenAccess = await openAccountAccess(forgotten.address, 'phrase');
    await unlockWith(forgottenAccess, forgotten.address, forgotten.mnemonic);
    await unlockWith(forgottenAccess, forgotten.ethereumAddress, forgotten.mnemonic);
    forgottenAccess.unmount();
    expect(opensWith(record(forgotten.address), MASTER).address).toBe(forgotten.address);
    expect(opensWith(record(forgotten.ethereumAddress), MASTER).address).toBe(forgotten.ethereumAddress);
    expect(mocks.service.unlockPair(forgotten.address)).toBe(true);

    // The remembered wallet, later, with the password it had.
    const savingsAccess = await openAccountAccess(savings.address);
    await unlockWith(savingsAccess, savings.address, 'a wrong guess');
    expect(accessRow(savingsAccess, savings.address).get('.input-error').text()).toBe('accountAccess.wrongPassword');
    await unlockWith(savingsAccess, savings.address, savings.password);
    savingsAccess.unmount();

    // Nothing waits any more: no account was lost on the way, and the password rows close for good.
    expect((await mocks.service.getAccessStatus()).issues).toEqual([]);
    expect(mocks.service.getAccounts().map(({ address }) => address).sort()).toEqual(
      [savings.address, savings.ethereumAddress, forgotten.address, forgotten.ethereumAddress, staking.address].sort()
    );
    expect(await navigate('MigrationAccounts')).toEqual([{ name: 'Welcome' }]);
    startWorker();
    expect(mocks.service.unlockKeyring({ password: MASTER })).toBe(true);
    for (const { address } of profile.wallets) expect(mocks.service.unlockPair(address), address).toBe(true);
  });
});
