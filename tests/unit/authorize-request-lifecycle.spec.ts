import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountJson, AuthorizeRequest } from '@extension-base/background/types/types';
import type { WalletInfo } from '@/stores';
import Authorize from '@/screens/extension-ui/authorize/Authorize.vue';
import SelectAuthAccountForm from '@/screens/extension-ui/authorize/SelectAuthAccountForm.vue';
import Checkbox from '@/components/Checkbox.vue';

type ExtensionFixture = {
  authRequests: AuthorizeRequest[];
  approveAuthRequests: ReturnType<typeof vi.fn>;
  rejectAuthRequests: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => ({
  approve: vi.fn(),
  reject: vi.fn(),
  push: vi.fn(),
  extension: undefined as unknown as ExtensionFixture,
  accounts: undefined as unknown as { accounts: AccountJson[] },
}));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => mocks.extension }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => mocks.accounts }));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push, currentRoute: { value: { name: 'Authorize' } } }),
}));
vi.mock('@/router/routes', () => ({ Components: { Wallet: 'Wallet', Authorize: 'Authorize' } }));
vi.mock('@/consts/globalClient', () => ({ IS_POPUP: true }));
vi.mock('@/util/iroha', () => ({ encodeIrohaI105Address: () => '' }));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => (key === 'authorize.authWarningMessage' ? 'Application {name} from {link}' : key),
  }),
}));

const account = (id: string) =>
  ({ address: id, name: id, ethereumAddress: `0x${id}`, solanaAddress: `sol-${id}` }) as AccountJson;
const request = (id: string) =>
  ({ id, url: `https://${id}.example`, request: { origin: id, accountAuthType: 'evm' } }) as AuthorizeRequest;
const Button = {
  props: ['text', 'disabled'],
  emits: ['click'],
  template: '<button type="button" :aria-disabled="disabled" @click="$emit(\'click\')">{{ text }}</button>',
};
const open = () =>
  mount(Authorize, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        AboveForm: {
          name: 'AboveForm',
          props: ['showCloseIcon'],
          emits: ['closeHandler'],
          template: '<main><slot /></main>',
        },
        Alert: { template: '<div><slot /></div>' },
        FButton: Button,
        SelectAuthAccountForm: true,
      },
    },
  });
const form = (wrapper: ReturnType<typeof open>) => wrapper.getComponent(SelectAuthAccountForm);
const selected = (wrapper: ReturnType<typeof open>) =>
  Object.values(form(wrapper).props('accounts') as Record<string, WalletInfo>)
    .filter((entry) => entry.active)
    .map((entry) => entry.address);
const approve = (wrapper: ReturnType<typeof open>) =>
  wrapper.findAllComponents(Button).find((entry) => entry.props('text') === 'common.approve')!;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.extension = reactive({
    authRequests: [request('first')],
    approveAuthRequests: mocks.approve,
    rejectAuthRequests: mocks.reject,
  });
  mocks.accounts = reactive({ accounts: [account('alice'), account('bob')] });
  mocks.approve.mockResolvedValue(undefined);
  mocks.reject.mockResolvedValue(undefined);
  mocks.push.mockResolvedValue(undefined);
});

