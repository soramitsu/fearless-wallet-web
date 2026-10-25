import { flushPromises, shallowMount } from '@vue/test-utils';
import { reactive } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ file: vi.fn(), files: vi.fn(), token: vi.fn() }));
vi.mock('@/extension/messaging', () => ({
  getGoogleFile: mocks.file,
  getGoogleFiles: mocks.files,
  verifyToken: mocks.token,
}));
vi.mock('@/screens/addWallet/BackupWalletsList.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/addWallet/google/FlowStepLayout.vue', () => ({ default: { template: '<div><slot /></div>' } }));
vi.mock('@/screens/addWallet/google/NegativeMessage.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/router/routes', () => ({ Components: { Wallet: 'Wallet', CreateGoogle: 'CreateGoogle' } }));
import AddFromGoogle from '@/screens/addWallet/google/AddFromGoogle.vue';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const open = async (route = reactive({ params: { access_token: 'public-test-token' } })) => {
  const wrapper = shallowMount(AddFromGoogle, {
    global: {
      config: { errorHandler: vi.fn() },
      stubs: { FButton: true },
      mocks: {
        $route: route,
        $router: { push: vi.fn().mockResolvedValue(undefined), replace: vi.fn().mockResolvedValue(undefined) },
        $t: (key: string) => key,
      },
    },
  });
  await flushPromises();
  return wrapper;
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.token.mockResolvedValue({ expires_in: '3600' });
  mocks.files.mockResolvedValue({
    files: [
      { id: 'root-file', name: 'Public fixture.json', description: 'publicParent/linkedFile' },
      { id: 'other-file', name: 'Other fixture.json', description: 'otherParent/otherLinked' },
    ],
  });
});

describe('Google backup file request ownership', () => {
  it('deduplicates each file request and stays loading until both declared files settle', async () => {
    const root = deferred<{ address: string }>();
    const linked = deferred<{ address: string }>();
    mocks.file.mockImplementation((id: string) => (id === 'root-file' ? root.promise : linked.promise));
    const wrapper = await open();
    const first = wrapper.vm.getFile('root-file', 0);
    const second = wrapper.vm.getFile('linkedFile', 0);
    await wrapper.vm.getFile('linkedFile', 0);
    expect(mocks.file).toHaveBeenCalledTimes(2);
    expect(wrapper.vm.files[0].isFileLoading).toBe(true);
    root.resolve({ address: 'publicParent' });
    await first;
    expect(wrapper.vm.files[0].json.address).toBe('publicParent');
    expect(wrapper.vm.files[0].isFileLoading).toBe(true);
    linked.resolve({ address: '0xPublicLinkedFixture' });
    await second;
    expect(wrapper.vm.files[0].ethJson.address).toBe('0xPublicLinkedFixture');
    expect(wrapper.vm.files[0].isFileLoading).toBe(false);
    wrapper.unmount();
  });

  it('binds a primary EVM backup by file ID and follows its row after reordering', async () => {
    const root = deferred<{ address: string }>();
    mocks.file.mockReturnValue(root.promise);
    const wrapper = await open();
    const request = wrapper.vm.getFile('root-file', 0);
    wrapper.vm.files.reverse();
    root.resolve({ address: '0xPublicPrimaryFixture' });
    await request;
    expect(wrapper.vm.files[1].json.address).toBe('0xPublicPrimaryFixture');
    expect(wrapper.vm.files[1].ethJson).toBeUndefined();
    expect(wrapper.vm.files[0].json).toBeUndefined();
    wrapper.unmount();
  });

  it('keeps a missing linked file retryable without dropping the loaded parent', async () => {
    mocks.file.mockResolvedValueOnce({ address: 'publicParent' }).mockRejectedValueOnce(new Error('download failed'));
    const wrapper = await open();
    await wrapper.vm.getFile('root-file', 0);
    await wrapper.vm.getFile('linkedFile', 0);
    expect(wrapper.vm.files[0]).toMatchObject({
      json: { address: 'publicParent' },
      fileLoadError: true,
      isFileLoading: false,
    });
    mocks.file.mockResolvedValueOnce({ address: '0xPublicLinkedFixture' });
    await wrapper.vm.getFile('linkedFile', 0);
    expect(wrapper.vm.files[0]).toMatchObject({
      ethJson: { address: '0xPublicLinkedFixture' },
      fileLoadError: false,
      isFileLoading: false,
    });
    wrapper.unmount();
  });

  it('ignores a file that arrives after leaving and rejects unrelated requested IDs', async () => {
    const root = deferred<{ address: string }>();
    mocks.file.mockReturnValue(root.promise);
    const wrapper = await open();
    await wrapper.vm.getFile('unrelated-file', 0);
    expect(mocks.file).not.toHaveBeenCalled();
    const request = wrapper.vm.getFile('root-file', 0);
    const state = wrapper.vm.$data;
    wrapper.unmount();
    root.resolve({ address: 'publicParent' });
    await request;
    expect(state.files[0].json).toBeUndefined();
  });
});


