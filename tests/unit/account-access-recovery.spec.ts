import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountAccessIssue, AccountAccessStatus } from '@extension-base/background/types/types';
import { WalletEcosystem } from '@/interfaces';

const mocks = vi.hoisted(() => ({
  getAccessStatus: vi.fn(),
  recoverAccountWithPassword: vi.fn(),
  recoverAccountWithPhrase: vi.fn(),
  migrateExportJSON: vi.fn(),
  download: vi.fn(),
  notify: vi.fn(),
  push: vi.fn(),
  go: vi.fn(),
}));
vi.mock('@/extension/messaging', () => ({
  getAccessStatus: mocks.getAccessStatus,
  recoverAccountWithPassword: mocks.recoverAccountWithPassword,
  recoverAccountWithPhrase: mocks.recoverAccountWithPhrase,
  migrateExportJSON: mocks.migrateExportJSON,
}));
vi.mock('@/helpers/files', () => ({ downloadJsonAccount: mocks.download }));
vi.mock('@/plugins/soramitsuUI', () => ({ useNotify: () => mocks.notify }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push, go: mocks.go }) }));
vi.mock('@/router/routes', () => ({ Components: { Settings: 'Settings' } }));
vi.mock('@/stores/accounts', () => ({
  useAccountsStore: () => ({ accounts: [{ address: PARENT, name: 'Polkadot savings' }] }),
}));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string>) => (values ? `${key}:${JSON.stringify(values)}` : key),
  }),
}));

import AccountAccessRecovery from '@/screens/settings/AccountAccessRecovery.vue';

const PARENT = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const CHILD = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const TON = 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI';

const legacyParent: AccountAccessIssue = {
  address: PARENT,
  walletEcosystem: WalletEcosystem.Substrate,
  kind: 'legacy_account_password',
  name: 'Polkadot savings',
  canDownloadEncryptedBackup: true,
};
const legacyChild: AccountAccessIssue = {
  address: CHILD,
  walletEcosystem: WalletEcosystem.Evm,
  kind: 'legacy_account_password',
  name: '',
  linkedParentAddress: PARENT,
  canDownloadEncryptedBackup: true,
};
const tonIssue: AccountAccessIssue = {
  address: TON,
  walletEcosystem: WalletEcosystem.Ton,
  kind: 'previous_master_password',
  name: 'TON',
  canDownloadEncryptedBackup: false,
};

const status = (issues: AccountAccessIssue[]): AccountAccessStatus => ({
  hasMasterPassword: true,
  mustCreateMasterPassword: false,
  promptPending: false,
  deferred: true,
  issues,
  scanComplete: true,
});

