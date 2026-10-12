import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { WalletConnectTransactionRequest } from '@extension-base/services/wallet-connect-service/types';
import RequestData from '@/screens/walletConnect/WalletConnectRequestData.vue';

const address = '0x1111111111111111111111111111111111111111';
const message = '0x2222222222222222222222222222222222222222';
vi.mock('@/stores/accounts', () => ({
  useAccountsStore: () => ({
    accounts: [
      { name: 'Reviewed signer', ethereumAddress: '0x1111111111111111111111111111111111111111' },
      { name: 'Message-shaped account', ethereumAddress: '0x2222222222222222222222222222222222222222' },
    ],
  }),
}));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ getNetwork: () => ({ name: 'Ethereum' }) }) }));
const request = (method = 'personal_sign', params: unknown[] = [message, address]) =>
  ({
    id: 1,
    topic: 'public-topic',
    approvalId: 'public-approval',
    params: { chainId: 'eip155:1', request: { method, params } },
  }) as WalletConnectTransactionRequest;
const open = (value = request()) =>
  mount(RequestData, {
    props: { request: value },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        ContentForm: { template: '<div><slot /></div>' },
        InfoRow: { props: ['text', 'value'], template: '<div>{{ text }}:{{ value }}</div>' },
      },
    },
  });
describe('WalletConnect details track the exact request', () => {
  it('does not use an address-shaped message as the signer', () => {
    const wrapper = open();
    expect(wrapper.text()).toContain('Reviewed signer');
    expect(wrapper.text()).not.toContain('Message-shaped account');
    expect(wrapper.text()).toContain('0x22222222');
    wrapper.unmount();
  });
  it('recomputes method and payload on request replacement', async () => {
    const wrapper = open();
    await wrapper.setProps({ request: request('eth_sign', [address, '0xbeef']) });
    expect(wrapper.text()).toContain('eth_sign');
    expect(wrapper.text()).toContain('0xbeef');
    expect(wrapper.text()).not.toContain('0x22222222');
    wrapper.unmount();
  });
  it('renders object typed data without a string-slice exception', () => {
    const wrapper = open(request('eth_signTypedData_v4', [address, { domain: {}, message: { approved: false } }]));
    expect(wrapper.text()).toContain('eth_signTypedData_v4');
    expect(wrapper.text()).toContain('false');
    expect(wrapper.text()).not.toContain('[object Object]');
    wrapper.unmount();
  });
});
