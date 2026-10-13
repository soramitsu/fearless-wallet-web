import { flushPromises, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ add: vi.fn(), upload: vi.fn(), export: vi.fn(), select: vi.fn(), password: vi.fn(), phrase: vi.fn() }));
vi.mock('@/extension/messaging', () => ({ addAccount: mocks.add, createGoogleFile: mocks.upload, exportJSON: mocks.export,
  updateCurrentAccount: mocks.select, getExtensionPassword: mocks.password, generateMnemonic: mocks.phrase }));
vi.mock('@/router/routes', () => ({ Components: { Wallet: 'Wallet' } }));
vi.mock('@/util/universalWalletKeyringFields', () => ({ deriveUniversalWalletKeyringFields: () => ({}) }));
vi.mock('@/util/BaseApi', () => ({ default: { isValidSequenceMnemonic: () => true } }));
vi.mock('@/screens/addWallet/AdvancedButton.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/addWallet/NicknameForm.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/addWallet/CreateWallet.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/addWallet/AdvancedForm.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/addWallet/google/FlowStepLayout.vue', () => ({ default: { template: '<div><slot /><slot name="control" /></div>' } }));
import CreateGoogle from '@/screens/addWallet/google/CreateGoogle.vue';
const root = { address: 'public-root', encoded: 'public-encrypted-root', meta: { name: 'Root', ethereumAddress: '0xPublicChild' } };
const child = { address: '0xPublicChild', encoded: 'public-encrypted-child', meta: { name: 'Child' } };
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = (promise: unknown) => Promise.resolve(promise).catch(() => undefined);
const open = async () => {
  const wrapper = shallowMount(CreateGoogle, { global: {
    config: { errorHandler: vi.fn() },
    mocks: { $t: (key: string) => key, $route: { params: { access_token: 'public-test-token' } }, $router: { replace: vi.fn().mockResolvedValue(undefined) } },
    stubs: { FlowStepLayout: { template: '<div><slot /><slot name="control" /></div>' }, FButton: true, NotificationPopup: true, NegativeMessage: true },
  } });
  await flushPromises();
  await wrapper.setData({ nickname: 'Public fixture', step: 4 });
  await flushPromises();
  return wrapper;
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.phrase.mockResolvedValue('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
  mocks.add.mockImplementation(async (_uri: string, type: string) => type === 'ethereum' ? child.address : root.address);
  mocks.export.mockImplementation(async (address: string) => ({ json: structuredClone(address === root.address ? root : child) }));
  mocks.password.mockResolvedValue('Public fixture password');
  mocks.upload.mockImplementation(async ({ json }: { json: string }) => ({ id: JSON.parse(json).address === root.address ? 'root-file' : 'child-file' }));
  mocks.select.mockResolvedValue(undefined);
});

describe('Google create backup acknowledgements', () => {
  it('does not select or finish while the primary upload is pending', async () => {
    const upload = deferred<{ id: string }>();
    mocks.upload.mockResolvedValueOnce({ id: 'child-file' }).mockReturnValueOnce(upload.promise);
    const wrapper = await open();
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(wrapper.vm.isLoading).toBe(true);
    expect(mocks.select).not.toHaveBeenCalled();
    upload.resolve({ id: 'root-file' });
    await flushPromises();
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith(root.address);
    expect(wrapper.vm.isLoading).toBe(false);
    wrapper.unmount();
  });

  it('retries a failed primary upload without recreating keys or duplicating its acknowledged child', async () => {
    mocks.upload.mockResolvedValueOnce({ id: 'child-file' }).mockRejectedValueOnce(new Error('Public upload failure')).mockResolvedValueOnce({ id: 'root-file' });
    const wrapper = await open();
    expect(wrapper.vm.isLoading).toBe(false);
    expect(wrapper.find('[role=alert]').exists()).toBe(true);
    expect(mocks.select).not.toHaveBeenCalled();
    await settle(wrapper.vm.proceed());
    await flushPromises();
    expect(mocks.add).toHaveBeenCalledTimes(2);
    expect(mocks.upload).toHaveBeenCalledTimes(3);
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith(root.address);
    wrapper.unmount();
  });

  it('does not duplicate a pending final step', async () => {
    const upload = deferred<{ id: string }>();
    mocks.upload.mockReturnValueOnce(upload.promise);
    const wrapper = await open();
    void settle(wrapper.vm.watchStep());
    await flushPromises();
    expect(mocks.add).toHaveBeenCalledTimes(2);
    expect(mocks.upload).toHaveBeenCalledOnce();
    upload.resolve({ id: 'child-file' });
    await flushPromises();
    wrapper.unmount();
  });

  it('does not upload the parent or change selection after leaving during the child upload', async () => {
    const upload = deferred<{ id: string }>();
    mocks.upload.mockReturnValueOnce(upload.promise);
    const wrapper = await open();
    wrapper.unmount();
    upload.resolve({ id: 'child-file' });
    await flushPromises();
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('uses each exported key identity and never finishes an unacknowledged upload', async () => {
    mocks.upload.mockResolvedValue({});
    const wrapper = await open();
    expect(mocks.upload.mock.calls[0][0].options).toEqual({ name: child.meta.name, address: child.address });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(wrapper.find('[role=alert]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('retains the acknowledged Ethereum creation when primary creation needs retry', async () => {
    mocks.add.mockResolvedValueOnce(child.address).mockRejectedValueOnce(new Error('Public primary save failure')).mockResolvedValueOnce(root.address);
    const wrapper = await open();
    expect(wrapper.vm.creationError).toBe(true);
    expect(mocks.upload).not.toHaveBeenCalled();
    await wrapper.vm.proceed();
    expect(mocks.add).toHaveBeenCalledTimes(3);
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith(root.address);
    wrapper.unmount();
  });

  it('retries selection without duplicating either acknowledged upload', async () => {
    mocks.select.mockRejectedValueOnce(new Error('Public selection save failure')).mockResolvedValueOnce(undefined);
    const wrapper = await open();
    expect(wrapper.vm.creationError).toBe(true);
    expect(wrapper.vm.isFinished).toBe(false);
    await wrapper.vm.proceed();
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(wrapper.vm.isFinished).toBe(true);
    wrapper.unmount();
  });

  it('does not create the primary after leaving during child creation', async () => {
    const creation = deferred<string>();
    mocks.add.mockReturnValueOnce(creation.promise);
    const wrapper = await open();
    wrapper.unmount();
    creation.resolve(child.address);
    await flushPromises();
    expect(mocks.add).toHaveBeenCalledOnce();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

});
