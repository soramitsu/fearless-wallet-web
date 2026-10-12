import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, reactive } from 'vue';

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn(),
  updateAuthorization: vi.fn(),
  route: null as unknown as { params: Record<string, string> },
  extension: null as unknown as {
    authList: Record<string, ReturnType<typeof entry>>;
    getAuthList: ReturnType<typeof vi.fn>;
    deleteAuthRequests: ReturnType<typeof vi.fn>;
  },
  accounts: null as unknown as { accounts: Array<{ name: string; address: string; ethereumAddress?: string }> },
}));
vi.mock('vue-router', () => ({ useRoute: () => mocks.route, useRouter: () => mocks }));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => mocks.extension }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => mocks.accounts }));
vi.mock('@/extension/messaging', () => ({ updateAuthorization: mocks.updateAuthorization }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, tc: (key: string) => key }) }));
vi.mock('@/router/routes', () => ({ Components: { DAppDetails: 'DAppDetails' } }));

import DAppsAuths from '@/screens/extension-ui/DAppsAuths.vue';
import DAppDetails from '@/screens/extension-ui/DAppDetails.vue';
import AuthItem from '@/screens/extension-ui/AuthItem.vue';
import SelectAuthAccountForm from '@/screens/extension-ui/authorize/SelectAuthAccountForm.vue';

const origin = 'https://public.example.invalid';
const entry = () => ({
  id: 'public-request-id',
  url: origin,
  isAllowed: true,
  accountAuthType: 'both',
  authorizedAccounts: ['public-substrate-one'],
  evmAuthorizedAccount: '0x1111111111111111111111111111111111111111',
});
const deferred = () => {
  let resolve!: (value?: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const global = {
  mocks: { $t: (key: string) => key },
  stubs: {
    Fragment: { template: '<div><slot /></div>' },
    Icon: { template: '<span />' },
    ExternalLogo: { template: '<span />' },
    FButton: {
      name: 'FButton',
      props: ['disabled', 'loading', 'text'],
      emits: ['click'],
      template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ text }}</button>',
    },
    SelectAuthAccountForm: {
      props: ['accounts', 'disabled', 'showSelectAll'],
      emits: ['onSelect', 'onSelectAll'],
      template: '<div />',
    },
  },
};
const mountList = () => mount(DAppsAuths, { global });
const mountDetails = () => mount(DAppDetails, { global });
const remove = (wrapper: ReturnType<typeof mountList>) => wrapper.getComponent(AuthItem).vm.$emit('remove', origin);
const submit = (wrapper: ReturnType<typeof mountDetails>) => wrapper.get('.connect-button').trigger('click');

