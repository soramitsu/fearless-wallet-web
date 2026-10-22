import { mount } from '@vue/test-utils';
import type { PortfolioAsset, PortfolioNetworkSection as NetworkSection } from '@/portfolio/assetIdentity';
import english from '@/locales/en/translation.json';

const mocks = vi.hoisted(() => ({ push: vi.fn(), setAssetPreference: vi.fn() }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/router/routes', () => ({ Components: { AssetHistory: 'AssetHistory' } }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ fiatSymbol: '$', setAssetPreference: mocks.setAssetPreference }) }));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      let value: unknown = english;
      for (const part of key.split('.')) {
        if (typeof value !== 'object' || value === null) return key;
        value = (value as Record<string, unknown>)[part];
      }
      return typeof value === 'string' ? value : key;
    },
    tc: (_key: string, count: number) => `${count} detected assets`,
  }),
}));

import PortfolioNetworkSection from '@/screens/wallet&asset/wallet/PortfolioNetworkSection.vue';

const asset: PortfolioAsset = {
  key: 'evm:1:eth', keyParts: { ecosystem: 'evm', chainId: '1', assetId: 'eth' }, groupId: 'eth',
  networkName: 'Ethereum', networkIcon: '', assetId: 'eth', name: 'Ether', symbol: 'ETH', icon: '', balanceText: '2', fiatValue: '1234.5',
  unitPrice: '617.25', priceChangePercent: null, priceTrust: 'canonicalAsset', trust: 'verified', source: 'registry',
  preference: 'auto', isNative: true, isReady: true,
};
const section = (overrides: Partial<NetworkSection> = {}): NetworkSection => ({
  key: 'evm:1', name: 'Ethereum', icon: '', ecosystem: 'evm', chainId: '1', address: '0x1234567890abcdef1234567890abcdef12345678',
  subtotal: '1234.5', hasPricedAssets: true, latestTimestamp: Date.now(), stale: false, coverage: 'catalogOnly',
  assets: [asset], detectedAssets: [], ...overrides,
});
const render = (network = section()) => mount(PortfolioNetworkSection, {
  props: { section: network },
  global: { stubs: { ExternalLogo: true, Icon: true, Switcher: true } },
});

describe('Portfolio network header', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows only the network and priced balance after a successful scan', () => {
    const wrapper = render();
    expect(wrapper.get('.network-header').text()).toBe('Ethereum$1,234.50');
    expect(wrapper.find('.sync-state').exists()).toBe(false);
    expect(wrapper.get('.network-header').attributes('aria-expanded')).toBe('true');
    wrapper.unmount();
  });

  it('omits the unavailable-price placeholder while leaving asset balances visible', () => {
    const wrapper = render(section({ hasPricedAssets: false }));
    expect(wrapper.get('.network-header').text()).toBe('Ethereum');
    expect(wrapper.get('.asset-balance').text()).toContain('2.0000 ETH');
    wrapper.unmount();
  });

  it.each([
    [{ error: 'timeout' }, 'Balance update failed'],
    [{ stale: true }, 'Balances may be outdated'],
    [{ latestTimestamp: undefined }, 'Balances not loaded'],
  ] as const)('keeps exceptional balance state %s visible', (state, label) => {
    const wrapper = render(section(state));
    expect(wrapper.get('.sync-state').text()).toBe(label);
    expect(wrapper.get('.network-header').text()).not.toContain('0x1234');
    wrapper.unmount();
  });

  it('preserves collapse, asset navigation and detected-asset review', async () => {
    const detected: PortfolioAsset = { ...asset, key: 'detected', assetId: 'other', trust: 'unverified', source: 'chain' };
    const wrapper = render(section({ detectedAssets: [detected] }));
    await wrapper.get('.network-header').trigger('click');
    expect(wrapper.get('.network-header').attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('.network-assets').exists()).toBe(false);
    await wrapper.get('.network-header').trigger('click');
    await wrapper.get('.asset-row').trigger('click');
    expect(mocks.push).toHaveBeenCalledWith({ name: 'AssetHistory', params: { assetId: 'eth', selectedNetwork: 'Ethereum' } });
    await wrapper.get('.detected-header').trigger('click');
    await wrapper.get('.review-action').trigger('click');
    expect(mocks.setAssetPreference).toHaveBeenCalledWith({ key: 'detected', preference: 'shown' });
    wrapper.unmount();
  });
});
