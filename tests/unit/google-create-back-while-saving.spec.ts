import { flushPromises, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  add: vi.fn(), upload: vi.fn(), export: vi.fn(), select: vi.fn(), password: vi.fn(), phrase: vi.fn(), replace: vi.fn(),
}));
vi.mock('@/extension/messaging', () => ({ addAccount: mocks.add, createGoogleFile: mocks.upload, exportJSON: mocks.export,
  updateCurrentAccount: mocks.select, getExtensionPassword: mocks.password, generateMnemonic: mocks.phrase }));
vi.mock('@/router/routes', () => ({ Components: { Wallet: 'Wallet' } }));
vi.mock('@/util/universalWalletKeyringFields', () => ({ deriveUniversalWalletKeyringFields: () => ({}) }));
vi.mock('@/util/BaseApi', () => ({ default: { isValidSequenceMnemonic: () => true } }));
vi.mock('@/screens/addWallet/AdvancedButton.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/addWallet/NicknameForm.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/addWallet/CreateWallet.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/addWallet/AdvancedForm.vue', () => ({ default: { template: '<div />' } }));
import CreateGoogle from '@/screens/addWallet/google/CreateGoogle.vue';

const root = { address: 'public-root', encoded: 'public-encrypted-root', meta: { name: 'Root', ethereumAddress: '0xPublicChild' } };
const child = { address: '0xPublicChild', encoded: 'public-encrypted-child', meta: { name: 'Child' } };

// Like CircleButton: a disabled button sends no click.
const CircleButton = {
  props: ['disabled'],
  emits: ['click'],
  template: '<button type="button" :disabled="disabled" @click="!disabled && $emit(\'click\')" />',
};

const open = async () => {
  const wrapper = shallowMount(CreateGoogle, { global: {
    config: { errorHandler: vi.fn() },
    mocks: { $t: (key: string) => key, $i18n: { locale: 'en-EN' }, $route: { params: { access_token: 'public-test-token' } }, $router: { replace: mocks.replace } },
    stubs: { FlowStepLayout: false, CircleButton, Loader: true, FinishForm: true, FButton: true, NotificationPopup: true, NegativeMessage: true },
  } });
  await flushPromises();
  await wrapper.setData({ nickname: 'Public fixture', step: 4 });
  await flushPromises();
  return wrapper;
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.phrase.mockResolvedValue('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
  mocks.export.mockImplementation(async (address: string) => ({ json: structuredClone(address === root.address ? root : child) }));
  mocks.password.mockResolvedValue('Public fixture password');
  mocks.upload.mockImplementation(async ({ json }: { json: string }) => ({ id: JSON.parse(json).address === root.address ? 'root-file' : 'child-file' }));
  mocks.select.mockResolvedValue(undefined);
  mocks.replace.mockResolvedValue(undefined);
});

describe('Google create: Back while the wallet is saved', () => {
  it('is disabled and ignored until the wallet is created, backed up to Drive and selected', async () => {
    let finishPrimary!: (address: string) => void;
    mocks.add.mockImplementation((_uri: string, type: string) =>
      type === 'ethereum' ? Promise.resolve(child.address) : new Promise<string>((resolve) => { finishPrimary = resolve; }));
    const wrapper = await open();
    expect(wrapper.vm.isLoading).toBe(true);

    const back = wrapper.get('[data-testid="backBtn"]');
    expect(back.attributes('disabled')).toBeDefined();
    await back.trigger('click');
    wrapper.vm.back();
    await flushPromises();
    expect(mocks.replace).not.toHaveBeenCalled();

    finishPrimary(root.address);
    await flushPromises();
    expect(mocks.add).toHaveBeenCalledTimes(2);
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith(root.address);
    expect(wrapper.vm.isFinished).toBe(true);
    wrapper.unmount();
  });

  it('still leaves after a failed save, as before', async () => {
    mocks.add.mockRejectedValue(new Error('Public save failure'));
    const wrapper = await open();
    expect(wrapper.vm.creationError).toBe(true);

    const back = wrapper.get('[data-testid="backBtn"]');
    expect(back.attributes('disabled')).toBeUndefined();
    await back.trigger('click');
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith({ name: 'Wallet', params: { access_token: '' } });
    wrapper.unmount();
  });
});
