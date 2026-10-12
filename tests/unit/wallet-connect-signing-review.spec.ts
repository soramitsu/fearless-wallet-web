import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WalletConnectTransactionRequest } from '@extension-base/services/wallet-connect-service/types';
import FButton from '@/components/FButton.vue';
import Checkbox from '@/components/Checkbox.vue';
import Confirmation from '@/screens/walletConnect/WalletConnectSignConfirmation.vue';

const mocks = vi.hoisted(() => ({
  store: undefined as unknown as { wcRequests: WalletConnectTransactionRequest[] },
  approve: vi.fn(),
  reject: vi.fn(),
  notify: vi.fn(),
  push: vi.fn(),
  deny: vi.fn(),
}));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => mocks.store }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ accounts: [] }) }));
vi.mock('@/stores/networks', () => ({
  useNetworksStore: () => ({ allNetworks: [], getNetwork: () => ({ name: 'Current unrelated network' }) }),
}));
vi.mock('@/extension/messaging', () => ({
  walletConnectRequestApprove: mocks.approve,
  walletConnectRequestReject: mocks.reject,
}));
vi.mock('@/plugins/soramitsuUI', () => ({ useNotify: () => mocks.notify }));
vi.mock('@polkadot/phishing', () => ({ checkIfDenied: mocks.deny }));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push, currentRoute: { value: { name: 'WalletConnectSignConfirmation' } } }),
}));
vi.mock('@/router/routes', () => ({
  Components: { Wallet: 'Wallet', WalletConnectSignConfirmation: 'WalletConnectSignConfirmation' },
}));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

const address = `0x${'11'.repeat(20)}`;
const to = `0x${'22'.repeat(20)}`;
const origin = 'https://sign.public-fixture.example.invalid';
const request = (method = 'personal_sign', params: unknown[] = ['0xff', address]): WalletConnectTransactionRequest => ({
  id: 7,
  topic: 'public-topic',
  approvalId: 'public-approval',
  params: { chainId: 'eip155:1', request: { method, params } },
  verifyContext: { verified: { origin, validation: 'UNKNOWN', verifyUrl: '' } },
  context: {
    session: { topic: 'public-topic', origin, peerPublicKey: 'public-peer', revision: 0 },
    account: { address, name: 'Captured signer', isMobile: false },
    network: { name: 'Ethereum', chainId: '1', genesisHash: '0x1234', symbol: 'ETH', decimals: 18 },
  },
});
const open = () =>
  mount(Confirmation, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        AboveForm: { template: '<main><slot /></main>' },
        FButton,
        Checkbox,
        Scroll: { template: '<div><slot /></div>' },
        ContentForm: { template: '<div><slot /></div>' },
        InfoRow: { props: ['text', 'value'], template: '<div>{{ text }} {{ value }}</div>' },
        Icon: true,
        Hint: true,
        Favicon: true,
      },
    },
  });
const approve = (wrapper: ReturnType<typeof open>) => wrapper.get('[data-testid="approveWalletConnectSigning"] button');
async function consent(wrapper: ReturnType<typeof open>) {
  (wrapper.get('details').element as HTMLDetailsElement).open = true;
  await wrapper.get('details').trigger('toggle');
  await wrapper.get('input[type="checkbox"]').setValue(true);
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.approve.mockResolvedValue(true);
  mocks.reject.mockResolvedValue(true);
  mocks.push.mockResolvedValue(undefined);
  mocks.deny.mockResolvedValue(false);
  mocks.store = reactive({ wcRequests: [request()] });
});

