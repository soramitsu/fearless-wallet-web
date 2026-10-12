import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MetadataRequest } from '@extension-base/background/types/types';
import FButton from '@/components/FButton.vue';
import Metadata from '@/screens/extension-ui/metadata/Metadata.vue';

type Fixture = {
  metaRequests: MetadataRequest[];
  approveMetaRequests: ReturnType<typeof vi.fn>;
  rejectMetaRequests: ReturnType<typeof vi.fn>;
};
const mocks = vi.hoisted(() => ({
  approve: vi.fn(),
  reject: vi.fn(),
  push: vi.fn(),
  store: undefined as unknown as Fixture,
}));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => mocks.store }));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push, currentRoute: { value: { name: 'MetaRequest' } } }),
}));
vi.mock('@/router/routes', () => ({ Components: { Wallet: 'Wallet', MetaRequest: 'MetaRequest' } }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
const request = (id: string): MetadataRequest => ({
  id,
  url: `https://${id}.example`,
  request: {
    chain: `Public ${id}`,
    icon: 'polkadot',
    ss58Format: 0,
    types: {},
    genesisHash: '0x1234',
    specVersion: 12,
    tokenDecimals: 10,
    tokenSymbol: 'DOT',
    metaCalls: '0xabcdef',
  },
});
const Button = {
  props: ['text', 'disabled'],
  emits: ['click'],
  template: '<button type="button" :aria-disabled="disabled" @click="$emit(\'click\')">{{ text }}</button>',
};
const open = (realControls = false) =>
  mount(Metadata, {
    attachTo: realControls ? document.body : undefined,
    global: {
      mocks: { $t: (key: string) => key, $router: { push: mocks.push } },
      stubs: {
        AboveForm: {
          name: 'AboveForm',
          props: ['showCloseIcon'],
          emits: ['closeHandler'],
          template: '<main><slot /></main>',
        },
        FButton: realControls ? FButton : Button,
        Icon: true,
        Alert: { template: '<div><slot /></div>' },
        FCorners: { template: '<div><slot /></div>' },
      },
    },
  });
const approve = (wrapper: ReturnType<typeof open>) =>
  wrapper
    .findAllComponents(Button)
    .find((entry) => ['common.approve', 'metadata.appAccess'].includes(entry.props('text')))!;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.approve.mockResolvedValue(undefined);
  mocks.reject.mockResolvedValue(undefined);
  mocks.push.mockResolvedValue(undefined);
  mocks.store = reactive({
    metaRequests: [request('first')],
    approveMetaRequests: mocks.approve,
    rejectMetaRequests: mocks.reject,
  });
});

describe('metadata approval request ownership', () => {
  it('handles an empty queue without dereferencing a missing request', async () => {
    mocks.store.metaRequests = [];
    const wrapper = open();
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Wallet' });
    expect(approve(wrapper)).toBeUndefined();
    wrapper.unmount();
  });

  it('guards duplicate approval and rejection while the captured metadata is pending', async () => {
    let resolve!: () => void;
    mocks.approve.mockReturnValueOnce(
      new Promise<void>((done) => {
        resolve = done;
      })
    );
    const wrapper = open();
    await approve(wrapper).trigger('click');
    await approve(wrapper).trigger('click');
    wrapper.getComponent({ name: 'AboveForm' }).vm.$emit('closeHandler');
    await flushPromises();
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith(request('first'));
    expect(mocks.reject).not.toHaveBeenCalled();
    resolve();
    await flushPromises();
    wrapper.unmount();
  });

  it.each(['new ID', 'same ID with changed payload'])(
    'does not approve replacement metadata from the old rendered control: %s',
    async (change) => {
      const wrapper = open();
      await flushPromises();
      const oldApprove = approve(wrapper);
      mocks.store.metaRequests = [
        change === 'new ID'
          ? request('second')
          : { ...request('first'), request: { ...request('first').request, metaCalls: '0x9999' } },
      ];
      expect(wrapper.text()).toContain('Public first');
      oldApprove.vm.$emit('click');
      expect(mocks.approve).not.toHaveBeenCalled();
      await flushPromises();
      await approve(wrapper).trigger('click');
      expect(mocks.approve).toHaveBeenCalledExactlyOnceWith(mocks.store.metaRequests[0]);
      wrapper.unmount();
    }
  );

  it('shows a retryable failure only for the same metadata request', async () => {
    mocks.approve.mockRejectedValueOnce(new Error('worker unavailable'));
    const wrapper = open();
    await approve(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    await approve(wrapper).trigger('click');
    expect(mocks.approve).toHaveBeenCalledTimes(2);
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not show an older failure on replacement metadata', async () => {
    let reject!: (reason: Error) => void;
    mocks.approve.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      })
    );
    const wrapper = open();
    await approve(wrapper).trigger('click');
    mocks.store.metaRequests = [request('second')];
    reject(new Error('old request expired'));
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('https://second.example');
    expect(mocks.push).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('closes raw metadata when a different request arrives, including a reused request ID', async () => {
    const wrapper = open();
    const details = wrapper.get('details');
    (details.element as HTMLDetailsElement).open = true;
    await details.trigger('toggle');
    expect(wrapper.get('pre').text()).toContain('0xabcdef');
    mocks.store.metaRequests = [{ ...request('first'), request: { ...request('first').request, metaCalls: '0x9999' } }];
    await flushPromises();
    expect((wrapper.get('details').element as HTMLDetailsElement).open).toBe(false);
    expect(wrapper.find('pre').exists()).toBe(false);
    (wrapper.get('details').element as HTMLDetailsElement).open = true;
    await wrapper.get('details').trigger('toggle');
    expect(wrapper.get('pre').text()).toContain('0x9999');
    expect(wrapper.get('pre').text()).not.toContain('0xabcdef');
    wrapper.unmount();
  });

  it('defaults to Reject again when replacement metadata outlives an older pending response', async () => {
    let reject!: (reason: Error) => void;
    mocks.approve.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      })
    );
    const wrapper = open(true);
    await flushPromises();
    const rejectButton = wrapper.get('[data-testid="rejectMetadata"] button');
    expect(document.activeElement).toBe(rejectButton.element);
    const approveButton = wrapper.get('[data-testid="approveMetadata"] button');
    (approveButton.element as HTMLButtonElement).focus();
    await approveButton.trigger('click');
    mocks.store.metaRequests = [request('second')];
    await flushPromises();
    expect((rejectButton.element as HTMLButtonElement).disabled).toBe(true);
    reject(new Error('old request expired'));
    await flushPromises();
    expect(document.activeElement).toBe(rejectButton.element);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('leaves when the active request disappears and removes its approval control', async () => {
    const wrapper = open();
    mocks.store.metaRequests = [];
    await flushPromises();
    expect(approve(wrapper)).toBeUndefined();
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Wallet' });
    wrapper.unmount();
  });

  it('rejects only once and ignores completion after unmount', async () => {
    let resolve!: () => void;
    mocks.reject.mockReturnValueOnce(
      new Promise<void>((done) => {
        resolve = done;
      })
    );
    const wrapper = open();
    const sheet = wrapper.getComponent({ name: 'AboveForm' });
    sheet.vm.$emit('closeHandler');
    sheet.vm.$emit('closeHandler');
    await flushPromises();
    expect(mocks.reject).toHaveBeenCalledExactlyOnceWith(request('first'));
    wrapper.unmount();
    resolve();
    await flushPromises();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
