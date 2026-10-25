import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditNodeForm from '@/screens/accounts/EditNodeForm.vue';

const io = vi.hoisted(() => ({ save: vi.fn(), network: { name: 'Polkadot', nodes: [{ name: 'Public', url: 'wss://public.invalid' }],
  customNodes: [] as Array<{ name: string; url: string }>, currentProvider: 'wss://public.invalid', isManual: false } }));
vi.mock('@/extension/messaging', () => ({ upsertNetworkMap: io.save }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ getNetwork: () => io.network }) }));

const wrappers: ReturnType<typeof mount>[] = [];
const open = async (onCloseForm = vi.fn(), props = {}) => {
  const wrapper = mount(EditNodeForm, { props: { network: 'Polkadot', onCloseForm, ...props }, global: { mocks: { $t: (key: string) => key },
    stubs: { AboveForm: { template: '<div><slot /></div>' }, FInput: true, ValidatedInput: true,
      FButton: { props: ['disabled'], template: '<button :disabled="disabled" @click="$emit(\'click\')">Save</button>' } } } });
  wrappers.push(wrapper);
  await wrapper.setData({ name: 'Personal', url: 'wss://personal.invalid' });
  return wrapper;
};

describe('node editor acknowledgement', () => {
  beforeEach(() => { vi.resetAllMocks(); io.network.customNodes = []; io.network.currentProvider = 'wss://public.invalid'; io.network.isManual = false; });
  afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); });

  it('keeps the editor and current settings unchanged while saving, then closes after acknowledgement', async () => {
    let acknowledge!: () => void;
    io.save.mockReturnValue(new Promise<void>((resolve) => { acknowledge = resolve; }));
    const wrapper = await open();
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('closeForm')).toBeUndefined();
    expect(io.network.customNodes).toEqual([]);
    await wrapper.get('button').trigger('click');
    expect(io.save).toHaveBeenCalledOnce();
    acknowledge(); await flushPromises();
    expect(wrapper.emitted('closeForm')).toEqual([[true]]);
    wrapper.unmount();
  });

  it('keeps failure visible and supports retry without applying the unsaved edit', async () => {
    io.save.mockRejectedValueOnce(new Error('storage unavailable')).mockResolvedValueOnce(undefined);
    const wrapper = await open();
    await wrapper.get('button').trigger('click'); await flushPromises();
    expect(wrapper.emitted('closeForm')).toBeUndefined();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(io.network.customNodes).toEqual([]);
    await wrapper.get('button').trigger('click'); await flushPromises();
    expect(wrapper.emitted('closeForm')).toEqual([[true]]);
    wrapper.unmount();
  });

  it('does not dismiss a later view when a removed editor receives its saved result', async () => {
    let acknowledge!: () => void;
    io.save.mockReturnValue(new Promise<void>((resolve) => { acknowledge = resolve; }));
    const close = vi.fn();
    const wrapper = await open(close);
    await wrapper.get('button').trigger('click');
    expect(io.save).toHaveBeenCalledOnce();
    wrapper.unmount(); acknowledge(); await flushPromises();
    expect(close).not.toHaveBeenCalled();
  });

  it('locks the submitted inputs while storage acknowledgement is pending', async () => {
    let acknowledge!: () => void;
    io.save.mockReturnValue(new Promise<void>((resolve) => { acknowledge = resolve; }));
    const wrapper = await open();
    await wrapper.get('button').trigger('click');
    expect(wrapper.get('[data-testid="name"]').attributes('disabled')).toBe('true');
    expect(wrapper.get('[data-testid="urlAddress"]').attributes('disabled')).toBe('true');
    acknowledge(); await flushPromises();
  });

  it('rejects a mounted editor after another editor changes its node and selection', async () => {
    io.network.customNodes = [{ name: 'Old', url: 'wss://same.invalid' }];
    io.network.currentProvider = 'wss://same.invalid';
    io.network.isManual = true;
    const wrapper = await open(vi.fn(), { nodeName: 'Old', nodeUrl: 'wss://same.invalid', isActive: true });
    io.network.customNodes = [{ name: 'Renamed', url: 'wss://same.invalid' }];
    io.network.currentProvider = 'wss://public.invalid';
    io.network.isManual = false;
    await wrapper.setData({ name: 'My new name', url: 'wss://same.invalid' });
    await wrapper.get('button').trigger('click'); await flushPromises();
    expect(io.save).not.toHaveBeenCalled();
    expect(wrapper.emitted('closeForm')).toBeUndefined();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(io.network.customNodes).toEqual([{ name: 'Renamed', url: 'wss://same.invalid' }]);
    expect(io.network.currentProvider).toBe('wss://public.invalid');
    wrapper.unmount();
    const reopened = await open(vi.fn(), { nodeName: 'Renamed', nodeUrl: 'wss://same.invalid', isActive: false });
    await reopened.setData({ name: 'My new name', url: 'wss://same.invalid' });
    await reopened.get('button').trigger('click'); await flushPromises();
    expect(io.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      customNodes: [{ name: 'My new name', url: 'wss://same.invalid' }], currentProvider: 'wss://public.invalid', isManual: false,
    }), expect.objectContaining({ customNodes: [{ name: 'Renamed', url: 'wss://same.invalid' }] }));
    expect(reopened.emitted('closeForm')).toEqual([[true]]);
  });
});
