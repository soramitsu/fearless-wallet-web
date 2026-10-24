import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import type { PortfolioAsset, PortfolioNetworkSection as NetworkSection } from '@/portfolio/assetIdentity';
import english from '@/locales/en/translation.json';

const mocks = vi.hoisted(() => ({ push: vi.fn(), setAssetPreference: vi.fn() }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/router/routes', () => ({
  Components: { AssetHistory: 'AssetHistory', Currencies: 'Currencies', Nfts: 'Nfts' },
}));
vi.mock('@/stores/accounts', () => ({
  useAccountsStore: () => ({
    fiatSymbol: '$',
    portfolioView: { collapsedSections: [] },
    setAssetPreference: mocks.setAssetPreference,
    updatePortfolioView: vi.fn(),
  }),
}));
const translate = (key: string, values: Record<string, string> = {}) => {
  let value: unknown = english;
  for (const part of key.split('.')) {
    if (typeof value !== 'object' || value === null) return key;
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === 'string' ? value.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '') : key;
};
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: translate, tc: translate }) }));

import Switcher from '@/components/Switcher.vue';
import PortfolioNetworkSection from '@/screens/wallet&asset/wallet/PortfolioNetworkSection.vue';
import WalletSettings from '@/screens/wallet&asset/wallet/WalletSettings.vue';

const hiddenKsm: PortfolioAsset = {
  key: 'substrate:kusama:ksm',
  keyParts: { ecosystem: 'substrate', chainId: 'kusama', assetId: 'ksm' },
  groupId: 'ksm',
  networkName: 'Kusama',
  networkIcon: '',
  assetId: 'ksm',
  name: 'Kusama',
  symbol: 'KSM',
  icon: '',
  balanceText: '3',
  transferableText: '3',
  hasBalance: true,
  fiatValue: '60',
  hasPrice: true,
  unitPrice: '20',
  priceChangePercent: null,
  priceTrust: 'canonicalAsset',
  trust: 'verified',
  source: 'registry',
  preference: 'hidden',
  preferenceSource: 'legacy305',
  hidden: true,
  isNative: true,
  isUtility: true,
  isTestnet: false,
  isReady: true,
};
const kusama: NetworkSection = {
  key: 'substrate:kusama',
  name: 'Kusama',
  icon: '',
  ecosystem: 'substrate',
  chainId: 'kusama',
  address: 'D',
  subtotal: '0',
  hasPricedAssets: false,
  isTestnet: false,
  stale: false,
  coverage: 'complete',
  assets: [hiddenKsm],
  detectedAssets: [],
};

const renderSection = (manage: boolean) =>
  mount(PortfolioNetworkSection, {
    props: { section: kusama, manage },
    attachTo: document.body,
    global: { components: { Switcher }, stubs: { ExternalLogo: true, Icon: true } },
  });

describe('showing a hidden asset again without a mouse', () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.setAssetPreference.mockClear();
  });

  it('gives each Manage row a named, focusable switch that is not wrapped in a button', async () => {
    const wrapper = renderSection(true);
    const row = wrapper.get('.asset-row');
    const toggle = row.get('input[role="switch"]');

    expect(row.element.tagName).toBe('DIV');
    expect(row.element.closest('button')).toBeNull();
    expect(toggle.attributes('type')).toBe('checkbox');
    expect(toggle.attributes('aria-label')).toBe('Show KSM on Kusama');
    expect((toggle.element as HTMLInputElement).checked).toBe(false);

    (toggle.element as HTMLInputElement).focus();
    expect(document.activeElement).toBe(toggle.element);
    // Space on a focused checkbox is the browser's click activation.
    (toggle.element as HTMLInputElement).click();

    expect(mocks.setAssetPreference).toHaveBeenCalledExactlyOnceWith({ key: hiddenKsm.key, preference: 'shown' });
    expect(mocks.push).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('keeps the rows outside Manage as buttons that open the asset', async () => {
    const wrapper = renderSection(false);
    const row = wrapper.get('.asset-row');

    expect(row.element.tagName).toBe('BUTTON');
    expect(row.find('input').exists()).toBe(false);
    await row.trigger('click');
    expect(mocks.push).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('names the Hide zero balances switch by its visible label', () => {
    const wrapper = mount(WalletSettings, {
      props: { activeTabName: 'Currencies', filterValue: '', showAssetsManagementForm: false, hideZero: false },
      global: {
        components: { Switcher },
        mocks: { $t: translate },
        stubs: { TabButton: true, SearchInput: true, CircleButton: true },
      },
    });
    const toggle = wrapper.get('[data-testid="hideZeroToggle"] input[role="switch"]');

    expect(toggle.element.closest('label')?.textContent?.trim()).toBe(english.wallet.hideZero);
    expect(toggle.element.closest('button')).toBeNull();
    wrapper.unmount();
  });

  it('hides the checkbox only visually, so it stays in the tab order and shows a focus ring', () => {
    const source = readFileSync(resolve(__dirname, '../../src/components/Switcher.vue'), 'utf8');
    const inputRule = source.match(/\n\.switch__input \{([^}]*)\}/)?.[1] ?? '';

    expect(inputRule).toContain('clip-path: inset(50%)');
    expect(inputRule).not.toMatch(/display:\s*none|visibility:\s*hidden/);
    expect(source).toMatch(/\.switch__input:focus-visible \+ \.switch__core \{[^}]*outline:/);
  });
});
