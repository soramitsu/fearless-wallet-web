import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountJson, AuthorizeRequest } from '@extension-base/background/types/types';
import type { WalletInfo } from '@/stores';
import FButton from '@/components/FButton.vue';
import Authorize from '@/screens/extension-ui/authorize/Authorize.vue';
import SelectAuthAccountForm from '@/screens/extension-ui/authorize/SelectAuthAccountForm.vue';
import Checkbox from '@/components/Checkbox.vue';
import { WalletEcosystem } from '@/interfaces';

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
    locale: { value: 'en-EN' },
  }),
}));

const account = (id: string) =>
  ({ address: id, name: id, ethereumAddress: `0x${id}`, solanaAddress: `sol-${id}`, walletSecurityGeneration: 1 }) as AccountJson;
const request = (id: string) =>
  ({ id, url: `https://${id}.example`, request: { origin: id, accountAuthType: 'evm' } }) as AuthorizeRequest;
const Button = {
  props: ['text', 'disabled'],
  emits: ['click'],
  template: '<button type="button" :aria-disabled="disabled" @click="$emit(\'click\')">{{ text }}</button>',
};
const open = (realControls = false) =>
  mount(Authorize, {
    attachTo: realControls ? document.body : undefined,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        AboveForm: {
          name: 'AboveForm',
          props: ['showCloseIcon'],
          emits: ['closeHandler'],
          template: '<main><slot /></main>',
        },
        Alert: { props: ['message'], template: '<div>{{ message }}<slot /></div>' },
        FButton: realControls ? FButton : Button,
        Icon: true,
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
  it('offers existing, imported and fresh wallets together for Substrate connection', async () => {
    mocks.extension.authRequests[0].request.accountAuthType = 'substrate';
    mocks.accounts.accounts = [
      { ...account('legacy'), walletSecurityGeneration: undefined },
      { ...account('imported'), walletSecurityGeneration: 0 },
      account('fresh'),
    ];
    const wrapper = open();
    await flushPromises();
    expect(Object.keys(form(wrapper).props('accounts'))).toEqual(['legacy', 'imported', 'fresh']);
    expect(selected(wrapper)).toEqual(['legacy', 'imported', 'fresh']);
    form(wrapper).vm.$emit('onSelectAll', false);
    expect(selected(wrapper)).toEqual([]);
    form(wrapper).vm.$emit('onSelectAll', true);
    await approve(wrapper).trigger('click');
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith({ id: 'first', accounts: ['legacy', 'imported', 'fresh'] });
    wrapper.unmount();
  });

  it.each([undefined, 0])('allows connection when the only wallet has provenance %s', async (generation) => {
    mocks.extension.authRequests[0].request.accountAuthType = 'substrate';
    mocks.accounts.accounts = [{ ...account('legacy'), walletSecurityGeneration: generation }];
    const wrapper = open();
    await flushPromises();
    expect(selected(wrapper)).toEqual(['legacy']);
    expect(wrapper.text()).not.toContain('auth.noAccounts');
    await approve(wrapper).trigger('click');
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith({ id: 'first', accounts: ['legacy'] });
    wrapper.unmount();
  });

  it('defaults an omitted requested protocol to Substrate even when the site has a merged grant', async () => {
    mocks.extension.authRequests[0].accountAuthType = 'both';
    mocks.extension.authRequests[0].request.accountAuthType = undefined;
    mocks.accounts.accounts = [{ ...account('legacy'), walletSecurityGeneration: undefined }];
    const wrapper = open();
    await flushPromises();
    expect(form(wrapper).props('authType')).toBe('substrate');
    expect(selected(wrapper)).toEqual(['legacy']);
    await approve(wrapper).trigger('click');
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith({ id: 'first', accounts: ['legacy'] });
    wrapper.unmount();
  });

  it.each(['evm', 'solana', 'iroha'] as const)('retains recovery guidance for %s connection with only legacy accounts', async (protocol) => {
    mocks.extension.authRequests[0].request.accountAuthType = protocol;
    mocks.accounts.accounts = [{ ...account('legacy'), irohaAddress: 'iroha-linked', walletSecurityGeneration: undefined }];
    const wrapper = open();
    await flushPromises();
    expect(wrapper.findComponent(SelectAuthAccountForm).exists()).toBe(false);
    expect(approve(wrapper)).toBeUndefined();
    expect(wrapper.text()).toContain('Old wallets are recovery-only');
    await wrapper.getComponent(Button).trigger('click');
    expect(mocks.reject).toHaveBeenCalledExactlyOnceWith('first');
    expect(mocks.approve).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('does not use a merged Substrate grant to offer a legacy account for a requested EVM connection', async () => {
    mocks.extension.authRequests[0].accountAuthType = 'both';
    mocks.accounts.accounts = [
      { ...account('legacy'), walletSecurityGeneration: undefined },
      account('fresh'),
    ];
    const wrapper = open();
    await flushPromises();
    expect(Object.keys(form(wrapper).props('accounts'))).toEqual(['fresh']);
    form(wrapper).vm.$emit('onSelect', true, 'legacy');
    expect(selected(wrapper)).toEqual([]);
    form(wrapper).vm.$emit('onSelect', true, 'fresh');
    await approve(wrapper).trigger('click');
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith({ id: 'first', accounts: ['fresh'] });
    wrapper.unmount();
  });

  it.each(['isExternal', 'isHardware'] as const)('keeps %s accounts eligible without local generation metadata', async (kind) => {
    mocks.extension.authRequests[0].request.accountAuthType = 'substrate';
    mocks.accounts.accounts = [{ ...account('external'), walletSecurityGeneration: undefined, [kind]: true }];
    const wrapper = open();
    await flushPromises();
    expect(selected(wrapper)).toEqual(['external']);
    await approve(wrapper).trigger('click');
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith({ id: 'first', accounts: ['external'] });
    wrapper.unmount();
  });

  it('preserves connection selection when security metadata changes and waits for the refreshed controls', async () => {
    mocks.extension.authRequests[0].request.accountAuthType = 'substrate';
    const wrapper = open();
    form(wrapper).vm.$emit('onSelect', false, 'bob');
    await flushPromises();
    const oldApprove = approve(wrapper);
    mocks.accounts.accounts[0].walletSecurityGeneration = undefined;
    oldApprove.vm.$emit('click');
    expect(mocks.approve).not.toHaveBeenCalled();
    await flushPromises();
    expect(Object.keys(form(wrapper).props('accounts'))).toEqual(['alice', 'bob']);
    expect(selected(wrapper)).toEqual(['alice']);
    await approve(wrapper).trigger('click');
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith({ id: 'first', accounts: ['alice'] });
    wrapper.unmount();
  });

  it('invalidates a stale approval when the last account is removed and allows a newly imported account', async () => {
    mocks.extension.authRequests[0].request.accountAuthType = 'substrate';
    mocks.accounts.accounts = [account('alice')];
    const wrapper = open();
    await flushPromises();
    const oldApprove = approve(wrapper);
    mocks.accounts.accounts = [];
    oldApprove.vm.$emit('click');
    await flushPromises();
    expect(mocks.approve).not.toHaveBeenCalled();
    expect(approve(wrapper)).toBeUndefined();
    expect(wrapper.text()).toContain('auth.noAccounts');
    mocks.accounts.accounts.push({ ...account('imported'), walletSecurityGeneration: 0 });
    await flushPromises();
    expect(selected(wrapper)).toEqual(['imported']);
    await approve(wrapper).trigger('click');
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith({ id: 'first', accounts: ['imported'] });
    wrapper.unmount();
  });

  it('keeps the missing-account explanation when legacy wallets are incompatible with the requested ecosystem', async () => {
    mocks.extension.authRequests[0].request.accountAuthType = 'evm';
    mocks.accounts.accounts = [{ ...account('legacy'), ethereumAddress: '', walletSecurityGeneration: undefined }];
    const wrapper = open();
    await flushPromises();
    expect(wrapper.text()).toContain('auth.noAccounts');
    expect(wrapper.text()).not.toContain('Old wallets are recovery-only');
    expect(approve(wrapper)).toBeUndefined();
    wrapper.unmount();
  });

  it('allows a presented standalone Ethereum wallet to be selected for its own EVM grant', async () => {
    const address = `0x${'12'.repeat(20)}`;
    mocks.accounts.accounts = [{ ...account(address), ethereumAddress: address, name: 'Ethereum', walletEcosystem: 'evm' } as AccountJson];
    const wrapper = open();
    await flushPromises();
    expect(Object.keys(form(wrapper).props('accounts'))).toEqual([address]);
    form(wrapper).vm.$emit('onSelect', true, address);
    await flushPromises();
    await approve(wrapper).trigger('click');
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith({ id: 'first', accounts: [address] });
    wrapper.unmount();
  });

  it.each([
    WalletEcosystem.Evm, WalletEcosystem.Ton, WalletEcosystem.Bitcoin, WalletEcosystem.Solana, WalletEcosystem.Iroha,
  ])('excludes an imported %s wallet from a mixed legacy Substrate connection', async (ecosystem) => {
    mocks.extension.authRequests[0].request.accountAuthType = 'substrate';
    mocks.accounts.accounts = [
      { ...account('old-substrate'), walletEcosystem: WalletEcosystem.Substrate, walletSecurityGeneration: undefined },
      { ...account('legacy-unclassified'), walletSecurityGeneration: undefined },
      { ...account('imported-other'), walletEcosystem: ecosystem, walletSecurityGeneration: 0 },
    ];
    const wrapper = open();
    await flushPromises();
    expect(Object.keys(form(wrapper).props('accounts'))).toEqual(['old-substrate', 'legacy-unclassified']);
    expect(selected(wrapper)).toEqual(['old-substrate', 'legacy-unclassified']);
    form(wrapper).vm.$emit('onSelect', true, 'imported-other');
    form(wrapper).vm.$emit('onSelectAll', true);
    await approve(wrapper).trigger('click');
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith({ id: 'first', accounts: ['old-substrate', 'legacy-unclassified'] });
    wrapper.unmount();
  });

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

  it('does not authorize a replacement Substrate origin from the old rendered control', async () => {
    mocks.extension.authRequests[0].request.accountAuthType = 'substrate';
    const wrapper = open();
    await flushPromises();
    const oldApprove = approve(wrapper);
    const replacement = request('second');
    replacement.request.accountAuthType = 'substrate';
    mocks.extension.authRequests = [replacement];
    expect(wrapper.text()).toContain('https://first.example');
    oldApprove.vm.$emit('click');
    expect(mocks.approve).not.toHaveBeenCalled();
    await flushPromises();
    await approve(wrapper).trigger('click');
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith({ id: 'second', accounts: ['alice', 'bob'] });
    wrapper.unmount();
  });

  it.each(['added', 'replaced'])(
    'does not authorize a newly %s Substrate account before its row renders',
    async (change) => {
      mocks.extension.authRequests[0].request.accountAuthType = 'substrate';
      const wrapper = open();
      await flushPromises();
      const oldApprove = approve(wrapper);
      mocks.accounts.accounts =
        change === 'added' ? [...mocks.accounts.accounts, account('carol')] : [account('carol')];
      oldApprove.vm.$emit('click');
      expect(mocks.approve).not.toHaveBeenCalled();
      await flushPromises();
      await approve(wrapper).trigger('click');
      expect(mocks.approve).toHaveBeenCalledExactlyOnceWith({
        id: 'first',
        accounts: change === 'added' ? ['alice', 'bob', 'carol'] : ['carol'],
      });
      wrapper.unmount();
    }
  );

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

  it('focuses Reject for the replacement request after an older pending response releases controls', async () => {
    let reject!: (reason: Error) => void;
    mocks.approve.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      })
    );
    const wrapper = open(true);
    await flushPromises();
    const rejectButton = wrapper.get('[data-testid="rejectAuthorization"] button');
    expect(document.activeElement).toBe(rejectButton.element);
    form(wrapper).vm.$emit('onSelect', true, 'alice');
    await flushPromises();
    const approveButton = wrapper.get('[data-testid="approveAuthorization"] button');
    (approveButton.element as HTMLButtonElement).focus();
    await approveButton.trigger('click');
    mocks.extension.authRequests = [request('second')];
    await flushPromises();
    expect((rejectButton.element as HTMLButtonElement).disabled).toBe(true);
    reject(new Error('old request expired'));
    await flushPromises();
    expect(document.activeElement).toBe(rejectButton.element);
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
