import { flushPromises, mount, shallowMount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FilesState } from '@/interfaces';
import english from '@/locales/en/translation.json';

const mocks = vi.hoisted(() => ({
  migrate: vi.fn(),
  list: vi.fn(),
  forget: vi.fn(),
  hasMasterPassword: vi.fn(),
  defer: vi.fn(),
  exportJson: vi.fn(),
  download: vi.fn(),
  notify: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  validateJson: vi.fn(),
  restoreJson: vi.fn(),
  selectAccount: vi.fn(),
}));
vi.mock('@/extension/messaging', () => ({
  migrateMasterPassword: mocks.migrate, getMigrationAccounts: mocks.list, forgetAccount: mocks.forget,
  hasMasterPassword: mocks.hasMasterPassword, deferLegacyPasswordMigration: mocks.defer, migrateExportJSON: mocks.exportJson,
  isJsonValid: mocks.validateJson, jsonRestore: mocks.restoreJson, updateCurrentAccount: mocks.selectAccount,
}));
vi.mock('@/helpers/files', () => ({ downloadJsonAccount: mocks.download }));
vi.mock('@/plugins/soramitsuUI', () => ({ useNotify: () => mocks.notify }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ selectedWallet: {} }) }));
vi.mock('vue-router', () => ({ useRouter: () => ({ back: mocks.back, push: mocks.push, replace: mocks.replace }) }));
vi.mock('@/router/routes', () => ({
  Components: Object.fromEntries(
    ['Wallet', 'MigrationDescription', 'AccountAccessRecovery', 'ResetWallet', 'ChangePassword', 'MigrationAccounts'].map((name) => [name, name])
  ),
}));
vi.mock('@/helpers', () => ({ cut: (address: string) => address }));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string>) => (values ? `${key}:${JSON.stringify(values)}` : key),
  }),
}));

import BackupWalletsList from '@/screens/addWallet/BackupWalletsList.vue';
import MigrationAccounts from '@/screens/addWallet/keyringMigration/MigrationAccounts.vue';
import MigrationDescription from '@/screens/addWallet/keyringMigration/MigrationDescription.vue';

const PARENT = '5EPCUjPxiHAcNooYipQFWr9NmmXJKpNG5RhcntXwbtUySrgH';
const CHILD = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const FORGOTTEN = '5EHgWw2Af1pnoc7f1A8bfmM97W3DAYW8xr82RfhLL9oAabAe';

const parent = { address: PARENT, name: 'Savings', type: 'sr25519', walletEcosystem: 'substrate', isEthereum: false, ethereumAddress: CHILD };
const child = { address: CHILD, name: 'Savings', type: 'ethereum', walletEcosystem: 'evm', isEthereum: true, linkedParentAddress: PARENT, linkedParentName: 'Savings' };
const forgotten = { address: FORGOTTEN, name: 'Forgotten', type: 'sr25519', walletEcosystem: 'substrate', isEthereum: false };

const FButton = {
  props: ['text', 'disabled'],
  emits: ['click'],
  template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')">{{ text }}</button>',
};
const global = {
  mocks: { $t: (key: string) => key },
  stubs: {
    AboveForm: { template: '<main><slot /></main>' },
    Scroll: { template: '<div><slot /></div>' },
    FCorners: { template: '<div><slot /></div>' },
    Checkbox: { props: ['label', 'value'], template: '<span class="row-name">{{ label }}</span>' },
    ValidatedInput: { template: '<input />' },
    FButton,
    NotificationPopup: {
      props: ['headers', 'acceptButtonText'],
      emits: ['handlerAccept', 'handlerClose'],
      template:
        '<aside data-testid="skipPopup"><p>{{ headers.text }}</p><p>{{ headers.subtext }}</p>' +
        '<button type="button" data-testid="acceptBtn" @click="$emit(\'handlerAccept\')">{{ acceptButtonText }}</button>' +
        '<button type="button" data-testid="closeBtn" @click="$emit(\'handlerClose\')" /></aside>',
    },
  },
};

async function openAccounts(): Promise<VueWrapper> {
  const wrapper = mount(MigrationAccounts, { global });
  await flushPromises();
  return wrapper;
}

const rows = (wrapper: VueWrapper) => wrapper.findComponent(BackupWalletsList);
const items = (wrapper: VueWrapper) => rows(wrapper).props('items') as FilesState[];