async function open(address?: string, mode?: string): Promise<VueWrapper> {
  const wrapper = mount(AccountAccessRecovery, {
    props: { address, mode },
    global: {
      stubs: {
        AboveForm: { emits: ['closeHandler'], template: '<section><slot /></section>' },
        Scroll: { template: '<div><slot /></div>' },
        Loader: { template: '<span data-testid="loader" />' },
        FButton: {
          props: ['text', 'disabled'],
          emits: ['click'],
          template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')">{{ text }}</button>',
        },
        ValidatedInput: {
          props: ['value', 'isError', 'errorDescriptions', 'type', 'placeholder'],
          emits: ['change', 'pressEnter'],
          template:
            '<label><input :value="value" :data-type="type" :placeholder="placeholder" @input="$emit(\'change\', $event.target.value)" />' +
            '<span v-if="isError" class="input-error">{{ errorDescriptions }}</span></label>',
        },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

const accessRows = (wrapper: VueWrapper) => wrapper.findAll('[data-testid="accessRow"]');
const rowOf = (wrapper: VueWrapper, address: string) =>
  wrapper.get(`[data-testid="accessRow"][data-address="${address}"]`);

async function enter(row: ReturnType<VueWrapper['get']>, value: string) {
  await row.get('input').setValue(value);
  await row.get('[data-testid="accessUnlock"]').trigger('click');
  await flushPromises();
}

describe('Account access screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessStatus.mockResolvedValue(status([legacyParent, legacyChild, tonIssue]));
  });

  afterEach(() => {
    window.history.replaceState(null, '');
  });

  it('lists every account that waits for a password, the EVM account under its parent name', async () => {
    const wrapper = await open();

    expect(accessRows(wrapper).map((row) => row.attributes('data-address'))).toEqual([PARENT, CHILD, TON]);
    expect(rowOf(wrapper, CHILD).get('.access-row__name').text()).toBe(
      'accountAccess.evmAccountOf:{"name":"Polkadot savings"}'
    );
    expect(rowOf(wrapper, PARENT).text()).toContain('accountAccess.legacyPasswordHint');
    expect(rowOf(wrapper, TON).text()).toContain('accountAccess.previousPasswordHint');
    expect(wrapper.get('[data-testid="accessClose"]').text()).toBe('accountAccess.keepLocked');
  });

  it('shows only the account a failed send or export came from', async () => {
    const wrapper = await open(TON);

    expect(accessRows(wrapper).map((row) => row.attributes('data-address'))).toEqual([TON]);
  });

  it('keeps the row with an inline error and writes nothing visible for a wrong password', async () => {
    mocks.recoverAccountWithPassword.mockResolvedValue({ ok: false, code: 'wrong_password' });
    const wrapper = await open(TON);

    await enter(rowOf(wrapper, TON), 'not the old password');

    expect(mocks.recoverAccountWithPassword).toHaveBeenCalledExactlyOnceWith({
      address: TON,
      walletEcosystem: WalletEcosystem.Ton,
      password: 'not the old password',
    });
    expect(rowOf(wrapper, TON).get('.input-error').text()).toBe('accountAccess.wrongPassword');
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.go).not.toHaveBeenCalled();
  });

  it('removes an unlocked account and keeps what was typed in the other rows', async () => {
    mocks.recoverAccountWithPassword.mockResolvedValue({ ok: true });
    const wrapper = await open();
    await rowOf(wrapper, TON).get('input').setValue('typed but not sent');

    mocks.getAccessStatus.mockResolvedValue(status([legacyChild, tonIssue]));
    await enter(rowOf(wrapper, PARENT), '2.6.3 password');

    expect(mocks.recoverAccountWithPassword).toHaveBeenCalledWith({
      address: PARENT,
      walletEcosystem: WalletEcosystem.Substrate,
      password: '2.6.3 password',
    });
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'success' }));
    expect(accessRows(wrapper).map((row) => row.attributes('data-address'))).toEqual([CHILD, TON]);
    expect((rowOf(wrapper, TON).get('input').element as HTMLInputElement).value).toBe('typed but not sent');
  });

  it('accepts the recovery phrase instead, and says so when it belongs to another account', async () => {
    mocks.recoverAccountWithPhrase
      .mockResolvedValueOnce({ ok: false, code: 'phrase_mismatch' })
      .mockResolvedValueOnce({ ok: true });
    const wrapper = await open(CHILD);
    const row = rowOf(wrapper, CHILD);

    await row.get('[data-testid="accessMode"]').trigger('click');
    expect(row.get('input').attributes('data-type')).toBe('textarea');
    await enter(row, 'legal winner thank year wave sausage worth useful legal winner thank yellow');

    expect(mocks.recoverAccountWithPhrase).toHaveBeenCalledWith({
      address: CHILD,
      walletEcosystem: WalletEcosystem.Evm,
      phrase: 'legal winner thank year wave sausage worth useful legal winner thank yellow',
    });
    expect(rowOf(wrapper, CHILD).get('.input-error').text()).toBe('accountAccess.phraseMismatch');

    mocks.getAccessStatus.mockResolvedValue(status([legacyParent, tonIssue]));
    await enter(
      rowOf(wrapper, CHILD),
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    );

    // The scoped account is unlocked: the rest of the list is shown.
    expect(accessRows(wrapper).map((element) => element.attributes('data-address'))).toEqual([PARENT, TON]);
  });

  // "Forgot this password? Use the recovery phrase" on the per-account password screen.
  it('starts with the recovery phrase for the account it was opened for in phrase mode', async () => {
    mocks.recoverAccountWithPhrase.mockResolvedValue({ ok: true });
    const wrapper = await open(PARENT, 'phrase');

    // The account and its own Ethereum account, both asking for the phrase.
    expect(accessRows(wrapper).map((row) => row.attributes('data-address'))).toEqual([PARENT, CHILD]);
    expect(rowOf(wrapper, PARENT).get('input').attributes('data-type')).toBe('textarea');
    expect(rowOf(wrapper, PARENT).text()).toContain('accountAccess.phraseHint');

    await enter(rowOf(wrapper, PARENT), 'legal winner thank year wave sausage worth useful legal winner thank yellow');

    expect(mocks.recoverAccountWithPhrase).toHaveBeenCalledExactlyOnceWith({
      address: PARENT,
      walletEcosystem: WalletEcosystem.Substrate,
      phrase: 'legal winner thank year wave sausage worth useful legal winner thank yellow',
    });
    expect(mocks.recoverAccountWithPassword).not.toHaveBeenCalled();
  });

  it('asks for a password as usual when no mode is given, also for the scoped account', async () => {
    const wrapper = await open(PARENT);

    expect(rowOf(wrapper, PARENT).get('input').attributes('data-type')).toBe('text');
    expect(rowOf(wrapper, PARENT).find('[data-testid="accessDerivationPath"]').exists()).toBe(false);
  });

  it('sends the derivation path an account was created with next to its phrase', async () => {
    mocks.recoverAccountWithPhrase.mockResolvedValue({ ok: true });
    const wrapper = await open(PARENT, 'phrase');
    const row = rowOf(wrapper, PARENT);

    await row.get('[data-testid="accessDerivationPath"] input').setValue(' //staking ');
    await enter(row, 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');

    expect(mocks.recoverAccountWithPhrase).toHaveBeenCalledExactlyOnceWith({
      address: PARENT,
      walletEcosystem: WalletEcosystem.Substrate,
      phrase: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      derivationPath: '//staking',
    });
  });

  // A TON phrase is checked against the stored public key as typed; it has no derivation path.
  it('does not ask a TON account for a derivation path', async () => {
    const wrapper = await open(TON, 'phrase');

    expect(rowOf(wrapper, TON).get('input').attributes('data-type')).toBe('textarea');
    expect(rowOf(wrapper, TON).find('[data-testid="accessDerivationPath"]').exists()).toBe(false);
  });

  it('downloads the encrypted backup of an account that still has its old password, and of no other', async () => {
    const json = { address: PARENT, encoded: 'stored-ciphertext', meta: { name: 'Polkadot savings' } };
    mocks.migrateExportJSON.mockResolvedValue({ json });
    const wrapper = await open();

    expect(rowOf(wrapper, TON).find('[data-testid="accessDownloadBackup"]').exists()).toBe(false);
    await rowOf(wrapper, PARENT).get('[data-testid="accessDownloadBackup"]').trigger('click');
    await flushPromises();

    expect(mocks.migrateExportJSON).toHaveBeenCalledExactlyOnceWith(PARENT);
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith(PARENT, json);
    // Read-only: the account still waits for its password.
    expect(accessRows(wrapper)).toHaveLength(3);
    expect(mocks.recoverAccountWithPassword).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('says so when the backup could not be read', async () => {
    mocks.migrateExportJSON.mockRejectedValue(new Error('account_record_not_found'));
    const wrapper = await open();

    await rowOf(wrapper, CHILD).get('[data-testid="accessDownloadBackup"]').trigger('click');
    await flushPromises();

    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith({
      title: 'migration.downloadBackupFailed',
      message: '',
      type: 'error',
    });
  });

  it('reports an unexpected failure inline as nothing changed', async () => {
    mocks.recoverAccountWithPassword.mockRejectedValue(new Error('Could not establish connection'));
    const wrapper = await open(TON);

    await enter(rowOf(wrapper, TON), 'P0');

    expect(rowOf(wrapper, TON).get('.input-error').text()).toBe('accountAccess.unlockFailed');
    expect((rowOf(wrapper, TON).get('[data-testid="accessUnlock"]').element as HTMLButtonElement).disabled).toBe(false);
  });

  it('goes back to the send or export it came from with "Keep locked for now"', async () => {
    window.history.replaceState({ back: '/fearless/settings/accounts/network/Polkadot/export' }, '');
    const wrapper = await open(TON);

    await wrapper.get('[data-testid="accessClose"]').trigger('click');

    expect(mocks.go).toHaveBeenCalledExactlyOnceWith(-1);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('opens Settings when there is no screen to go back to, and says when nothing is locked', async () => {
    mocks.getAccessStatus.mockResolvedValue(status([]));
    const wrapper = await open();

    expect(wrapper.get('[data-testid="allUnlocked"]').text()).toBe('accountAccess.allUnlocked');
    expect(wrapper.get('[data-testid="accessClose"]').text()).toBe('common.close');
    await wrapper.get('[data-testid="accessClose"]').trigger('click');

    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Settings' });
  });

  it('offers Try again when the list cannot be read', async () => {
    mocks.getAccessStatus.mockRejectedValueOnce(new Error('Could not establish connection'));
    const wrapper = await open();

    expect(wrapper.find('[data-testid="accessLoadFailed"]').exists()).toBe(true);
    await wrapper.get('[data-testid="accessLoadFailed"] button').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="accessLoadFailed"]').exists()).toBe(false);
    expect(accessRows(wrapper)).toHaveLength(3);
  });
});
