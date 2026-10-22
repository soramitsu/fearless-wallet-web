import { flushPromises, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ generate: vi.fn(), validate: vi.fn(), save: vi.fn(), derive: vi.fn(), push: vi.fn() }));
vi.mock('@/extension/messaging', () => ({ generateMnemonic: mocks.generate, mnemonicValidate: mocks.validate, addAccount: mocks.save, isDerivationPathValid: async () => true, isJsonValid: async () => ({ value: true }), forgetAccount: vi.fn(), jsonRestore: vi.fn(), windowOpen: vi.fn(), updatePairMeta: vi.fn(), createGoogleFile: vi.fn(), exportJSON: vi.fn(), getExtensionPassword: vi.fn(), updateCurrentAccount: vi.fn() }));
vi.mock('@/router/routes', () => ({ Components: { Welcome: 'Welcome', Wallet: 'Wallet' } }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ accounts: [], selectedWallet: {} }) }));
vi.mock('@/util/universalWalletKeyringFields', () => ({ deriveUniversalWalletKeyringFields: mocks.derive }));
vi.mock('@/util/BaseApi', () => ({ default: { parseJson: () => ({}), isValidSequenceMnemonic: () => true, isValidEthereumDerivationPath: () => true } }));
vi.mock('@/consts/globalClient', () => ({ IS_POPUP: false }));
import AddWallet from '@/screens/addWallet/AddWallet.vue';
import CreateGoogle from '@/screens/addWallet/google/CreateGoogle.vue';
const mountFlow = (type = 'create', walletEcosystem = 'ton') => shallowMount(AddWallet, { global: { mocks: { $t: (key: string) => key, $i18n: { locale: 'en-EN' }, $route: { params: { type, walletEcosystem } }, $router: { push: mocks.push } }, stubs: { CircleButton: true, FButton: true, NotificationPopup: true } } });
beforeEach(() => { vi.clearAllMocks(); mocks.derive.mockReturnValue({ tonAddress: 'public-ton-address' }); mocks.generate.mockResolvedValue('public test phrase'); mocks.save.mockResolvedValue('public-ton-address'); });
describe('account setup completion and recovery', () => {
  it.each(['substrate', 'ton'])('requests the universal 24-word format when %s is the first network', async (ecosystem) => {
    const wrapper = mountFlow('create', ecosystem);
    await wrapper.setData({ nickname: 'Fixture' });
    await wrapper.vm.proceed();
    expect(mocks.generate).toHaveBeenCalledWith('substrate', 24);
    expect(wrapper.vm.walletEcosystem).toBe(ecosystem);
    expect(wrapper.vm.step).toBe(2);
    wrapper.unmount();
  });
  it('keeps input and presents retry and Back after a failed save; reports completion only after retry succeeds', async () => {
    let fail!: (error: Error) => void;
    mocks.save.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    const wrapper = mountFlow();
    await wrapper.setData({ nickname: 'Fixture', mnemonic: 'public test phrase', step: 4 });
    await flushPromises();
    expect(wrapper.vm.isLoading).toBe(true);
    expect(wrapper.findComponent({ name: 'FinishForm' }).exists()).toBe(false);
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
    fail(new Error('storage unavailable'));
    await flushPromises();
    expect(wrapper.vm.isLoading).toBe(false);
    expect(wrapper.vm.mnemonic).toBe('public test phrase');
    expect(wrapper.vm.nickname).toBe('Fixture');
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.vm.showBackIcon).toBe(true);
    expect(wrapper.vm.savedSuccessfully).toBe(false);
    await wrapper.vm.proceed();
    await flushPromises();
    expect(wrapper.vm.savedSuccessfully).toBe(true);
    expect(wrapper.vm.showFinishForm).toBe(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save.mock.calls[1][3]).toBe('ton');
    wrapper.unmount();
  });
  it('recovers from phrase generation failure without advancing or losing the network', async () => {
    mocks.generate.mockRejectedValueOnce(new Error('worker unavailable'));
    const wrapper = mountFlow();
    await wrapper.setData({ nickname: 'Fixture' });
    await wrapper.vm.proceed();
    expect(wrapper.vm.step).toBe(1);
    expect(wrapper.vm.isLoading).toBe(false);
    expect(wrapper.vm.flowError).toBe(true);
    await wrapper.vm.proceed();
    expect(wrapper.vm.step).toBe(2);
    expect(wrapper.vm.walletEcosystem).toBe('ton');
    wrapper.unmount();
  });
  it('requires fresh generation when creating but not when importing', async () => {
    for (const type of ['create', 'import']) {
      const wrapper = mountFlow(type);
      await wrapper.setData({ nickname: 'Fixture', mnemonic: 'public test phrase' });
      await wrapper.vm.saveKeypairFromSeed();
      expect(mocks.save.mock.lastCall?.[4]).toBe(type === 'create');
      wrapper.unmount();
    }
  });
  it('clearly restarts expired creation with a new phrase instead of saving a recovery-only wallet', async () => {
    mocks.save.mockRejectedValueOnce(new Error('wallet_generation_expired: Start creating a new wallet again.'));
    const wrapper = mountFlow();
    await wrapper.setData({ nickname: 'Fixture', mnemonic: 'expired public fixture', step: 4 });
    await flushPromises();
    expect(wrapper.vm.step).toBe(1);
    expect(wrapper.vm.mnemonic).toBe('');
    expect(wrapper.vm.savedSuccessfully).toBe(false);
    expect(wrapper.vm.isLoading).toBe(false);
    expect(wrapper.get('[data-testid="generationExpired"]').text()).toContain('Do not use the previous phrase.');
    await wrapper.vm.proceed();
    expect(mocks.generate).toHaveBeenCalledWith('substrate', 24);
    expect(wrapper.vm.step).toBe(2);
    expect(wrapper.vm.mnemonic).toBe('public test phrase');
    expect(wrapper.find('[data-testid="generationExpired"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('restarts expired Google wallet creation before backup or finishing', async () => {
    mocks.save.mockRejectedValueOnce(new Error('wallet_generation_expired'));
    const wrapper = shallowMount(CreateGoogle, { global: {
      mocks: { $t: (key: string) => key, $i18n: { locale: 'en-EN' }, $route: { params: {} }, $router: { replace: mocks.push } },
      stubs: { FlowStepLayout: { template: '<div><slot /><slot name="control" /></div>' }, FButton: true, NotificationPopup: true },
    } });
    await flushPromises();
    await wrapper.setData({ nickname: 'Fixture', step: 4 });
    await flushPromises();
    expect(wrapper.vm.step).toBe(1);
    expect(wrapper.vm.mnemonic).toBe('');
    expect(wrapper.vm.isLoading).toBe(false);
    expect(wrapper.get('[data-testid="generationExpired"]').text()).toContain('Continue to generate');
    expect(mocks.save.mock.lastCall?.[4]).toBe(true);
    await wrapper.vm.proceed();
    expect(wrapper.vm.step).toBe(2);
    expect(wrapper.vm.mnemonic).toBe('public test phrase');
    expect(wrapper.find('[data-testid="generationExpired"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
