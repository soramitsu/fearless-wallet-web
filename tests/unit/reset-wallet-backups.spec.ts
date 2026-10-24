import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  exportJson: vi.fn(),
  reset: vi.fn(),
  download: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
}));
vi.mock('@/extension/messaging', () => ({
  getMigrationAccounts: mocks.list,
  migrateExportJSON: mocks.exportJson,
  resetWallet: mocks.reset,
}));
vi.mock('@/helpers/files', () => ({ downloadJsonAccount: mocks.download }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push, back: mocks.back }) }));
vi.mock('@/router/routes', () => ({ Components: { Welcome: 'Welcome' } }));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    tc: (key: string, count: number) => `${key}:${count}`,
  }),
}));

import ResetWallet from '@/screens/welcome/ResetWallet.vue';

const PARENT = '5EHgWw2Af1pnoc7f1A8bfmM97W3DAYW8xr82RfhLL9oAabAe';
const CHILD = '0x58A57ed9d8d624cBD12e2C467D34787555bB1b25';
const legacyAccounts = [
  { address: PARENT, name: 'Forgotten', type: 'sr25519', walletEcosystem: 'substrate', isEthereum: false },
  { address: CHILD, name: 'Forgotten', type: 'ethereum', walletEcosystem: 'evm', isEthereum: true, linkedParentAddress: PARENT },
];
const stored = (address: string) => ({ address, encoded: `ciphertext of ${address}`, meta: { name: 'Forgotten' } });

