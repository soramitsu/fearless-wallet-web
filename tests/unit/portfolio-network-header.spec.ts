import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { PortfolioAsset, PortfolioNetworkSection as NetworkSection } from '@/portfolio/assetIdentity';
import english from '@/locales/en/translation.json';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  setAssetPreference: vi.fn(),
  updatePortfolioView: vi.fn(),
  view: { collapsedSections: [] as string[] },
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/router/routes', () => ({ Components: { AssetHistory: 'AssetHistory' } }));
vi.mock('@/stores/accounts', async () => {
  const { reactive } = await import('vue');
  // The persisted per-wallet view state, reactive like the Pinia store it stands in for.
  const view = reactive(mocks.view);
  mocks.view = view;
  mocks.updatePortfolioView.mockImplementation((patch: { collapsedSections?: string[] }) => Object.assign(view, patch));

  return {
    useAccountsStore: () => ({
      fiatSymbol: '$',
      portfolioView: view,
      setAssetPreference: mocks.setAssetPreference,
      updatePortfolioView: mocks.updatePortfolioView,
    }),
  };
});
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values: Record<string, string> = {}) => {
      let value: unknown = english;
      for (const part of key.split('.')) {
        if (typeof value !== 'object' || value === null) return key;
        value = (value as Record<string, unknown>)[part];
      }
      return typeof value === 'string' ? value.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '') : key;
    },
    tc: (_key: string, count: number) => `${count} detected assets`,
  }),
}));

import PortfolioNetworkSection from '@/screens/wallet&asset/wallet/PortfolioNetworkSection.vue';

const asset: PortfolioAsset = {
  key: 'evm:1:eth', keyParts: { ecosystem: 'evm', chainId: '1', assetId: 'eth' }, groupId: 'eth',
  networkName: 'Ethereum', networkIcon: '', assetId: 'eth', name: 'Ether', symbol: 'ETH', icon: '', balanceText: '2',
  transferableText: '2', hasBalance: true, fiatValue: '1234.5', hasPrice: true,
  unitPrice: '617.25', priceChangePercent: null, priceTrust: 'canonicalAsset', trust: 'verified', source: 'registry',
  preference: 'auto', preferenceSource: 'auto', hidden: false, isNative: false, isUtility: true, isTestnet: false, isReady: true,
};
const section = (overrides: Partial<NetworkSection> = {}): NetworkSection => ({
  key: 'evm:1', name: 'Ethereum', icon: '', ecosystem: 'evm', chainId: '1', address: '0x1234567890abcdef1234567890abcdef12345678',
  subtotal: '1234.5', hasPricedAssets: true, isTestnet: false, latestTimestamp: Date.now(), stale: false, coverage: 'catalogOnly',
  assets: [asset], detectedAssets: [], ...overrides,
});
const render = (network = section(), props: { manage?: boolean; forceExpanded?: boolean } = {}) => mount(PortfolioNetworkSection, {
  props: { section: network, ...props },
  global: { stubs: { ExternalLogo: true, Icon: true, Switcher: true } },
});

describe('Portfolio network header', () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.setAssetPreference.mockClear();
    mocks.updatePortfolioView.mockClear();
    mocks.view.collapsedSections = [];
  });

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

  it('remembers collapse across a remount, and keeps asset navigation and detected-asset review', async () => {
    const detected: PortfolioAsset = { ...asset, key: 'detected', assetId: 'other', trust: 'unverified', source: 'chain' };
    const wrapper = render(section({ detectedAssets: [detected] }));
    await wrapper.get('.network-header').trigger('click');
    expect(mocks.updatePortfolioView).toHaveBeenCalledWith({ collapsedSections: ['evm:1'] });
    await nextTick();
    expect(wrapper.get('.network-header').attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('.network-assets').exists()).toBe(false);
    wrapper.unmount();

    const remounted = render(section({ detectedAssets: [detected] }));
    expect(remounted.get('.network-header').attributes('aria-expanded')).toBe('false');
    // A search that matches rows inside a collapsed network keeps it open without changing the stored choice.
    expect(render(section(), { forceExpanded: true }).get('.network-header').attributes('aria-expanded')).toBe('true');
    remounted.unmount();

    const wrapperAgain = render(section({ detectedAssets: [detected] }));
    await wrapperAgain.get('.network-header').trigger('click');
    expect(mocks.view.collapsedSections).toEqual([]);
    await nextTick();
    await runNavigationAndReview(wrapperAgain);
  });

  it('shows hidden rows in Manage with a badge, and says when the hide came from the previous version', () => {
    const hidden: PortfolioAsset = { ...asset, key: 'evm:1:usdt', symbol: 'USDT', hidden: true, preference: 'hidden', preferenceSource: 'explicit' };
    const legacy: PortfolioAsset = { ...asset, key: 'evm:1:dai', symbol: 'DAI', hidden: true, preference: 'hidden', preferenceSource: 'legacy305' };
    const wrapper = render(section({ assets: [asset, hidden, legacy] }), { manage: true });
    const rows = wrapper.findAll('.asset-row');

    expect(rows.map((row) => row.find('[data-testid="hiddenBadge"]').exists())).toEqual([false, true, true]);
    expect(rows.map((row) => row.find('[data-testid="hiddenPreviousVersion"]').exists())).toEqual([false, false, true]);
    expect(rows[2].get('[data-testid="hiddenPreviousVersion"]').text()).toBe('Hidden in previous version');
    expect(rows[1].classes()).toContain('asset-row--hidden');
    wrapper.unmount();
  });

  it('shows the total balance with the transferable part as a secondary line', () => {
    const staked: PortfolioAsset = { ...asset, symbol: 'DOT', balanceText: '15', transferableText: '0' };
    const wrapper = render(section({ assets: [staked, { ...asset, key: 'evm:1:other' }] }));
    const rows = wrapper.findAll('.asset-row');

    expect(rows[0].get('.asset-balance').text()).toContain('15.0000 DOT');
    expect(rows[0].get('[data-testid="transferable"]').text()).toBe('Transferable 0.0000 DOT');
    expect(rows[1].find('[data-testid="transferable"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

async function runNavigationAndReview(wrapper: ReturnType<typeof render>) {
  {
    await wrapper.get('.asset-row').trigger('click');
    expect(mocks.push).toHaveBeenCalledWith({ name: 'AssetHistory', params: { assetId: 'eth', selectedNetwork: 'Ethereum' } });
    await wrapper.get('.detected-header').trigger('click');
    await wrapper.get('.review-action').trigger('click');
    expect(mocks.setAssetPreference).toHaveBeenCalledWith({ key: 'detected', preference: 'shown' });
    wrapper.unmount();
  }
}
