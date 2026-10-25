import { flushPromises, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exportMnemonic: vi.fn(), getPassword: vi.fn(), validatePassword: vi.fn(), unlock: vi.fn(), push: vi.fn(),
  accounts: { selectedWallet: { address: 'public-ton-fixture', walletEcosystem: 'ton', isTon: true, isMobile: false, ethereumAddress: '' } },
}));
vi.mock('@/extension/messaging', () => ({
  exportMnemonic: mocks.exportMnemonic, getExtensionPassword: mocks.getPassword,
  validatePassword: mocks.validatePassword, unlockExtension: mocks.unlock, windowOpen: vi.fn(),
}));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => mocks.accounts }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push, back: vi.fn() }), useRoute: () => ({ params: {}, query: { redirect: '/send' } }) }));
vi.mock('@/router/routes', () => ({ Components: { Wallet: 'Wallet' } }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/util/BaseApi', () => ({ default: { isEthereumNetwork: () => false } }));
vi.mock('@/consts/globalClient', () => ({ IS_POPUP: false }));
import Export from '@/screens/accounts/Export.vue';
import Unlock from '@/screens/welcome/Unlock.vue';

const global = {
  mocks: { $t: (key: string) => key },
  stubs: { FButton: { props: ['text'], template: '<button>{{ text }}</button>' }, ValidatedInput: true, InformationBlock: true, WalletLogo: true, CircleButton: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accounts.selectedWallet.address = 'public-ton-fixture';
  mocks.exportMnemonic.mockResolvedValue({ seed: 'public test phrase' });
  mocks.getPassword.mockResolvedValue('public-current-password');
});

describe('published TON earlier-password recovery UI', () => {
  it('uses the earlier password to repair the account before advancing export with the current password', async () => {
    const wrapper = shallowMount(Export, { global });
    wrapper.findComponent({ name: 'ValidatedInput' }).vm.$emit('change', 'public-earlier-password');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(mocks.exportMnemonic).toHaveBeenCalledWith('public-ton-fixture', 'public-earlier-password', 'ton');
    expect(mocks.validatePassword).not.toHaveBeenCalled();
    expect(wrapper.emitted('setPassword')).toEqual([['public-current-password']]);
    wrapper.unmount();
  });

  it('keeps the account available for retry when password recovery fails', async () => {
    mocks.exportMnemonic.mockRejectedValueOnce(new Error('Wrong earlier password'));
    const wrapper = shallowMount(Export, { global });
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('setPassword')).toBeUndefined();
    expect(wrapper.findComponent({ name: 'ValidatedInput' }).attributes('iserror')).toBe('true');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('setPassword')).toEqual([['public-current-password']]);
    wrapper.unmount();
  });

  it('discards completed recovery after the selected wallet changes', async () => {
    let resolve!: (value: { seed: string }) => void;
    mocks.exportMnemonic.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const wrapper = shallowMount(Export, { global });
    await wrapper.get('button').trigger('click');
    mocks.accounts.selectedWallet.address = 'another-public-wallet';
    resolve({ seed: 'public test phrase' });
    await flushPromises();
    expect(wrapper.emitted('setPassword')).toBeUndefined();
    wrapper.unmount();
  });

  it.each([['ton-recovery-required', 'welcome.tonRecoveryRequired'], ['ton-storage-unavailable', 'welcome.tonStorageUnavailable']])('shows the %s notice before continuing to the requested wallet route', async (result, notice) => {
    mocks.unlock.mockResolvedValueOnce(result);
    const wrapper = shallowMount(Unlock, { global });
    await wrapper.get('button.unlock-btn').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain(notice);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(wrapper.find('button.unlock-btn').exists()).toBe(false);
    await wrapper.get('[role="alert"] button').trigger('click');
    expect(mocks.push).toHaveBeenCalledWith('/send');
    wrapper.unmount();
  });
});
