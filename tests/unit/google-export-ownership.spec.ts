import { flushPromises, shallowMount } from '@vue/test-utils';
import { reactive } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ validate: vi.fn(), export: vi.fn(), create: vi.fn() }));
vi.mock('@/extension/messaging', () => ({ validatePassword: mocks.validate, exportJSON: mocks.export, createGoogleFile: mocks.create }));
import GoogleExportPopup from '@/screens/wallet&asset/wallet/GoogleExportPopup.vue';

const root = { address: 'public-root', encoded: 'public-encrypted-root', meta: { name: 'Root wallet', ethereumAddress: '0x1111111111111111111111111111111111111111' } };
const child = { address: root.meta.ethereumAddress, encoded: 'public-encrypted-child', meta: { name: 'Ethereum child' } };
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = <T>(promise: Promise<T>) => promise.then((value) => ({ value }), (error) => ({ error }));
const open = async () => {
  const route = reactive({ query: { wallet: root.address }, params: { access_token: 'public-test-token' } });
  const wrapper = shallowMount(GoogleExportPopup, { global: {
    mocks: { $route: route, $t: (key: string) => key },
    stubs: { Popup: { template: '<div><slot /></div>' }, Icon: true, ValidatedInput: true, Hint: true, Loader: true, FButton: true },
  } });
  await wrapper.setData({ password: 'Public fixture password' });
  return { wrapper, route };
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.validate.mockResolvedValue(true);
  mocks.export.mockImplementation(async (address: string) => ({ json: structuredClone(address === root.address ? root : child) }));
  mocks.create.mockImplementation(async ({ json }: { json: string }) => ({ id: JSON.parse(json).address === root.address ? 'root-file' : 'child-file' }));
});

describe('Google encrypted backup request ownership', () => {
  it('admits one confirmation while password validation is pending', async () => {
    const validation = deferred<boolean>();
    mocks.validate.mockReturnValue(validation.promise);
    const { wrapper } = await open();
    const first = settle(wrapper.vm.onConfirm());
    const second = settle(wrapper.vm.onConfirm());
    expect(mocks.validate).toHaveBeenCalledOnce();
    validation.resolve(true);
    await Promise.all([first, second]);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it.each(['unmount', 'route change'])('does not export or upload after %s during validation', async (mode) => {
    const validation = deferred<boolean>();
    mocks.validate.mockReturnValue(validation.promise);
    const { wrapper, route } = await open();
    const pending = settle(wrapper.vm.onConfirm());
    if (mode === 'unmount') wrapper.unmount();
    else route.query.wallet = 'different-public-wallet';
    validation.resolve(true);
    await pending;
    expect(mocks.export).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    if (mode !== 'unmount') wrapper.unmount();
  });

  it('shows a persistent retry state when encrypted export fails', async () => {
    mocks.export.mockRejectedValueOnce(new Error('Public fixture export failure'));
    const { wrapper } = await open();
    expect(await settle(wrapper.vm.onConfirm())).toHaveProperty('value');
    await flushPromises();
    expect(wrapper.vm.status).toBe('await');
    expect(wrapper.find('[role=alert]').exists()).toBe(true);
    expect(mocks.create).not.toHaveBeenCalled();
    await wrapper.vm.onConfirm();
    expect(wrapper.vm.status).toBe('uploaded');
    wrapper.unmount();
  });

  it('describes each encrypted file using its own identity and preserves parent linkage', async () => {
    const { wrapper } = await open();
    await wrapper.vm.onConfirm();
    const calls = mocks.create.mock.calls.map(([payload]) => payload);
    expect(calls[0]).toMatchObject({ json: JSON.stringify(child), options: { name: child.meta.name, address: child.address } });
    expect(calls[1]).toMatchObject({ json: JSON.stringify(root), options: { name: root.meta.name, address: `${root.address}/child-file` } });
    expect(calls.every((payload) => !('password' in payload.options))).toBe(true);
    wrapper.unmount();
  });

  it('retries the failed parent upload without duplicating its acknowledged child', async () => {
    mocks.create.mockResolvedValueOnce({ id: 'child-file' }).mockRejectedValueOnce(new Error('Public parent upload failure')).mockResolvedValueOnce({ id: 'root-file' });
    const { wrapper } = await open();
    await settle(wrapper.vm.onConfirm());
    expect(wrapper.vm.status).toBe('await');
    await wrapper.vm.onConfirm();
    expect(mocks.create).toHaveBeenCalledTimes(3);
    expect(mocks.create.mock.calls[2][0]).toMatchObject({ json: JSON.stringify(root), options: { address: `${root.address}/child-file` } });
    expect(wrapper.vm.status).toBe('uploaded');
    wrapper.unmount();
  });

  it('does not submit a parent after the popup is abandoned during child upload', async () => {
    const upload = deferred<{ id: string }>();
    mocks.create.mockReturnValueOnce(upload.promise);
    const { wrapper } = await open();
    const pending = settle(wrapper.vm.onConfirm());
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledOnce();
    wrapper.unmount();
    upload.resolve({ id: 'child-file' });
    await pending;
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it('does not show success when the upload reply has no file identifier', async () => {
    mocks.create.mockResolvedValue({});
    const { wrapper } = await open();
    expect(await settle(wrapper.vm.onConfirm())).toHaveProperty('value');
    await flushPromises();
    expect(wrapper.vm.status).toBe('await');
    expect(wrapper.find('[role=alert]').exists()).toBe(true);
    wrapper.unmount();
  });
});