async function open(): Promise<VueWrapper> {
  const wrapper = mount(ResetWallet, {
    global: {
      stubs: {
        AboveForm: { template: '<main><slot /></main>' },
        Scroll: { template: '<div><slot /></div>' },
        Icon: { template: '<span />' },
        FInput: {
          props: ['value'],
          emits: ['change'],
          template: '<input data-testid="resetPhrase" :value="value" @input="$emit(\'change\', $event.target.value)" />',
        },
        FButton: {
          props: ['text', 'disabled'],
          emits: ['click'],
          template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')">{{ text }}</button>',
        },
        Checkbox: {
          props: ['label', 'value'],
          emits: ['change'],
          template: '<label><input type="checkbox" :checked="value" @change="$emit(\'change\', $event.target.checked)" />{{ label }}</label>',
        },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

const confirmStep = (wrapper: VueWrapper) => wrapper.find('[data-testid="resetConfirmStep"]');

async function typeAndConfirm(wrapper: VueWrapper) {
  await wrapper.get('[data-testid="resetPhrase"]').setValue('Reset wallet');
  await confirmStep(wrapper).get('button').trigger('click');
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reset.mockReset().mockResolvedValue(true);
  mocks.list.mockResolvedValue([]);
  mocks.exportJson.mockImplementation(async (address: string) => ({ json: stored(address) }));
});

describe('Reset wallet', () => {
  it('waits for acknowledgement and disables repeated confirmation while reset is pending', async () => {
    let finish!: (value: boolean) => void;
    mocks.reset.mockReturnValueOnce(new Promise<boolean>((resolve) => { finish = resolve; }));
    const wrapper = await open();
    await typeAndConfirm(wrapper);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(confirmStep(wrapper).get('button').attributes('disabled')).toBeDefined();
    await confirmStep(wrapper).get('button').trigger('click');
    expect(mocks.reset).toHaveBeenCalledOnce();
    finish(true);
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Welcome' });
    wrapper.unmount();
  });

  it.each(['false', 'rejection'])('retains typed confirmation and offers retry after %s', async (failure) => {
    const failed = failure === 'false' ? Promise.resolve(false) : Promise.reject(new Error('Storage unavailable'));
    void failed.catch(() => undefined);
    mocks.reset.mockReturnValueOnce(failed);
    const wrapper = await open();
    await typeAndConfirm(wrapper);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="resetFailed"]').attributes('role')).toBe('alert');
    expect((wrapper.get('[data-testid="resetPhrase"]').element as HTMLInputElement).value).toBe('Reset wallet');
    expect(confirmStep(wrapper).get('button').attributes('disabled')).toBeUndefined();
    await confirmStep(wrapper).get('button').trigger('click');
    await flushPromises();
    expect(mocks.reset).toHaveBeenCalledTimes(2);
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Welcome' });
    wrapper.unmount();
  });

  it('does not navigate from a reset screen that closed while storage was pending', async () => {
    let finish!: (value: boolean) => void;
    mocks.reset.mockReturnValueOnce(new Promise<boolean>((resolve) => { finish = resolve; }));
    const wrapper = await open();
    await typeAndConfirm(wrapper);
    wrapper.unmount();
    finish(true);
    await flushPromises();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('asks only for the typed confirmation when every account opens with the master password', async () => {
    const wrapper = await open();

    expect(wrapper.find('[data-testid="resetBackupStep"]').exists()).toBe(false);
    const confirm = confirmStep(wrapper).get('button');
    expect(confirm.attributes('disabled')).toBeDefined();

    await typeAndConfirm(wrapper);

    expect(mocks.reset).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Welcome' });
    wrapper.unmount();
  });

  // D-10: reset removes accounts no master password ever opened at the moment the user is least sure.
  it('holds the typed confirmation back until the backups of accounts on an old password were downloaded', async () => {
    mocks.list.mockResolvedValue(legacyAccounts);
    const wrapper = await open();

    expect(wrapper.get('[data-testid="resetBackupStep"]').text()).toContain('welcome.resetBackupDescription:2');
    expect(confirmStep(wrapper).exists()).toBe(false);
    expect(wrapper.text()).not.toContain('welcome.enterReset');

    await wrapper.get('[data-testid="resetDownloadBackups"]').trigger('click');
    await flushPromises();

    // Each file is the stored record as it is, still under the password its account had.
    expect(mocks.exportJson.mock.calls).toEqual([[PARENT], [CHILD]]);
    expect(mocks.download.mock.calls).toEqual([
      [PARENT, stored(PARENT)],
      [CHILD, stored(CHILD)],
    ]);
    expect(wrapper.find('[data-testid="resetBackupDone"]').exists()).toBe(true);
    expect(mocks.reset).not.toHaveBeenCalled();

    await typeAndConfirm(wrapper);

    expect(mocks.reset).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Welcome' });
    wrapper.unmount();
  });

  it('does not count a failed download as a backup, and lets the user try again', async () => {
    mocks.list.mockResolvedValue(legacyAccounts);
    mocks.exportJson.mockRejectedValueOnce(new Error('account_record_not_found'));
    const wrapper = await open();

    await wrapper.get('[data-testid="resetDownloadBackups"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="resetBackupFailed"]').text()).toBe('migration.downloadBackupFailed');
    expect(wrapper.find('[data-testid="resetBackupDone"]').exists()).toBe(false);
    expect(confirmStep(wrapper).exists()).toBe(false);

    await wrapper.get('[data-testid="resetDownloadBackups"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="resetBackupFailed"]').exists()).toBe(false);
    expect(confirmStep(wrapper).exists()).toBe(true);
    expect(mocks.reset).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('accepts the user saying they hold their own phrase or backup for those accounts', async () => {
    mocks.list.mockResolvedValue(legacyAccounts);
    const wrapper = await open();

    await wrapper.get('[data-testid="resetHaveBackups"] input').setValue(true);

    expect(confirmStep(wrapper).exists()).toBe(true);
    expect(mocks.exportJson).not.toHaveBeenCalled();

    await wrapper.get('[data-testid="resetHaveBackups"] input').setValue(false);

    expect(confirmStep(wrapper).exists()).toBe(false);
    wrapper.unmount();
  });

  it('never offers the typed confirmation before it knows whether a backup step comes first', async () => {
    let answer: (accounts: typeof legacyAccounts) => void = () => undefined;
    mocks.list.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const wrapper = await open();

    expect(confirmStep(wrapper).exists()).toBe(false);
    expect(wrapper.text()).not.toContain('welcome.enterReset');

    answer(legacyAccounts);
    await flushPromises();

    expect(wrapper.find('[data-testid="resetBackupStep"]').exists()).toBe(true);
    expect(confirmStep(wrapper).exists()).toBe(false);
    wrapper.unmount();
  });

  // Reset is the way out of a forgotten master password; it cannot depend on the account list.
  it('stays possible when the account list cannot be read', async () => {
    mocks.list.mockRejectedValue(new Error('Storage not ready'));
    const wrapper = await open();

    expect(wrapper.find('[data-testid="resetBackupStep"]').exists()).toBe(false);
    await typeAndConfirm(wrapper);

    expect(mocks.reset).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
});
