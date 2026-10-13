import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ status: vi.fn(), backup: vi.fn(), phrase: vi.fn(), download: vi.fn() }));
vi.mock('@/extension/messaging', () => ({ getAccessStatus: fixture.status, migrateExportJSON: fixture.backup, exportMnemonic: fixture.phrase }));
vi.mock('@/helpers/files', () => ({ downloadJsonAccount: fixture.download }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
import StorageRecovery from '@/screens/settings/StorageRecovery.vue';

const accounts = [
  { address: 'public-substrate', name: 'Public savings', walletEcosystem: 'substrate' },
  { address: 'public-linked-evm', name: 'Public EVM', walletEcosystem: 'evm' },
  { address: 'public-ton', name: 'Public TON', walletEcosystem: 'ton' },
];
async function open() {
  const wrapper = mount(StorageRecovery, { global: { stubs: {
    FButton: { props: ['text', 'disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ text }}</button>' },
    Loader: { template: '<span>loading</span>' },
    ValidatedInput: { props: ['value', 'readonly'], emits: ['change', 'pressEnter'], template: '<input :value="value" :readonly="readonly" @input="$emit(\'change\', $event.target.value)" />' },
  } } });
  await flushPromises();
  return wrapper;
}
beforeEach(() => {
  vi.clearAllMocks();
  fixture.status.mockResolvedValue({ storageRecoveryOnly: true, storageRecoveryAccounts: accounts });
  fixture.backup.mockResolvedValue({ json: { encoded: 'public encrypted fixture', meta: {} } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('web storage recovery exports', () => {
  it('waits for the old worker registration to retire before reloading so migration can retry', async () => {
    let retire!: (value: boolean) => void;
    const unregister = vi.fn(() => new Promise<boolean>(resolve => { retire = resolve; }));
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({ unregister }) } });
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
    const wrapper = await open();
    await wrapper.get('header button').trigger('click');
    await flushPromises();
    expect(unregister).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
    retire(true);
    await flushPromises();
    expect(reload).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('keeps each native account backup reachable and only downloads after the read succeeds', async () => {
    const wrapper = await open();
    expect(wrapper.findAll('[data-address]')).toHaveLength(3);
    for (const address of ['public-substrate', 'public-linked-evm']) {
      await wrapper.get(`[data-address="${address}"] button`).trigger('click');
      await flushPromises();
      expect(fixture.backup).toHaveBeenLastCalledWith(address);
      expect(fixture.download).toHaveBeenLastCalledWith(address, { encoded: 'public encrypted fixture', meta: {} });
    }
    wrapper.unmount();
  });
  it('keeps a failed backup retryable and does not download a late reply after unmount', async () => {
    const wrapper = await open();
    fixture.backup.mockRejectedValueOnce(new Error('read failed'));
    const button = wrapper.get('[data-address="public-substrate"] button');
    await button.trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="recoveryError"]').text()).toBe('migration.downloadBackupFailed');
    expect(fixture.download).not.toHaveBeenCalled();
    let finish!: (value: unknown) => void;
    fixture.backup.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await button.trigger('click');
    wrapper.unmount();
    finish({ json: { encoded: 'public delayed fixture' } });
    await flushPromises();
    expect(fixture.download).not.toHaveBeenCalled();
  });
  it('clears the supplied TON password and suppresses a phrase reply after the page is hidden', async () => {
    const wrapper = await open();
    const row = wrapper.get('[data-address="public-ton"]');
    let finish!: (value: unknown) => void;
    fixture.phrase.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await row.get('input').setValue('public previous password');
    await row.get('button').trigger('click');
    expect(fixture.phrase).toHaveBeenCalledWith('public-ton', 'public previous password', 'ton');
    expect((row.get('input').element as HTMLInputElement).value).toBe('');
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    finish({ seed: 'public fixture phrase' });
    await flushPromises();
    expect(wrapper.find('[data-testid="recoveryPhrase"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('shows a successful verified phrase only after explicit input and supports hiding it', async () => {
    const wrapper = await open();
    const row = wrapper.get('[data-address="public-ton"]');
    fixture.phrase.mockResolvedValue({ seed: 'public verified phrase' });
    await row.get('input').setValue('public previous password');
    await row.get('button').trigger('click');
    await flushPromises();
    expect(row.get('[data-testid="recoveryPhrase"]').text()).toBe('public verified phrase');
    await row.findAll('button').at(-1)!.trigger('click');
    expect(row.find('[data-testid="recoveryPhrase"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
