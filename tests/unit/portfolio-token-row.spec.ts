import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { AccountJson } from '@extension-base/background/types/types';
import type { PortfolioAsset } from '@/portfolio/assetIdentity';
import type { PortfolioTokenChild, PortfolioTokenRow } from '@/portfolio/tokenLens';
import { useAccountsStore } from '@/stores/accounts';

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('vue-router', () => ({ useRouter: () => router }));
vi.mock('@/router/routes', () => ({ Components: { AssetHistory: 'AssetHistory' } }));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key),
    tc: (key: string, count: number, values?: Record<string, unknown>) => `${key}:${count} ${JSON.stringify(values ?? {})}`,
  }),
}));
vi.mock('@/extension/messaging', () => ({ getHistory: vi.fn(), toggleFavoriteNetwork: vi.fn(), sendMessage: vi.fn() }));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));

import PortfolioTokenRowView from '@/screens/wallet&asset/wallet/PortfolioTokenRow.vue';

const createLocalStorageStub = () => {
  const storage = new Map<string, string>();

  return {
    clear: vi.fn(() => storage.clear()),
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(storage.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => storage.delete(key)),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    get length() {
      return storage.size;
    },
  };
};

const asset = (networkName: string, assetId: string, balanceText: string, extra: Partial<PortfolioAsset> = {}): PortfolioAsset =>
  ({
    key: `substrate:${networkName.toLowerCase()}:${assetId}`,
    networkName,
    networkIcon: `${networkName}-icon`,
    assetId,
    name: 'Polkadot',
    symbol: 'DOT',
    icon: 'dot-icon',
    balanceText,
    transferableText: balanceText,
    hasBalance: balanceText !== '0',
    fiatValue: balanceText === '0' ? null : String(Number(balanceText) * 5),
    hidden: false,
    trust: 'verified',
    preferenceSource: 'auto',
    isTestnet: false,
    ...extra,
  }) as PortfolioAsset;

const child = (value: PortfolioAsset, role?: string): PortfolioTokenChild => ({ asset: value, role, networkRank: 1 });

const dotRow = (): PortfolioTokenRow => ({
  id: 'group:dot',
  groupId: 'dot',
  symbol: 'DOT',
  name: 'Polkadot',
  icon: 'dot-icon',
  networkIcon: 'Polkadot-icon',
  children: [child(asset('Polkadot', 'relay-dot', '10'), 'native'), child(asset('Polkadot AssetHub', 'hub-dot', '2'), 'system-parachain')],
  zeroChildren: [child(asset('Hydration', 'hydration-dot', '0'), 'xcm-reserve')],
  networkCount: 3,
  balanceText: '12',
  transferableText: '12',
  hasBalance: true,
  fiatValue: '60',
  unpricedNetworkCount: 0,
  hidden: false,
  isTestnet: false,
});

const mountRow = (row: PortfolioTokenRow, props: Record<string, unknown> = {}) =>
  mount(PortfolioTokenRowView, {
    props: { row, canSend: true, ...props },
    global: { stubs: { ExternalLogo: true, Icon: true, Switcher: true } },
  });

describe('a By token row', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageStub());
    setActivePinia(createPinia());
    router.push.mockReset();
    useAccountsStore().setSelectedWallet({ address: 'wallet', ethereumAddress: '', name: 'Wallet' } as AccountJson);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('names the token, its amount, value and network count to assistive technology', () => {
    const wrapper = mountRow(dotRow());
    const header = wrapper.get('[data-testid="tokenGroupHeader"]');

    expect(header.attributes('aria-expanded')).toBe('false');
    expect(header.attributes('aria-label')).toContain('portfolioPage.tokenGroupLabel:3');
    expect(header.attributes('aria-label')).toContain('"symbol":"DOT"');
    expect(header.attributes('aria-label')).toContain('"amount":"12.0000 DOT"');
    expect(header.attributes('aria-label')).toContain('"count":3');
    wrapper.unmount();
  });

  it('remembers that it was opened after the popup closes', async () => {
    const wrapper = mountRow(dotRow());
    await wrapper.get('[data-testid="tokenGroupHeader"]').trigger('click');
    expect(wrapper.findAll('.network-row')).toHaveLength(2);
    wrapper.unmount();

    const reopened = mountRow(dotRow());
    expect(reopened.get('[data-testid="tokenGroupHeader"]').attributes('aria-expanded')).toBe('true');
    expect(JSON.parse(localStorage.getItem('account_portfolio-view-v1')!).value.wallet.expandedGroups).toEqual(['group:dot']);

    await reopened.get('[data-testid="tokenGroupHeader"]').trigger('click');
    expect(reopened.find('[data-testid="tokenNetworks"]').exists()).toBe(false);
    reopened.unmount();
  });

  it('keeps zero networks behind one line until asked, and labels each network with its role', async () => {
    const wrapper = mountRow(dotRow(), { forceExpanded: true });
    // A search or the Hidden filter opens everything.
    expect(wrapper.findAll('.network-row')).toHaveLength(3);
    wrapper.unmount();

    const closed = mountRow(dotRow());
    await closed.get('[data-testid="tokenGroupHeader"]').trigger('click');
    expect(closed.get('[data-testid="tokenZeroNetworks"]').text()).toContain('portfolioPage.moreZeroNetworks:1');
    await closed.get('[data-testid="tokenZeroNetworks"]').trigger('click');
    expect(closed.findAll('[data-testid="memberRole"]').map((chip) => chip.text())).toEqual([
      'portfolioPage.role.native',
      'portfolioPage.role.systemParachain',
      'portfolioPage.role.xcmReserve',
    ]);
    closed.unmount();
  });

  it('offers Send and Receive for the group, and lets the parent ask for the network', async () => {
    const wrapper = mountRow(dotRow(), { forceExpanded: true });
    await wrapper.get('[data-testid="groupSend"]').trigger('click');
    await wrapper.get('[data-testid="groupReceive"]').trigger('click');

    expect(wrapper.emitted('send')).toHaveLength(1);
    expect(wrapper.emitted('receive')).toHaveLength(1);
    expect(router.push).not.toHaveBeenCalled();
    wrapper.unmount();

    const noSend = mountRow(dotRow(), { forceExpanded: true, canSend: false });
    expect(noSend.get('[data-testid="groupSend"]').attributes('disabled')).toBeDefined();
    noSend.unmount();
  });

  it('opens a single-network row straight on its asset page, with the network named', async () => {
    const single: PortfolioTokenRow = {
      ...dotRow(),
      id: 'substrate:polygon:usdt',
      groupId: undefined,
      symbol: 'USDT',
      children: [child(asset('Polygon', '0xc2132', '2', { symbol: 'USDT' }))],
      zeroChildren: [],
      networkCount: 1,
    };
    const wrapper = mountRow(single);

    expect(wrapper.find('[data-testid="tokenGroupHeader"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="tokenNetwork"]').text()).toBe('Polygon');
    expect(wrapper.find('[data-testid="memberRole"]').exists()).toBe(false);
    await wrapper.get('[data-testid="tokenRowHeader"]').trigger('click');
    expect(router.push).toHaveBeenCalledWith({ name: 'AssetHistory', params: { assetId: '0xc2132', selectedNetwork: 'Polygon' } });
    wrapper.unmount();
  });

  it('says when part of a group has no price instead of valuing it at another network’s price', () => {
    const wrapper = mountRow({ ...dotRow(), unpricedNetworkCount: 1 });
    expect(wrapper.get('[data-testid="tokenPartialPrice"]').text()).toContain('portfolioPage.priceUnavailableOn:1');
    wrapper.unmount();
  });
});
