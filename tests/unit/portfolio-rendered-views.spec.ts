import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dashboardI18n } from './support/dashboardI18n';
import type { AggregateTokenChild, AggregateTokenRow } from '@/portfolio/dashboard/facets';
import type { AggregatedWallet } from '@/portfolio/dashboard/aggregate';
import type { AllocationGroup } from '@/portfolio/dashboard/allocation';
import PortfolioAllWallets from '@/screens/portfolio/PortfolioAllWallets.vue';
import PortfolioHero from '@/screens/portfolio/PortfolioHero.vue';
import PortfolioSky from '@/screens/portfolio/PortfolioSky.vue';
import { POPUP_SKY, rayLine } from '@/portfolio/dashboard/skyGeometry';

vi.mock('@/locales/useI18n', () => ({ useI18n: () => dashboardI18n }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ fiatSymbol: '$' }) }));

const wrappers: VueWrapper[] = [];
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.restoreAllMocks(); });
const stubs = { Icon: true, Shimmer: true };
const groups: AllocationGroup[] = [
  { key: 'eth', name: 'ETH', value: 75, share: 75, rays: 75, slot: 1 },
  { key: 'other', name: 'Other', value: 25, share: 25, rays: 25, slot: 0, members: ['DOT', 'BTC'] },
];
const child = (holdingId: string): AggregateTokenChild => ({ holdingId, key: `asset-${holdingId}`, address: 'alice', walletName: 'Alice',
  networkName: 'Ethereum', symbol: 'ETH', amount: '1', fiat: '20', changePercent: '2' });
const token = (id: string, children = [child('one')]): AggregateTokenRow => ({ id, symbol: 'ETH', name: 'Ether', amount: '2',
  fiat: '40', changePercent: '2', networks: ['Ethereum'], wallets: ['Alice'], children });
function allWallets(props: Record<string, unknown> = {}) {
  const wrapper = mount(PortfolioAllWallets, { attachTo: document.body, props: {
    lens: 'token', tokenRows: [], networkSections: [], wallets: [], slotOf: () => 1, activeKey: null, focus: null,
    loading: false, readinessOf: () => ({ state: 'unknown', hops: [] }), ...props,
  }, global: { stubs } });
  wrappers.push(wrapper);
  return wrapper;
}
function hero(props: Record<string, unknown> = {}) {
  const wrapper = mount(PortfolioHero, { props: { total: '1234.56', changeAmount: '12', changePercent: '1', caption: '',
    hiddenCount: 0, unpricedCount: 0, unavailableCount: 0, poolStakesExcluded: false, loading: false,
    sync: { kind: 'live', savedWallets: [], staleNetworks: [] }, showSwap: true, showSend: true, showReceive: true, ...props,
  }, global: { stubs } });
  wrappers.push(wrapper);
  return wrapper;
}

describe('rendered all-wallets navigation', () => {
  it.each(['token', 'network', 'wallet'])('shows loading and then the empty state in the %s lens', async (lens) => {
    const wrapper = allWallets({ lens, loading: true });
    expect(wrapper.find('[data-testid="allWalletsLoading"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="allWalletsEmpty"]').exists()).toBe(false);
    await wrapper.setProps({ loading: false });
    expect(wrapper.find('[data-testid="allWalletsEmpty"]').exists()).toBe(true);
  });

  it('opens a single holding directly and emits lens selections', async () => {
    const wrapper = allWallets({ tokenRows: [token('eth')] });
    await wrapper.get('[data-testid="tokenRow-eth"]').trigger('click');
    expect(wrapper.emitted('open')).toEqual([['eth', 'one']]);
    await wrapper.get('[data-testid="allLens-network"]').trigger('click');
    expect(wrapper.emitted('update:lens')).toEqual([['network']]);
    expect(wrapper.text()).toContain('$40.00');
  });

  it('opens a token held in several places on its own page, which lists them, and counts its networks on the logo', async () => {
    const wrapper = allWallets({
      tokenRows: [{ ...token('eth', [child('one'), { ...child('two'), networkName: 'Arbitrum' }]), networks: ['Ethereum', 'Arbitrum'] }],
      activeKey: 'eth',
    });
    const row = wrapper.get('[data-testid="tokenRow-eth"]');

    expect(row.attributes('aria-expanded')).toBeUndefined();
    expect(row.get('.orb-count').text()).toBe('2');
    await row.trigger('click');
    expect(wrapper.emitted('open')).toEqual([['eth', undefined]]);
    expect(wrapper.find('[data-testid="tokenChildren-eth"]').exists()).toBe(false);
  });

  it.each([null, '0', '-2'])('renders absent, flat and negative change %s without a false positive gain', (changePercent) => {
    const wrapper = allWallets({ tokenRows: [{ ...token('eth'), changePercent }] });
    expect(wrapper.find('.change--up').exists()).toBe(false);
    expect(wrapper.find('.change--down').exists()).toBe(changePercent === '-2');
  });

  it('opens the exact token and holding from the network lens', async () => {
    const wrapper = allWallets({ lens: 'network', networkSections: [{ name: 'Ethereum', fiat: '20', rows: [{
      ...child('one'), id: 'row-one', tokenKey: 'eth', name: 'Ether',
    }] }] });
    expect(wrapper.get('[data-testid="allNetworks"]').text()).toContain('Ethereum');
    await wrapper.get('[data-testid="networkRow-row-one"]').trigger('click');
    expect(wrapper.emitted('open')).toEqual([['eth', 'one']]);
  });

  it('renders wallet names, shares, sync ages and a wallet-specific open action', async () => {
    const wallet = { address: 'alice', name: ' Alice ', total: '20', share: 100, latestTimestamp: Date.now() - 60_000,
      holdings: [{ networkName: 'Ethereum' }, { networkName: 'Ethereum' }],
    } as AggregatedWallet;
    const wrapper = allWallets({ lens: 'wallet', wallets: [wallet] });
    expect(wrapper.get('.avatar').text()).toBe('A');
    expect(wrapper.text()).toContain('100');
    expect(wrapper.get('.sub').text()).toContain('1 network');
    await wrapper.get('[data-testid="openWallet-alice"]').trigger('click');
    expect(wrapper.emitted('openWallet')).toEqual([['alice']]);
  });

  it('focuses a group by scrolling its actual rendered row into view', async () => {
    const wrapper = allWallets({ tokenRows: [token('eth', [child('one'), child('two')])] });
    const row = wrapper.get('[data-key="eth"]').element;
    const scroll = vi.fn();
    Object.defineProperty(row, 'scrollIntoView', { value: scroll, configurable: true });
    await wrapper.setProps({ focus: { key: 'eth', count: 1 } });
    await flushPromises();
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
    await wrapper.setProps({ focus: null });
    expect(scroll).toHaveBeenCalledTimes(1);
  });
});

