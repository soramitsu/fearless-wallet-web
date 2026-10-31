import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WalletConnectAuthConfirmation from '@/screens/walletConnect/WalletConnectAuthConfirmation.vue';
import WalletChooseForm from '@/screens/walletConnect/WalletChooseForm.vue';
const boundary = vi.hoisted(() => ({ accounts: null as any, extension: null as any, approve: vi.fn(), reject: vi.fn(), push: vi.fn(), back: vi.fn(), notify: vi.fn() }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => boundary.accounts }));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => boundary.extension }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ networks: [{ name: 'Ethereum', chainId: '1', active: true, icon: 'ethereum' }, { name: 'Polygon', chainId: '137', active: true, icon: 'polygon' }] }) }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/plugins/soramitsuUI', () => ({ useNotify: () => boundary.notify }));
vi.mock('@/extension/messaging', () => ({ approveWalletConnectSession: boundary.approve, rejectWalletConnectSession: boundary.reject }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: boundary.push, back: boundary.back }) }));
vi.mock('@/router/routes', () => ({ Components: { Wallet: 'Wallet' } }));
vi.mock('@/screens/walletConnect/WalletConnectHeader.vue', () => ({ default: { name: 'WalletConnectHeader', props: ['title', 'url'], template: '<div>{{ title }} {{ url }}</div>' } }));
const wrappers: VueWrapper[] = [];
beforeEach(() => {
  vi.clearAllMocks(); boundary.approve.mockResolvedValue({ message: 'approved', title: 'title', status: true }); boundary.reject.mockResolvedValue(true);
  boundary.accounts = reactive({ accounts: [{ address: 'alice', ethereumAddress: '0x1111111111111111111111111111111111111111', name: 'Alice' }, { address: 'bob', ethereumAddress: '0x2222222222222222222222222222222222222222', name: 'Bob' }, { address: 'mobile', ethereumAddress: '0x3333333333333333333333333333333333333333', name: 'Mobile', isMobile: true }] });
  boundary.extension = reactive({ wcConnectRequests: [{ id: 'proposal', url: 'https://public.example', request: { params: { proposer: { metadata: { name: 'Public app' } }, requiredNamespaces: { eip155: { chains: ['eip155:1'], methods: ['personal_sign'], events: [] } }, optionalNamespaces: { eip155: { chains: ['eip155:1', 'eip155:137', 'eip155:999'], methods: [], events: [] } } } } }] });
});
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()));
const global = { renderStubDefaultSlot: true, mocks: { $t: (key: string) => key }, stubs: {
  AboveForm: { name: 'AboveForm', template: '<section><slot /></section>' }, Scroll: { template: '<div><slot /></div>' }, ContentForm: { template: '<div><slot /></div>' },
  FButton: { props: ['text', 'disabled'], template: '<button :disabled="disabled">{{ text }}</button>' }, Icon: true, ExternalLogo: true, Alert: { props: ['message'], template: '<p>{{ message }}</p>' }, NotificationPopup: { name: 'NotificationPopup', template: '<div />' },
} };
function form() { const wrapper = mount(WalletConnectAuthConfirmation, { global: { ...global, stubs: { ...global.stubs, WalletChooseForm: true } } }); wrappers.push(wrapper); return wrapper; }
function approve(wrapper: VueWrapper) { return wrapper.findAll('button').find(button => button.text() === 'common.approve')!; }