// Ticking a row shows its password field and what else the row offers.
async function openRow(wrapper: VueWrapper, index: number) {
  (rows(wrapper).vm as unknown as { onSelect: (value: boolean, index: number) => void }).onSelect(true, index);
  await flushPromises();
}

const englishMessage = (key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], english);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.migrate.mockResolvedValue(true);
  mocks.hasMasterPassword.mockResolvedValue(true);
  mocks.defer.mockResolvedValue(true);
  mocks.list.mockResolvedValue([{ address: 'legacy-fixture', name: 'Legacy wallet', type: 'sr25519', walletEcosystem: 'substrate', isEthereum: false }]);
  mocks.validateJson.mockResolvedValue({ value: true });
  mocks.restoreJson.mockResolvedValue('restored-fixture');
  mocks.selectAccount.mockResolvedValue(undefined);
});

describe('per-account request ownership', () => {
  it('prevents duplicate requests before parent props update and follows the same account after rows reorder', async () => {
    let finish!: (value: boolean) => void;
    mocks.migrate.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
    const first = { address: PARENT, password: 'public-fixture-password', active: true };
    const second = { address: CHILD, password: 'different-fixture-password', active: true };
    const wrapper = shallowMount(BackupWalletsList, { props: { items: [first, second] }, global });
    const request = wrapper.vm.migrateAccounts(0);
    await wrapper.vm.migrateAccounts(0);
    expect(mocks.migrate).toHaveBeenCalledOnce();
    await wrapper.setProps({ items: [second, first] });
    finish(true);
    await request;
    expect(wrapper.emitted('setItemValue')?.at(-1)).toEqual([1, { isLoading: false, isError: false, isComplete: true }]);
    wrapper.unmount();
  });

  it('never marks a replacement row complete and emits no late updates after unmount', async () => {
    let finish!: (value: boolean) => void;
    mocks.migrate.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
    const updates = vi.fn();
    const wrapper = shallowMount(BackupWalletsList, { props: { items: [{ address: PARENT, password: 'fixture' }] }, attrs: { onSetItemValue: updates }, global });
    const request = wrapper.vm.migrateAccounts(0);
    await wrapper.setProps({ items: [{ address: CHILD, password: 'fixture' }] });
    finish(true);
    await request;
    expect(wrapper.emitted('setItemValue')).toHaveLength(1);
    const later = wrapper.vm.migrateAccounts(0);
    wrapper.unmount();
    finish(true);
    await later;
    expect(updates).toHaveBeenCalledTimes(2);
  });

  it('releases an interrupted Google import and marks completion only after restore and selection', async () => {
    const json = { address: PARENT } as never;
    const wrapper = shallowMount(BackupWalletsList, { props: { isGoogle: true, items: [{ address: PARENT, password: 'fixture', json }] }, global });
    mocks.validateJson.mockRejectedValueOnce(new Error('worker unavailable'));
    await wrapper.vm.importFromGoogle(0);
    expect(wrapper.emitted('setItemValue')?.at(-1)).toEqual([0, { isLoading: false, isError: true, isComplete: false }]);
    let restore!: (value: string) => void;
    mocks.restoreJson.mockReturnValueOnce(new Promise<string>((resolve) => { restore = resolve; }));
    const request = wrapper.vm.importFromGoogle(0);
    await flushPromises();
    expect(wrapper.emitted('setItemValue')?.some(([, fields]) => (fields as { isComplete?: boolean }).isComplete)).toBe(false);
    restore(PARENT);
    await request;
    expect(mocks.selectAccount).toHaveBeenCalledExactlyOnceWith(PARENT);
    expect(wrapper.emitted('setItemValue')?.at(-1)).toEqual([0, { isLoading: false, isError: false, isComplete: true }]);
    wrapper.unmount();
  });

  it('does not restore keys after leaving while Google validation is pending', async () => {
    let validate!: (value: { value: boolean }) => void;
    mocks.validateJson.mockReturnValueOnce(new Promise<{ value: boolean }>((resolve) => { validate = resolve; }));
    const wrapper = shallowMount(BackupWalletsList, { props: { isGoogle: true, items: [{ address: PARENT, password: 'fixture', json: {} as never }] }, global });
    const request = wrapper.vm.importFromGoogle(0);
    wrapper.unmount();
    validate({ value: true });
    await request;
    expect(mocks.restoreJson).not.toHaveBeenCalled();
    expect(mocks.selectAccount).not.toHaveBeenCalled();
  });

  it('does not mark an import complete or switch accounts when restore returns no account', async () => {
    mocks.restoreJson.mockResolvedValueOnce('');
    const wrapper = shallowMount(BackupWalletsList, { props: { isGoogle: true, items: [{ address: PARENT, password: 'fixture', json: {} as never }] }, global });
    await wrapper.vm.importFromGoogle(0);
    expect(mocks.selectAccount).not.toHaveBeenCalled();
    expect(wrapper.emitted('setItemValue')?.at(-1)).toEqual([0, { isLoading: false, isError: true, isComplete: false }]);
    wrapper.unmount();
  });
});