describe('Google backup inventory', () => {
  it('keeps standalone, linked, orphan and legacy encrypted files individually reachable', async () => {
    mocks.files.mockResolvedValue({ files: [
      { id: 'parent', name: 'Parent.with.dots.json', description: 'publicParent/child' },
      { id: 'child', name: 'Linked Ethereum.json', description: '0xPublicChild' },
      { id: 'orphan', name: 'Interrupted backup.json', description: '0xOrphan' },
      { id: 'standalone', name: 'Standalone.json', description: 'publicStandalone' },
      { id: 'legacy', name: 'Legacy.json', description: '' },
      { id: 'missing', name: 'Missing metadata.json' },
    ] });
    const wrapper = await open();
    expect(wrapper.vm.files.map((file) => file.id)).toEqual(['parent', 'child', 'orphan', 'standalone', 'legacy', 'missing']);
    expect(wrapper.vm.files[0]).toMatchObject({ name: 'Parent.with.dots', ethWalletID: 'child' });
    wrapper.unmount();
  });

  it('leaves inventory failure retryable instead of an endless loading state', async () => {
    mocks.files.mockRejectedValueOnce(new Error('Public fixture list failure'));
    const wrapper = await open();
    expect(wrapper.vm.isLoading).toBe(false);
    expect(wrapper.vm.buttonText).toBe('ux.retry');
    expect(wrapper.vm.isAllowedContinue).toBe(false);
    await wrapper.vm.proceed();
    await flushPromises();
    expect(wrapper.vm.files).toHaveLength(2);
    wrapper.unmount();
  });
});


describe('Google backup inventory generations', () => {
  it('does not let an old file completion release the new token download for the same ID', async () => {
    const oldFile = deferred<{ address: string }>();
    const newFile = deferred<{ address: string }>();
    mocks.file.mockReturnValueOnce(oldFile.promise).mockReturnValue(newFile.promise);
    const route = reactive({ params: { access_token: 'public-test-token' } });
    const wrapper = await open(route);
    const oldRequest = wrapper.vm.getFile('root-file', 0);
    route.params.access_token = 'public-replacement-token';
    await flushPromises();
    const newRequest = wrapper.vm.getFile('root-file', 0);
    oldFile.resolve({ address: 'old-public-address' });
    await oldRequest;
    void wrapper.vm.getFile('root-file', 0);
    expect(mocks.file).toHaveBeenCalledTimes(2);
    expect(wrapper.vm.files[0].json).toBeUndefined();
    expect(wrapper.vm.files[0].isFileLoading).toBe(true);
    newFile.resolve({ address: 'new-public-address' });
    await newRequest;
    expect(wrapper.vm.files[0].json.address).toBe('new-public-address');
    wrapper.unmount();
  });

  it('ignores the old inventory response after changing tokens', async () => {
    const oldList = deferred<{ files: unknown[] }>();
    mocks.files.mockReturnValueOnce(oldList.promise);
    const route = reactive({ params: { access_token: 'public-test-token' } });
    const wrapper = await open(route);
    route.params.access_token = 'public-replacement-token';
    await flushPromises();
    oldList.resolve({ files: [] });
    await flushPromises();
    expect(wrapper.vm.files).toHaveLength(2);
    expect(wrapper.vm.$router.push).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