describe('authorization screen request ownership', () => {
  it('guards a directly activated unavailable approval and rejects unknown row selections', async () => {
    const wrapper = open();
    await approve(wrapper).trigger('click');
    expect(mocks.approve).not.toHaveBeenCalled();
    form(wrapper).vm.$emit('onSelect', true, 'unknown');
    await flushPromises();
    expect(selected(wrapper)).toEqual([]);
    wrapper.unmount();
  });

  it('resets account selection when the next requesting origin arrives', async () => {
    const wrapper = open();
    form(wrapper).vm.$emit('onSelect', true, 'alice');
    await flushPromises();
    expect(selected(wrapper)).toEqual(['alice']);
    mocks.extension.authRequests = [request('second')];
    await flushPromises();
    expect(selected(wrapper)).toEqual([]);
    expect(wrapper.text()).toContain('https://second.example');
    await approve(wrapper).trigger('click');
    expect(mocks.approve).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('removes accounts that disappear or lose the requested ecosystem before approval', async () => {
    const wrapper = open();
    form(wrapper).vm.$emit('onSelect', true, 'alice');
    mocks.accounts.accounts = [account('bob')];
    await flushPromises();
    expect(Object.keys(form(wrapper).props('accounts'))).toEqual(['bob']);
    await approve(wrapper).trigger('click');
    expect(mocks.approve).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('drops selection when an account address changes or a request reuses its ID with a different origin', async () => {
    const wrapper = open();
    form(wrapper).vm.$emit('onSelect', true, 'alice');
    mocks.accounts.accounts[0].ethereumAddress = '0xchanged';
    await flushPromises();
    expect(selected(wrapper)).toEqual([]);
    form(wrapper).vm.$emit('onSelect', true, 'alice');
    mocks.extension.authRequests[0].url = 'https://different.example';
    await flushPromises();
    expect(selected(wrapper)).toEqual([]);
    wrapper.unmount();
  });

  it('preserves the Substrate multi-account choice as the inventory refreshes', async () => {
    mocks.extension.authRequests[0].request.accountAuthType = 'substrate';
    const wrapper = open();
    expect(selected(wrapper)).toEqual(['alice', 'bob']);
    form(wrapper).vm.$emit('onSelect', false, 'alice');
    mocks.accounts.accounts = [account('alice'), account('bob')];
    await flushPromises();
    expect(selected(wrapper)).toEqual(['bob']);
    await approve(wrapper).trigger('click');
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith({ id: 'first', accounts: ['bob'] });
    wrapper.unmount();
  });

  it('displays and submits the exact allowed Iroha network address', async () => {
    mocks.extension.authRequests[0].request.accountAuthType = 'iroha';
    mocks.extension.authRequests[0].request.allowedAccounts = ['taira-allowed'];
    mocks.accounts.accounts = [{ ...account('taira-allowed'), irohaAddress: 'nexus-other' }];
    const wrapper = open();
    expect(form(wrapper).props('accounts')['taira-allowed'].irohaAddress).toBe('taira-allowed');
    form(wrapper).vm.$emit('onSelect', true, 'taira-allowed');
    await approve(wrapper).trigger('click');
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith({ id: 'first', accounts: ['taira-allowed'] });
    wrapper.unmount();
  });

  it('submits once, blocks changing selection or rejection while pending, and retries a failure', async () => {
    let reject!: (error: Error) => void;
    mocks.approve.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      })
    );
    const wrapper = open();
    form(wrapper).vm.$emit('onSelect', true, 'alice');
    await flushPromises();
    await approve(wrapper).trigger('click');
    await approve(wrapper).trigger('click');
    form(wrapper).vm.$emit('onSelect', true, 'bob');
    wrapper.getComponent({ name: 'AboveForm' }).vm.$emit('closeHandler');
    await flushPromises();
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith({ id: 'first', accounts: ['alice'] });
    expect(mocks.reject).not.toHaveBeenCalled();
    expect(selected(wrapper)).toEqual(['alice']);
    expect(mocks.push).not.toHaveBeenCalled();
    reject(new Error('worker unavailable'));
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    await approve(wrapper).trigger('click');
    expect(mocks.approve).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('does not dismiss the next origin or show an older request failure', async () => {
    let reject!: (error: Error) => void;
    mocks.approve.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      })
    );
    const wrapper = open();
    form(wrapper).vm.$emit('onSelect', true, 'alice');
    await flushPromises();
    await approve(wrapper).trigger('click');
    mocks.extension.authRequests = [request('second')];
    await flushPromises();
    reject(new Error('old request disappeared'));
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(selected(wrapper)).toEqual([]);
    wrapper.unmount();
  });

  it('leaves safely when the queue empties and never approves a missing request', async () => {
    const wrapper = open();
    mocks.extension.authRequests = [];
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Wallet' });
    expect(wrapper.findAllComponents(Button).some((entry) => entry.props('text') === 'common.approve')).toBe(false);
    wrapper.unmount();
  });

  it('rejects the captured request once and does not navigate after unmount', async () => {
    let resolve!: () => void;
    mocks.reject.mockReturnValueOnce(
      new Promise<void>((done) => {
        resolve = done;
      })
    );
    const wrapper = open();
    const reject = wrapper.getComponent({ name: 'AboveForm' });
    reject.vm.$emit('closeHandler');
    reject.vm.$emit('closeHandler');
    await flushPromises();
    expect(mocks.reject).toHaveBeenCalledExactlyOnceWith('first');
    wrapper.unmount();
    resolve();
    await flushPromises();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe('authorization account presentation', () => {
  it.each(['evm', 'solana', 'iroha', 'substrate'] as const)(
    'shows full %s addresses and literal wallet names',
    (authType) => {
      const info = {
        address: 'full-substrate-address',
        ethereumAddress: 'full-evm-address',
        solanaAddress: 'full-solana-address',
        irohaAddress: 'full-iroha-address',
        name: 'common.reject',
        active: false,
        isMobile: false,
      };
      const wrapper = mount(SelectAuthAccountForm, {
        props: { accounts: { root: info }, authType, disabled: true },
        global: {
          mocks: { $t: () => 'translated' },
          components: { Checkbox },
          stubs: { Scroll: { template: '<div><slot /></div>' } },
        },
      });
      expect(wrapper.get('.account__address').text()).toBe(`full-${authType}-address`);
      expect(wrapper.get('.fw-checkbox__label').text()).toBe('common.reject');
      expect(wrapper.get('input').attributes('disabled')).toBeDefined();
      wrapper.unmount();
    }
  );
});