describe('legacy account upgrade recovery', () => {
  it('does not load or enable account operations until the password-state request succeeds', async () => {
    mocks.hasMasterPassword.mockRejectedValueOnce(new Error('worker unavailable'));
    const wrapper = await openAccounts();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="migrationSkip"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="migrationContinue"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[data-testid="migrationLoadFailed"] button').trigger('click');
    await flushPromises();
    expect(mocks.hasMasterPassword).toHaveBeenCalledTimes(2);
    expect(mocks.list).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('ignores late password state after leaving the account migration screen', async () => {
    let finish!: (value: boolean) => void;
    mocks.hasMasterPassword.mockReturnValueOnce(new Promise<boolean>((resolve) => { finish = resolve; }));
    const wrapper = mount(MigrationAccounts, { global });
    wrapper.unmount();
    finish(false);
    await flushPromises();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('retains entered credentials and allows retry after a worker/storage failure', async () => {
    mocks.migrate.mockRejectedValueOnce(new Error('Worker interrupted'));
    const items = [{ address: 'legacy-fixture', password: 'fixture-password', active: true, isComplete: false }];
    const wrapper = shallowMount(BackupWalletsList, { props: { items }, global });
    await wrapper.vm.migrateAccounts(0);
    expect(wrapper.emitted('setItemValue')?.at(-1)).toEqual([0, { isLoading: false, isError: true, isComplete: false }]);
    expect(items[0].password).toBe('fixture-password');
    await wrapper.vm.migrateAccounts(0);
    expect(wrapper.emitted('setItemValue')?.at(-1)).toEqual([0, { isLoading: false, isError: false, isComplete: true }]);
    expect(mocks.forget).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('keeps Continue closed until every account is upgraded, and offers Skip for now next to it', async () => {
    const wrapper = await openAccounts();
    const [skip, proceed] = wrapper.findAll('.controls button');

    expect(wrapper.findAll('.controls button')).toHaveLength(2);
    expect(skip.text()).toBe('migration.skipForNow');
    expect(skip.attributes('disabled')).toBeUndefined();
    expect(proceed.text()).toBe('common.continue');
    expect(proceed.attributes('disabled')).toBeDefined();
    expect(rows(wrapper).props('descriptionKey')).toBe('migration.enterPassRow');
    expect(mocks.forget).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  // Parent migrated, its EVM account still on its own 2.6.3 password: the router keeps this screen open for it
  // (legacy-upgrade-navigation.spec.ts), and the row is listed and migrated on its own.
  it('lists and migrates an EVM account whose parent was already migrated', async () => {
    mocks.list.mockResolvedValue([{ ...child, name: '', linkedParentName: 'Polkadot' }]);
    const wrapper = await openAccounts();
    expect(items(wrapper).map(({ address }) => address)).toEqual([CHILD]);
    // The account's own Ethereum account has no name; it is listed under its parent's.
    expect(items(wrapper)[0].name).toBe('accountAccess.evmAccountOf:{"name":"Polkadot"}');

    const list = shallowMount(BackupWalletsList, { props: { items: [{ ...items(wrapper)[0], password: 'child json password' }] }, global });
    await list.vm.migrateAccounts(0);
    expect(mocks.migrate).toHaveBeenCalledExactlyOnceWith({ address: CHILD, password: 'child json password' });
    expect(list.emitted('setItemValue')?.at(-1)).toEqual([0, { isLoading: false, isError: false, isComplete: true }]);
    expect(mocks.forget).not.toHaveBeenCalled();
    list.unmount();
    wrapper.unmount();
  });

  it('offers retry after inventory failure rather than treating the wallet store as empty', async () => {
    mocks.list.mockRejectedValueOnce(new Error('Storage not ready'));
    const wrapper = await openAccounts();
    const alert = wrapper.get('[role="alert"]');

    // A sentence and a button in the reader's language, not a raw key such as "common.retry".
    expect(alert.text()).toContain('migration.loadFailed');
    expect(alert.get('button').text()).toBe('ux.retry');
    expect(typeof englishMessage('ux.retry')).toBe('string');
    expect(typeof englishMessage('migration.loadFailed')).toBe('string');
    expect(englishMessage('common.retry')).toBeUndefined();
    expect(wrapper.get('[data-testid="migrationContinue"]').attributes('disabled')).toBeDefined();
    await alert.get('button').trigger('click');
    await flushPromises();
    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(mocks.forget).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe('Skip for now on the per-account password screen', () => {
  beforeEach(() => {
    mocks.list.mockResolvedValue([parent, child, forgotten]);
  });

  it('prevents competing actions while Skip saves and ignores completion after leaving', async () => {
    let finish!: (value: boolean) => void;
    mocks.defer.mockReturnValueOnce(new Promise<boolean>((resolve) => { finish = resolve; }));
    const wrapper = await openAccounts();
    await openRow(wrapper, 0);
    await wrapper.get('[data-testid="migrationSkip"]').trigger('click');
    await wrapper.get('[data-testid="acceptBtn"]').trigger('click');
    await wrapper.get('[data-testid="acceptBtn"]').trigger('click');
    expect(mocks.defer).toHaveBeenCalledOnce();
    expect(rows(wrapper).props('disabled')).toBe(true);
    expect(wrapper.get('[data-testid="usePhrase"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[data-testid="closeBtn"]').trigger('click');
    expect(wrapper.find('[data-testid="skipPopup"]').exists()).toBe(true);
    wrapper.unmount();
    finish(true);
    await flushPromises();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('asks first, then only postpones the prompt and opens the wallet; no account is removed', async () => {
    const wrapper = await openAccounts();

    await wrapper.get('[data-testid="migrationSkip"]').trigger('click');
    const popup = wrapper.get('[data-testid="skipPopup"]');
    expect(popup.text()).toContain('migration.skipConfirmTitle');
    expect(popup.text()).toContain('migration.skipWarning');
    expect(mocks.defer).not.toHaveBeenCalled();

    await popup.get('[data-testid="acceptBtn"]').trigger('click');
    await flushPromises();

    expect(mocks.defer).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Wallet' });
    expect(mocks.forget).not.toHaveBeenCalled();
    expect(mocks.exportJson).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="skipPopup"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('stays on the screen when the confirmation is cancelled', async () => {
    const wrapper = await openAccounts();

    await wrapper.get('[data-testid="migrationSkip"]').trigger('click');
    await wrapper.get('[data-testid="closeBtn"]').trigger('click');

    expect(wrapper.find('[data-testid="skipPopup"]').exists()).toBe(false);
    expect(mocks.defer).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('does not claim a saved deferral failed when only navigation fails', async () => {
    mocks.push.mockRejectedValueOnce(new Error('navigation failed'));
    const wrapper = await openAccounts();
    await wrapper.get('[data-testid="migrationSkip"]').trigger('click');
    await wrapper.get('[data-testid="acceptBtn"]').trigger('click');
    await flushPromises();
    expect(mocks.defer).toHaveBeenCalledOnce();
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith({ title: 'ux.startupUnavailable', message: '', type: 'error' });
    expect(wrapper.get('[data-testid="migrationSkip"]').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it.each([
    ['answers false', () => mocks.defer.mockResolvedValue(false)],
    ['fails', () => mocks.defer.mockRejectedValue(new Error('IO error: LOCK file in use'))],
  ])('says so and stays when the background %s, so Skip can be tried again', async (_, arrange) => {
    arrange();
    const wrapper = await openAccounts();

    await wrapper.get('[data-testid="migrationSkip"]').trigger('click');
    await wrapper.get('[data-testid="acceptBtn"]').trigger('click');
    await flushPromises();

    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith({ title: 'migration.skipFailed', message: '', type: 'error' });
    expect(mocks.push).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="migrationSkip"]').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('is still offered when the account list cannot be loaded, so the wallet stays reachable', async () => {
    mocks.list.mockRejectedValue(new Error('Storage not ready'));
    const wrapper = await openAccounts();

    expect(wrapper.find('[data-testid="migrationSkip"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('is not offered once every account is upgraded; Continue opens the wallet', async () => {
    mocks.list.mockResolvedValueOnce([forgotten]).mockResolvedValue([]);
    const wrapper = await openAccounts();

    rows(wrapper).vm.$emit('setItemValue', 0, { isLoading: false, isError: false, isComplete: true });
    await flushPromises();

    expect(wrapper.find('[data-testid="migrationSkip"]').exists()).toBe(false);
    const proceed = wrapper.get('[data-testid="migrationContinue"]');
    expect(proceed.attributes('disabled')).toBeUndefined();
    await proceed.trigger('click');
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Wallet' });
    expect(mocks.defer).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  // The master password is what opens the wallet after skipping; the description screen leads to creating it.
  it('sends a wallet without a master password back to create one instead of offering Skip', async () => {
    mocks.hasMasterPassword.mockResolvedValue(false);
    const wrapper = await openAccounts();

    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith({ name: 'MigrationDescription' });
    expect(wrapper.find('[data-testid="migrationSkip"]').exists()).toBe(false);
    expect(mocks.list).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe('what a row offers besides its password', () => {
  beforeEach(() => {
    mocks.list.mockResolvedValue([parent, child, forgotten]);
  });

  it('marks the Ethereum account done when its parent password opened it too, and keeps the others waiting', async () => {
    const wrapper = await openAccounts();
    // The parent's password also opened its Ethereum account: only the other wallet still waits.
    mocks.list.mockResolvedValue([forgotten]);

    rows(wrapper).vm.$emit('setItemValue', 0, { isLoading: false, isError: false, isComplete: true });
    await flushPromises();

    expect(items(wrapper).map(({ address, isComplete }) => [address, isComplete])).toEqual([
      [PARENT, true],
      [CHILD, true],
      [FORGOTTEN, false],
    ]);
    expect(wrapper.get('[data-testid="migrationContinue"]').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('keeps a linked account with a different password on its own row', async () => {
    const wrapper = await openAccounts();
    mocks.list.mockResolvedValue([child, forgotten]);

    rows(wrapper).vm.$emit('setItemValue', 0, { isLoading: false, isError: false, isComplete: true });
    await flushPromises();

    expect(items(wrapper).map(({ isComplete }) => isComplete)).toEqual([true, false, false]);
    wrapper.unmount();
  });

  it('downloads the stored record as it is, still under its old password', async () => {
    const json = { address: FORGOTTEN, encoded: 'stored-ciphertext', meta: { name: 'Forgotten' } };
    mocks.exportJson.mockResolvedValue({ json });
    const wrapper = await openAccounts();
    expect(wrapper.find('[data-testid="downloadBackup"]').exists()).toBe(false);

    await openRow(wrapper, 2);
    await wrapper.get('[data-testid="downloadBackup"]').trigger('click');
    await flushPromises();

    expect(mocks.exportJson).toHaveBeenCalledExactlyOnceWith(FORGOTTEN);
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith(FORGOTTEN, json);
    expect(mocks.migrate).not.toHaveBeenCalled();
    expect(mocks.forget).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('says so when the backup cannot be read and downloads nothing', async () => {
    mocks.exportJson.mockRejectedValue(new Error('account_record_not_found'));
    const wrapper = await openAccounts();

    await openRow(wrapper, 2);
    await wrapper.get('[data-testid="downloadBackup"]').trigger('click');
    await flushPromises();

    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith({ title: 'migration.downloadBackupFailed', message: '', type: 'error' });
    wrapper.unmount();
  });

  it('opens Account access in recovery phrase mode for the account whose password is forgotten', async () => {
    const wrapper = await openAccounts();

    await openRow(wrapper, 2);
    await wrapper.get('[data-testid="usePhrase"]').trigger('click');

    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({
      name: 'AccountAccessRecovery',
      query: { address: FORGOTTEN, mode: 'phrase' },
    });
    wrapper.unmount();
  });
});

describe('Reset wallet on the per-account password screen', () => {
  it('sits under More options, away from Continue and Skip', async () => {
    const wrapper = await openAccounts();

    expect(wrapper.find('[data-testid="resetWalletLink"]').exists()).toBe(false);
    expect(wrapper.get('.controls').text()).not.toContain('welcome.resetWallet');

    const toggle = wrapper.get('[data-testid="moreOptions"]');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    await toggle.trigger('click');

    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(wrapper.get('[data-testid="moreOptionsContent"]').text()).toContain('migration.resetHint');
    await wrapper.get('[data-testid="resetWalletLink"]').trigger('click');

    // The screen behind it asks for the encrypted backups and the typed confirmation (reset-wallet-backups.spec.ts).
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'ResetWallet' });
    expect(mocks.forget).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe('the upgrade description', () => {
  async function openDescription(): Promise<VueWrapper> {
    const wrapper = mount(MigrationDescription, { global });
    await flushPromises();
    return wrapper;
  }

  it('leads a wallet without a master password to create one, with nothing to postpone yet', async () => {
    mocks.hasMasterPassword.mockResolvedValue(false);
    const wrapper = await openDescription();

    expect(wrapper.find('[data-testid="migrationLater"]').exists()).toBe(false);
    await wrapper.get('[data-testid="migrationStart"]').trigger('click');

    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'ChangePassword' });
    wrapper.unmount();
  });

  it('lets a wallet that already opens with a master password do this later', async () => {
    const wrapper = await openDescription();

    await wrapper.get('[data-testid="migrationLater"]').trigger('click');
    await flushPromises();

    expect(mocks.defer).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Wallet' });
    expect(mocks.forget).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('stays and says so when Later could not be saved', async () => {
    mocks.defer.mockResolvedValue(false);
    const wrapper = await openDescription();

    await wrapper.get('[data-testid="migrationLater"]').trigger('click');
    await flushPromises();

    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith({ title: 'migration.skipFailed', message: '', type: 'error' });
    expect(mocks.push).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('still starts the password rows', async () => {
    const wrapper = await openDescription();

    await wrapper.get('[data-testid="migrationStart"]').trigger('click');

    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'MigrationAccounts' });
    wrapper.unmount();
  });
});


describe('password migration entry lifecycle', () => {
  it('does not guess the password route while state is loading and retries a failed lookup', async () => {
    let reject!: (reason: Error) => void;
    mocks.hasMasterPassword.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const wrapper = mount(MigrationDescription, { global });
    const start = wrapper.get('[data-testid="migrationStart"]');
    start.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(mocks.push).not.toHaveBeenCalled();
    reject(new Error('private storage detail')); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('migration.loadFailed');
    expect(wrapper.text()).not.toContain('private storage detail');
    start.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(mocks.push).not.toHaveBeenCalled();
    mocks.hasMasterPassword.mockResolvedValue(true);
    await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises();
    await start.trigger('click'); await flushPromises();
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'MigrationAccounts' });
    wrapper.unmount();
  });

  it('cannot start a competing flow while Later is saving and ignores its completion after leaving', async () => {
    let finish!: (value: boolean) => void;
    mocks.defer.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const wrapper = mount(MigrationDescription, { global }); await flushPromises();
    await wrapper.get('[data-testid="migrationLater"]').trigger('click');
    for (const id of ['migrationStart', 'migrationLater']) {
      wrapper.get('[data-testid="' + id + '"]').element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    expect(mocks.defer).toHaveBeenCalledOnce();
    expect(mocks.push).not.toHaveBeenCalled();
    wrapper.unmount(); finish(true); await flushPromises();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('holds one navigation request and permits retry after navigation fails', async () => {
    let reject!: (reason: Error) => void;
    mocks.push.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const wrapper = mount(MigrationDescription, { global }); await flushPromises();
    await wrapper.get('[data-testid="migrationStart"]').trigger('click');
    wrapper.get('[data-testid="migrationStart"]').element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    wrapper.get('[data-testid="migrationLater"]').element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(mocks.push).toHaveBeenCalledOnce();
    expect(mocks.defer).not.toHaveBeenCalled();
    reject(new Error('navigation failed')); await flushPromises();
    expect(mocks.notify).toHaveBeenCalledWith({ title: 'migration.loadFailed', message: '', type: 'error' });
    await wrapper.get('[data-testid="migrationStart"]').trigger('click'); await flushPromises();
    expect(mocks.push).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