describe('connection management durable acknowledgement', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.route = reactive({ params: { type: 'substrate', id: origin } });
    mocks.extension = reactive({
      authList: { [origin]: entry() },
      getAuthList: vi.fn().mockResolvedValue(undefined),
      deleteAuthRequests: vi.fn().mockResolvedValue(undefined),
    });
    mocks.accounts = reactive({
      accounts: [
        {
          name: 'Public one',
          address: 'public-substrate-one',
          ethereumAddress: '0x1111111111111111111111111111111111111111',
        },
        {
          name: 'Public two',
          address: 'public-substrate-two',
          ethereumAddress: '0x2222222222222222222222222222222222222222',
        },
      ],
    });
    mocks.updateAuthorization.mockResolvedValue(undefined);
  });

  it('waits for removal, blocks duplicate events and details navigation, and never refreshes a pending veto away', async () => {
    const write = deferred();
    mocks.extension.deleteAuthRequests.mockReturnValue(write.promise);
    const wrapper = mountList();
    await flushPromises();
    remove(wrapper);
    remove(wrapper);
    wrapper.getComponent(AuthItem).vm.$emit('openAuthDetails', origin);
    await nextTick();
    expect(mocks.extension.deleteAuthRequests).toHaveBeenCalledTimes(1);
    expect(mocks.extension.getAuthList).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(wrapper.getComponent(AuthItem).props('disabled')).toBe(true);
    write.resolve();
    await flushPromises();
  });

  it('keeps a failed removal visible and permits an explicit retry without claiming an empty list', async () => {
    mocks.extension.deleteAuthRequests.mockRejectedValueOnce(new Error('PRIVATE QUOTA DETAIL'));
    const wrapper = mountList();
    await flushPromises();
    remove(wrapper);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).not.toContain('PRIVATE');
    expect(wrapper.findComponent(AuthItem).exists()).toBe(true);
    expect(mocks.extension.getAuthList).toHaveBeenCalledTimes(1);
    remove(wrapper);
    await flushPromises();
    expect(mocks.extension.deleteAuthRequests).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('exposes read failure separately from no connections and retries the read', async () => {
    mocks.extension.authList = {};
    mocks.extension.getAuthList.mockRejectedValueOnce(new Error('disk read'));
    const wrapper = mountList();
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('authorize.noconnections');
    await wrapper.get('[data-testid="retryConnectionRead"]').trigger('click');
    await flushPromises();
    expect(mocks.extension.getAuthList).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('authorize.noconnections');
  });

  it('does not expose cached rows before the current read succeeds', async () => {
    const read = deferred();
    mocks.extension.getAuthList.mockReturnValue(read.promise);
    const wrapper = mountList();
    expect(wrapper.findComponent(AuthItem).exists()).toBe(false);
    expect(wrapper.text()).not.toContain('authorize.noconnections');
    read.resolve();
    await flushPromises();
    expect(wrapper.findComponent(AuthItem).exists()).toBe(true);
  });

  it('uses native labelled, disabled removal and details controls', async () => {
    const wrapper = mount(AuthItem, { props: { url: entry().url, authorizedAccounts: [], disabled: true }, global });
    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.attributes('disabled') !== undefined)).toBe(true);
    expect(buttons[1].attributes('aria-label')).toContain(origin);
    await buttons[1].trigger('click');
    expect(wrapper.emitted('remove')).toBeUndefined();
  });

  it('holds the displayed selection through a pending save and accepts only one submission', async () => {
    const write = deferred();
    mocks.updateAuthorization.mockReturnValue(write.promise);
    const wrapper = mountDetails();
    await flushPromises();
    await submit(wrapper);
    wrapper.getComponent(SelectAuthAccountForm).vm.$emit('onSelect', true, 'public-substrate-two');
    wrapper.getComponent(SelectAuthAccountForm).vm.$emit('onSelectAll', false);
    await submit(wrapper);
    expect(mocks.updateAuthorization).toHaveBeenCalledTimes(1);
    expect(mocks.updateAuthorization).toHaveBeenCalledWith(['public-substrate-one'], origin, 'substrate');
    expect(wrapper.getComponent(SelectAuthAccountForm).props('disabled')).toBe(true);
    expect(wrapper.getComponent(SelectAuthAccountForm).props('accounts')['public-substrate-one'].active).toBe(true);
    expect(mocks.back).not.toHaveBeenCalled();
    write.resolve();
    await flushPromises();
    expect(mocks.back).toHaveBeenCalledTimes(1);
  });

  it('retains selection and shows a generic error after save failure; only retry can navigate', async () => {
    mocks.updateAuthorization.mockRejectedValueOnce(new Error('PRIVATE storage detail'));
    const wrapper = mountDetails();
    await flushPromises();
    await submit(wrapper);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).not.toContain('PRIVATE');
    expect(mocks.back).not.toHaveBeenCalled();
    expect(mocks.extension.getAuthList).toHaveBeenCalledTimes(1);
    expect(wrapper.getComponent(SelectAuthAccountForm).props('accounts')['public-substrate-one'].active).toBe(true);
    await submit(wrapper);
    await flushPromises();
    expect(mocks.updateAuthorization).toHaveBeenCalledTimes(2);
    expect(mocks.back).toHaveBeenCalledTimes(1);
  });

  it.each(['missing entry', 'read failure'])(
    'keeps %s non-actionable until a successful explicit read',
    async (failure) => {
      if (failure === 'missing entry') mocks.extension.authList = {};
      else mocks.extension.getAuthList.mockRejectedValueOnce(new Error('disk read'));
      const wrapper = mountDetails();
      await flushPromises();
      expect(wrapper.find('[role="alert"]').exists()).toBe(true);
      expect(wrapper.find('.connect-button').exists()).toBe(false);
      mocks.extension.authList = { [origin]: entry() };
      await wrapper.get('[data-testid="retryConnectionRead"]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(wrapper.find('.connect-button').exists()).toBe(true);
    }
  );

  it('ignores unknown account events and blocks empty selections at the handler boundary', async () => {
    const wrapper = mountDetails();
    await flushPromises();
    wrapper.getComponent(SelectAuthAccountForm).vm.$emit('onSelect', true, 'unknown');
    wrapper.getComponent(SelectAuthAccountForm).vm.$emit('onSelectAll', false);
    // Emit directly, bypassing the disabled native button.
    wrapper.getComponent({ name: 'FButton' }).vm.$emit('click');
    await flushPromises();
    expect(mocks.updateAuthorization).not.toHaveBeenCalled();
  });

  it('cannot apply the previous origin selection during a synchronous route replacement', async () => {
    const wrapper = mountDetails();
    await flushPromises();
    mocks.route.params.id = 'next.example.invalid';
    wrapper.getComponent({ name: 'FButton' }).vm.$emit('click');
    await flushPromises();
    expect(mocks.updateAuthorization).not.toHaveBeenCalled();
  });

  it.each(['route change', 'unmount', 'account change'])(
    'does not navigate on late save completion after %s',
    async (change) => {
      const write = deferred();
      mocks.updateAuthorization.mockReturnValue(write.promise);
      const wrapper = mountDetails();
      await flushPromises();
      await submit(wrapper);
      if (change === 'route change') mocks.route.params.id = 'next.example.invalid';
      if (change === 'unmount') wrapper.unmount();
      if (change === 'account change')
        mocks.accounts.accounts[0].ethereumAddress = '0x3333333333333333333333333333333333333333';
      write.resolve();
      await flushPromises();
      expect(mocks.back).not.toHaveBeenCalled();
    }
  );

  it('submits only the newly selected EVM identity and never treats Select All as EVM consent', async () => {
    mocks.route.params.type = 'evm';
    mocks.accounts.accounts.push({ name: 'Substrate only', address: 'public-substrate-three' });
    const wrapper = mountDetails();
    await flushPromises();
    const form = wrapper.getComponent(SelectAuthAccountForm);
    expect(Object.keys(form.props('accounts'))).toHaveLength(2);
    form.vm.$emit('onSelectAll', true);
    form.vm.$emit('onSelect', true, 'public-substrate-two');
    await submit(wrapper);
    await flushPromises();
    expect(mocks.updateAuthorization).toHaveBeenCalledWith(
      ['0x2222222222222222222222222222222222222222'],
      origin,
      'evm'
    );
  });

  it('does not revive an earlier save after the route changes away and back', async () => {
    const write = deferred();
    mocks.updateAuthorization.mockReturnValue(write.promise);
    const wrapper = mountDetails();
    await flushPromises();
    await submit(wrapper);
    mocks.route.params.id = 'https://next.example.invalid';
    mocks.route.params.id = origin;
    await flushPromises();
    write.resolve();
    await flushPromises();
    expect(mocks.back).not.toHaveBeenCalled();
  });

  it('treats the durable save acknowledgement as success without a second fallible read', async () => {
    mocks.extension.getAuthList.mockResolvedValueOnce(undefined).mockRejectedValue(new Error('read after commit'));
    const wrapper = mountDetails();
    await flushPromises();
    await submit(wrapper);
    await flushPromises();
    expect(mocks.back).toHaveBeenCalledTimes(1);
    expect(mocks.updateAuthorization).toHaveBeenCalledTimes(1);
    expect(mocks.extension.getAuthList).toHaveBeenCalledTimes(1);
  });
});