describe('WalletConnect complete signing review', () => {
  it('shows the complete captured origin, account and network without inheriting current UI state', async () => {
    const wrapper = open();
    await flushPromises();
    expect(wrapper.text()).toContain(origin);
    expect(wrapper.text()).toContain(address);
    expect(wrapper.text()).toContain('Captured signer');
    expect(wrapper.text()).toContain('Ethereum');
    expect(wrapper.text()).not.toContain('Current unrelated network');
    wrapper.unmount();
  });
  it('requires raw expansion and explicit consent before signing opaque bytes', async () => {
    const wrapper = open();
    await flushPromises();
    expect(approve(wrapper).attributes('aria-disabled')).toBe('true');
    await approve(wrapper).trigger('click');
    expect(mocks.approve).not.toHaveBeenCalled();
    await wrapper.get('input[type="checkbox"]').setValue(true);
    expect(approve(wrapper).attributes('aria-disabled')).toBe('true');
    await consent(wrapper);
    await approve(wrapper).trigger('click');
    await flushPromises();
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith(address, 'public-approval');
    wrapper.unmount();
  });
  it('shows full transaction intent and a maximum fee computed from gas times price', async () => {
    mocks.store.wcRequests = [
      request('eth_sendTransaction', [
        { from: address, to, value: '0xde0b6b3a7640000', gas: '0x5208', gasPrice: '0x77359400' },
      ]),
    ];
    const wrapper = open();
    await flushPromises();
    expect(wrapper.text()).toContain(to);
    expect(wrapper.text()).toContain('1.0 ETH');
    expect(wrapper.text()).toContain('0.000042 ETH');
    expect(wrapper.text()).toContain('signingReview.maximumFee');
    expect(approve(wrapper).attributes('aria-disabled')).toBe('true');
    wrapper.unmount();
  });
  it.each(['missing context', 'wrong signer', 'wrong chain'])('blocks unqualified context: %s', async (kind) => {
    const value = request('personal_sign', ['0x68656c6c6f', address]);
    if (kind === 'missing context') delete value.context;
    if (kind === 'wrong signer') value.context!.account.address = to;
    if (kind === 'wrong chain') value.params.chainId = 'eip155:137';
    mocks.store.wcRequests = [value];
    const wrapper = open();
    await flushPromises();
    expect(wrapper.text()).toContain('signingReview.invalidRequest');
    expect(wrapper.find('[data-testid="approveWalletConnectSigning"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('shows only a close action for a flagged requester', async () => {
    mocks.deny.mockResolvedValue(true);
    const wrapper = open();
    await flushPromises();
    expect(wrapper.text()).toContain('signingReview.flagged');
    expect(wrapper.find('[data-testid="approveWalletConnectSigning"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="rejectWalletConnectSigning"] button').text()).toContain('common.close');
    wrapper.unmount();
  });
  it('resets blind consent when another request replaces the reviewed request', async () => {
    const wrapper = open();
    await flushPromises();
    await consent(wrapper);
    const old = approve(wrapper).element as HTMLButtonElement;
    mocks.store.wcRequests = [{ ...request(), id: 8, approvalId: 'replacement' }];
    old.click();
    expect(mocks.approve).not.toHaveBeenCalled();
    await flushPromises();
    expect(approve(wrapper).attributes('aria-disabled')).toBe('true');
    expect((wrapper.get('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false);
    wrapper.unmount();
  });
  it('preserves false typed-data values in the complete structured message', async () => {
    mocks.store.wcRequests = [
      request('eth_signTypedData_v4', [
        address,
        {
          types: {
            EIP712Domain: [{ name: 'chainId', type: 'uint256' }],
            Permission: [{ name: 'approved', type: 'bool' }],
          },
          primaryType: 'Permission',
          domain: { chainId: 1 },
          message: { approved: false },
        },
      ]),
    ];
    const wrapper = open();
    await flushPromises();
    expect(wrapper.get('.signing-message').text()).toContain('"approved": false');
    expect(approve(wrapper).attributes('aria-disabled')).not.toBe('true');
    await approve(wrapper).trigger('click');
    await flushPromises();
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith(address, 'public-approval');
    wrapper.unmount();
  });
  it('blocks malformed typed data instead of displaying a truncated object', async () => {
    mocks.store.wcRequests = [
      request('eth_signTypedData_v4', [address, { domain: {}, message: { approved: 'false' } }]),
    ];
    const wrapper = open();
    await flushPromises();
    expect(wrapper.text()).toContain('signingReview.invalidRequest');
    expect(wrapper.find('[data-testid="approveWalletConnectSigning"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it.each(['isScam', 'INVALID'])(
    'blocks relay verification warning %s even when the phishing list is clear',
    async (warning) => {
      const value = request();
      if (warning === 'isScam') value.verifyContext.verified.isScam = true;
      else value.verifyContext.verified.validation = 'INVALID';
      mocks.store.wcRequests = [value];
      const wrapper = open();
      await flushPromises();
      expect(wrapper.text()).toContain('signingReview.flagged');
      expect(wrapper.find('[data-testid="approveWalletConnectSigning"]').exists()).toBe(false);
      wrapper.unmount();
    }
  );
});
