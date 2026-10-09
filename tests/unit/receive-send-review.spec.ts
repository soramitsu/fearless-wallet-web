import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ copy: vi.fn(), wallet: { address: 'public-wallet', name: 'Test wallet' } }));
vi.mock('@/helpers', () => ({ setClipboard: mocks.copy, isSameString: (a: string, b: string) => a === b }));
vi.mock('@/helpers/numbers', () => ({ addNumbers: () => '1.1' }));
vi.mock('@/helpers/currencies', () => ({ getUtilityAsset: () => ({ symbol: 'DOT' }) }));
vi.mock('@/util/BaseApi', () => ({ default: { isBitcoinNetwork: () => false, formatAddress: (_: unknown, network: string) => `${network}-complete-public-address-0123456789abcdef` } }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ selectedWallet: mocks.wallet, balances: [], fiatSymbol: '$' }) }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ getNetwork: () => ({ assets: [] }), getAssetPrice: () => ({ price: 0 }) }) }));
vi.mock('@/consts/global', () => ({ IS_EXTENSION: false }));
vi.mock('@/screens/wallet&asset/TransferForm.vue', () => ({ default: { template: '<section><slot name="step2" /></section>' } }));
import ReceiveForm from '@/screens/wallet&asset/ReceiveForm.vue';
import SendForm from '@/screens/wallet&asset/SendForm.vue';
const global = {
  mocks: { $t: (key: string) => key, $n: (n: number) => String(n), $route: { params: { network: 'Polkadot', assetId: 'dot' } }, $router: { back: vi.fn() } },
  stubs: { AboveForm: { template: '<main><slot /></main>' }, QR: { props: ['payload'], template: '<div data-qr :data-payload="payload" />' }, InputWithIcon: true, Icon: true, Tooltip: true, BorderButton: true, FButton: true, FInput: true, InfoRow: true, FCorners: { template: '<div><slot /></div>' } },
};
describe('public transfer review data', () => {
  it('uses the same full selected-network address for text, copy and QR', async () => {
    const wrapper = mount(ReceiveForm, { global });
    await flushPromises();
    for (const network of ['Polkadot', 'Kusama']) {
      await wrapper.setData({ selectedNetwork: network });
      const address = `${network}-complete-public-address-0123456789abcdef`;
      expect(wrapper.get('.full-address').text()).toBe(address);
      expect(wrapper.get('[data-qr]').attributes('data-payload')).toBe(address);
      const copy = wrapper.get('button[data-testid="copyAddress"]');
      expect(copy.attributes('aria-label')).toBe('common.copyToClipboard');
      await copy.trigger('click');
      expect(mocks.copy).toHaveBeenLastCalledWith(address);
    }
    wrapper.unmount();
  });
  it('shows every recipient character and destination network in Send confirmation', async () => {
    const wrapper = mount(SendForm, { global });
    const recipient = '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    await wrapper.setData({ recipient, selectedNetwork: 'Destination network with a long name' });
    expect(wrapper.get('[data-testid="toAddress"]').text()).toBe(recipient);
    expect(wrapper.get('[data-testid="reviewNetwork"]').text()).toBe('Destination network with a long name');
    wrapper.unmount();
  });
});