describe('WalletConnect proposal approval UI', () => {
  it('shows the app, selected wallet, permissions and unique supported networks', () => {
    const wrapper = form(); expect(wrapper.text()).toContain('Alice'); expect(wrapper.text()).toContain('walletConnect.permissions.viewAddress');
    expect(wrapper.getComponent({ name: 'WalletConnectHeader' }).props()).toEqual({ title: 'Public app', url: 'https://public.example' }); expect(wrapper.findAll('external-logo-stub')).toHaveLength(2);
  });
  it('approves the selected wallet and reports the result before navigating', async () => {
    const wrapper = form(); await approve(wrapper).trigger('click'); await flushPromises();
    expect(boundary.approve).toHaveBeenCalledWith({ accounts: ['0x1111111111111111111111111111111111111111'], id: 'proposal' }); expect(boundary.notify).toHaveBeenCalledWith({ message: 'approved', title: 'title', type: 'success' }); expect(boundary.push).toHaveBeenCalledWith('Wallet');
  });
  it('lets the user choose a different local wallet', async () => {
    const wrapper = form(); await wrapper.get('.wallet').trigger('click'); const picker = wrapper.getComponent(WalletChooseForm);
    picker.vm.$emit('onSelect', '0x2222222222222222222222222222222222222222'); picker.vm.$emit('onClose'); await flushPromises();
    expect(wrapper.text()).toContain('Bob'); await approve(wrapper).trigger('click'); await flushPromises(); expect(boundary.approve).toHaveBeenCalledWith({ accounts: ['0x2222222222222222222222222222222222222222'], id: 'proposal' });
  });
  it('requires an extra acknowledgement for unsupported methods', async () => {
    boundary.extension.wcConnectRequests[0].request.params.requiredNamespaces.eip155.methods = ['unknown_method'];
    const wrapper = form(); await approve(wrapper).trigger('click'); expect(boundary.approve).not.toHaveBeenCalled();
    wrapper.getComponent({ name: 'NotificationPopup' }).vm.$emit('handlerAccept'); await flushPromises(); expect(boundary.approve).toHaveBeenCalledOnce();
  });
  it.each(['wallets', 'network'])('shows a blocking alert for unavailable %s', async kind => {
    if (kind === 'wallets') boundary.accounts.accounts = boundary.accounts.accounts.filter((account: { isMobile?: boolean }) => account.isMobile);
    else boundary.extension.wcConnectRequests[0].request.params.requiredNamespaces.eip155.chains = ['eip155:999'];
    const wrapper = form(); expect(approve(wrapper)).toBeUndefined(); expect(wrapper.text()).toContain(kind === 'wallets' ? 'walletConnect.noSuitableWallets' : 'walletConnect.requiredNetworkAlert');
    await wrapper.get('button').trigger('click'); await flushPromises(); expect(boundary.reject).toHaveBeenCalledWith({ id: 'proposal' }); expect(boundary.back).toHaveBeenCalledOnce();
  });
  it('blocks a removed selected wallet instead of approving a stale address', async () => {
    const wrapper = form(); boundary.accounts.accounts = []; await flushPromises(); expect(approve(wrapper)).toBeUndefined();
  });
  it('handles a proposal disappearing before rejection', async () => {
    const wrapper = form(); boundary.extension.wcConnectRequests = []; await flushPromises();
    await wrapper.get('button').trigger('click'); await flushPromises(); expect(boundary.reject).not.toHaveBeenCalled(); expect(boundary.back).toHaveBeenCalledOnce();
  });
  it('does not submit the same proposal twice while approval is pending', async () => {
    let finish!: (value: unknown) => void; boundary.approve.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const wrapper = form(); await approve(wrapper).trigger('click'); await approve(wrapper).trigger('click'); expect(boundary.approve).toHaveBeenCalledOnce();
    finish({ message: '', title: '', status: true }); await flushPromises();
  });
  it('contains a failed approval and leaves the screen available for retry', async () => {
    boundary.approve.mockRejectedValueOnce(new Error('relay offline'));
    const wrapper = form(); await approve(wrapper).trigger('click'); await flushPromises(); expect(boundary.push).not.toHaveBeenCalled(); expect(boundary.notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' }));
    await approve(wrapper).trigger('click'); await flushPromises(); expect(boundary.approve).toHaveBeenCalledTimes(2);
  });
  it('uses warning feedback for an unsuccessful approval response', async () => {
    boundary.approve.mockResolvedValueOnce({ message: 'expired', title: 'Expired', status: false });
    const wrapper = form(); await approve(wrapper).trigger('click'); await flushPromises(); expect(boundary.notify).toHaveBeenCalledWith({ message: 'expired', title: 'Expired', type: 'warning' });
  });
  it('keeps the wallet picker current as accounts are removed', async () => {
    const wrapper = mount(WalletChooseForm, { props: { selectedAddress: '0x1111111111111111111111111111111111111111' }, global }); wrappers.push(wrapper);
    expect(wrapper.findAll('.wallet')).toHaveLength(2); await wrapper.findAll('.wallet')[1].trigger('click'); expect(wrapper.emitted('onSelect')).toEqual([['0x2222222222222222222222222222222222222222']]);
    boundary.accounts.accounts = []; await flushPromises(); expect(wrapper.findAll('.wallet')).toHaveLength(0);
    wrapper.getComponent({ name: 'AboveForm' }).vm.$emit('handlerBack'); expect(wrapper.emitted('onClose')).toHaveLength(1);
  });
});

describe('WalletConnect proposal settlement ownership', () => {
  function reject(wrapper: VueWrapper) {
    return wrapper.findAll('button').find(button => button.text() === 'common.reject')!;
  }
  function delayedRejection() {
    let finish!: () => void;
    boundary.reject.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
    return () => finish();
  }
  it('blocks approval and repeated rejection through buttons and close callbacks while rejecting', async () => {
    const finish = delayedRejection();
    const wrapper = form();
    await reject(wrapper).trigger('click');
    expect(reject(wrapper).attributes('disabled')).toBeDefined();
    expect(approve(wrapper).attributes('disabled')).toBeDefined();
    await reject(wrapper).trigger('click');
    await approve(wrapper).trigger('click');
    wrapper.getComponent({ name: 'AboveForm' }).vm.$emit('closeHandler');
    await flushPromises();
    expect(boundary.reject).toHaveBeenCalledExactlyOnceWith({ id: 'proposal' });
    expect(boundary.approve).not.toHaveBeenCalled();
    expect(boundary.back).not.toHaveBeenCalled();
    finish(); await flushPromises();
    expect(boundary.back).toHaveBeenCalledOnce();
  });
  it('blocks rejection through the close callback while an approval is pending', async () => {
    let finish!: (value: unknown) => void;
    boundary.approve.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const wrapper = form();
    await approve(wrapper).trigger('click');
    wrapper.getComponent({ name: 'AboveForm' }).vm.$emit('closeHandler');
    await flushPromises();
    expect(boundary.reject).not.toHaveBeenCalled();
    expect(boundary.back).not.toHaveBeenCalled();
    finish({ message: 'approved', title: 'title', status: true }); await flushPromises();
    expect(boundary.push).toHaveBeenCalledExactlyOnceWith('Wallet');
  });
  it('keeps a replacement request open when the older rejection completes', async () => {
    const finish = delayedRejection();
    const wrapper = form();
    await reject(wrapper).trigger('click');
    boundary.extension.wcConnectRequests = [{ ...boundary.extension.wcConnectRequests[0], id: 'replacement' }];
    await flushPromises();
    await approve(wrapper).trigger('click');
    expect(boundary.approve).not.toHaveBeenCalled();
    finish(); await flushPromises();
    expect(boundary.back).not.toHaveBeenCalled();
    expect(boundary.push).not.toHaveBeenCalled();
    expect(boundary.reject).toHaveBeenCalledExactlyOnceWith({ id: 'proposal' });
    await approve(wrapper).trigger('click'); await flushPromises();
    expect(boundary.approve).toHaveBeenCalledExactlyOnceWith({ accounts: ['0x1111111111111111111111111111111111111111'], id: 'replacement' });
  });
  it('returns after the rejected request is removed and the queue is empty', async () => {
    const finish = delayedRejection();
    const wrapper = form();
    await reject(wrapper).trigger('click');
    boundary.extension.wcConnectRequests = []; await flushPromises();
    finish(); await flushPromises();
    expect(boundary.reject).toHaveBeenCalledExactlyOnceWith({ id: 'proposal' });
    expect(boundary.back).toHaveBeenCalledOnce();
  });
  it('reports rejection failure and releases the shared guard for retry', async () => {
    boundary.reject.mockRejectedValueOnce(new Error('public relay unavailable'));
    const wrapper = form();
    await reject(wrapper).trigger('click'); await flushPromises();
    expect(boundary.notify).toHaveBeenCalledWith(expect.objectContaining({ message: 'public relay unavailable', type: 'warning' }));
    expect(boundary.back).not.toHaveBeenCalled();
    expect(approve(wrapper).attributes('disabled')).toBeUndefined();
    await reject(wrapper).trigger('click'); await flushPromises();
    expect(boundary.reject).toHaveBeenCalledTimes(2);
    expect(boundary.back).toHaveBeenCalledOnce();
  });
});