describe('portfolio total and explanatory controls', () => {
  it('renders the total and all exclusions without hiding unavailable balances', () => {
    const wrapper = hero({ caption: 'Ethereum', hiddenCount: 2, unpricedCount: 1, unavailableCount: 1, poolStakesExcluded: true });
    expect(wrapper.get('[data-testid="heroTotal"]').text()).toContain('1,234');
    const caption = wrapper.get('[data-testid="heroCaption"]').text();
    expect(caption).toContain('Ethereum');
    expect(caption).toContain('2');
    expect(caption).toContain('1');
    expect(wrapper.get('[data-testid="heroTotal"]').attributes('aria-label')).toContain('1,234.56');
  });

  it('uses a loading announcement and removes actions unavailable to the scope', () => {
    const wrapper = hero({ loading: true, showSwap: false });
    expect(wrapper.get('[data-testid="heroLoading"]').attributes('role')).toBe('status');
    expect(wrapper.find('[data-testid="heroTotal"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="heroSwap"]').exists()).toBe(false);
    // The allocation is the Portfolio view's now: the balance has no chart or legend of its own.
    expect(wrapper.find('[data-testid="heroLegend"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="portfolioSky"]').exists()).toBe(false);
  });

  it('emits fiat, counting, sync, send, receive and swap actions separately', async () => {
    const wrapper = hero();
    for (const [testId, event] of [['heroTotal', 'openFiats'], ['heroHowWeCount', 'openCounting'], ['heroSync', 'openSync'], ['heroSend', 'send'], ['heroReceive', 'receive'], ['heroSwap', 'swap']]) {
      await wrapper.get(`[data-testid="${testId}"]`).trigger('click');
      expect(wrapper.emitted(event)).toHaveLength(1);
    }
  });

  it.each(['live', 'partial', 'offline', 'saved'] as const)('reports %s sync status to both visible and assistive controls', (kind) => {
    const wrapper = hero({ sync: { kind, savedWallets: [], staleNetworks: [], oldestAgeMs: 60_000 } });
    const button = wrapper.get('[data-testid="heroSync"]');
    expect(button.classes()).toContain(`sync-chip--${kind}`);
    expect(button.attributes('aria-label')).toContain(button.text());
  });
});

describe('portfolio sky pointer selection', () => {
  function sky() {
    const wrapper = mount(PortfolioSky, { props: { groups, activeKey: null } });
    wrappers.push(wrapper);
    vi.spyOn(wrapper.get('[data-testid="portfolioSky"]').element, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: POPUP_SKY.w } as DOMRect);
    const ray = rayLine(20, POPUP_SKY);
    return { wrapper, point: { clientX: (ray.x1 + ray.x2) / 2, clientY: (ray.y1 + ray.y2) / 2 } };
  }
  it('uses the same group for pointer hover, tooltip and click', async () => {
    const { wrapper, point } = sky();
    wrapper.get('[data-testid="portfolioSky"]').element.dispatchEvent(new MouseEvent('pointermove', { ...point, bubbles: true }));
    await flushPromises();
    expect(wrapper.get('[data-testid="portfolioSkyTip"]').text()).toContain('ETH 75%');
    await wrapper.get('[data-testid="portfolioSky"]').trigger('click', point);
    expect(wrapper.emitted('select')).toEqual([['eth']]);
    await wrapper.get('[data-testid="portfolioSky"]').trigger('pointerleave');
    expect(wrapper.find('[data-testid="portfolioSkyTip"]').exists()).toBe(false);
  });
  it('does not treat touch movement or empty chart space as a selection', async () => {
    const { wrapper, point } = sky();
    const touch = new MouseEvent('pointermove', { ...point, bubbles: true });
    Object.defineProperty(touch, 'pointerType', { value: 'touch' });
    wrapper.get('[data-testid="portfolioSky"]').element.dispatchEvent(touch);
    await flushPromises();
    expect(wrapper.find('[data-testid="portfolioSkyTip"]').exists()).toBe(false);
    await wrapper.get('[data-testid="portfolioSky"]').trigger('click', { clientX: -100, clientY: -100 });
    expect(wrapper.emitted('select')).toBeUndefined();
    await wrapper.setProps({ groups: [] });
    await wrapper.get('[data-testid="portfolioSky"]').trigger('click', point);
    expect(wrapper.emitted('select')).toBeUndefined();
  });
});
