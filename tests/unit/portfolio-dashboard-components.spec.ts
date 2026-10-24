import { mount } from '@vue/test-utils';
import { dashboardI18n } from './support/dashboardI18n';
import type { MoveHop, Readiness } from '@/portfolio/dashboard/readiness';

vi.mock('@/locales/useI18n', () => ({ useI18n: () => dashboardI18n }));
vi.mock('@/portfolio/usePortfolioFormatting', () => ({
  usePortfolioFormatting: () => ({
    formatAmount: (value: string) => value,
    formatFiatValue: (value: string) => `$${value}`,
    roleLabel: (role?: string) => role ?? '',
  }),
}));

import PortfolioBreakdown from '@/screens/portfolio/PortfolioBreakdown.vue';
import PortfolioCheckList from '@/screens/portfolio/PortfolioCheckList.vue';
import PortfolioOrbit from '@/screens/portfolio/PortfolioOrbit.vue';
import PortfolioReadinessChip from '@/screens/portfolio/PortfolioReadinessChip.vue';
import PortfolioRouteCard from '@/screens/portfolio/PortfolioRouteCard.vue';
import PortfolioSwapSheet from '@/screens/portfolio/PortfolioSwapSheet.vue';

const stubs = { Icon: true, ExternalLogo: true };
const hop = (from: string, to: string, extra: Partial<MoveHop> = {}): MoveHop => ({
  routeId: `${from}>${to}`,
  providerId: 'sora-substrate-bridge',
  providerName: 'SORA ↔ Substrate',
  protocol: 'SORA Substrate bridge',
  originNetwork: from,
  originChainId: from.toLowerCase(),
  destinationNetwork: to,
  destinationChainId: to.toLowerCase(),
  symbol: 'DOT',
  minimum: null,
  destinationFee: '0',
  enabled: true,
  assetKey: `substrate:${from.toLowerCase()}:dot`,
  ...extra,
});
const chip = (readiness: Readiness) => mount(PortfolioReadinessChip, { props: { readiness }, global: { stubs } });

describe('readiness chip', () => {
  it('says Swap-ready, with the Polkaswap mark', () => {
    const wrapper = chip({ state: 'ready', hops: [] });

    expect(wrapper.text()).toBe('Swap-ready');
    expect(wrapper.find('icon-stub').attributes('icon')).toBe('polkaswap');
  });

  it('counts the moves of a route', () => {
    expect(chip({ state: 'route', hops: [hop('A', 'SORA')] }).text()).toBe('1 move');
    expect(chip({ state: 'route', hops: [hop('A', 'B'), hop('B', 'SORA')] }).text()).toBe('2 moves');
  });

  it('says paused, in words and dashed, for moves and for swaps', () => {
    const moves = chip({ state: 'off', hops: [hop('A', 'SORA')], cause: 'moves-off' });

    expect(moves.text()).toBe('Moves paused');
    expect(moves.classes()).toContain('readiness--off');
    expect(chip({ state: 'off', hops: [], cause: 'swaps-off' }).text()).toBe('Swaps paused');
  });

  it('shows nothing for no route, and nothing before the app knows', () => {
    expect(chip({ state: 'none', hops: [] }).find('.readiness').exists()).toBe(false);
    expect(chip({ state: 'unknown', hops: [] }).find('.readiness').exists()).toBe(false);
  });
});

describe('breakdown', () => {
  const view = (props: { amount: string; transferable: string; held: string }) =>
    mount(PortfolioBreakdown, { props: { ...props, symbol: 'DOT' }, global: { stubs } });

  it('lists what can be sent, what is held back and the total, in words', () => {
    const wrapper = view({ amount: '10', transferable: '4', held: '6' });

    expect(wrapper.get('[data-testid="breakdownTransferable"]').text()).toBe('4 DOT');
    expect(wrapper.get('[data-testid="breakdownHeld"]').text()).toBe('6 DOT');
    expect(wrapper.get('[data-testid="breakdownTotal"]').text()).toBe('10 DOT');
  });

  it('draws the sendable part of the bar and says the same in words', () => {
    const wrapper = view({ amount: '10', transferable: '4', held: '6' });

    expect(wrapper.get('.bar-sendable').attributes('style')).toContain('width: 40%');
    expect(wrapper.get('.bar').attributes('aria-label')).toBe('40% can be sent now');
  });

  it('does not divide by nothing, or draw more than the whole', () => {
    expect(view({ amount: '0', transferable: '0', held: '0' }).get('.bar-sendable').attributes('style')).toContain('width: 0%');
    expect(view({ amount: '10', transferable: '15', held: '0' }).get('.bar-sendable').attributes('style')).toContain('width: 100%');
  });
});

describe('check list', () => {
  const checks = [
    { id: 'account' as const, ok: true },
    { id: 'moves' as const, ok: false },
    { id: 'swaps' as const, ok: true },
    { id: 'disclaimer' as const, ok: null },
  ];

  it('says each check in words as well as a mark, in the order asked', () => {
    const wrapper = mount(PortfolioCheckList, { props: { checks, show: ['swaps', 'moves', 'account'] }, global: { stubs } });
    const rows = wrapper.findAll('.check');

    expect(rows.map((row) => row.find('.label').text())).toEqual(['Swaps on Polkaswap', 'Cross-network moves', 'SORA account in this wallet']);
    expect(rows.map((row) => row.find('.value').text())).toEqual(['On', 'Off', 'Yes']);
    expect(rows.map((row) => row.attributes('data-ok'))).toEqual(['true', 'false', 'true']);
  });

  it('says where an unknown check will be read, and says nothing when there is no other wallet', () => {
    const other = mount(PortfolioCheckList, { props: { checks, show: ['disclaimer'], unknownIn: 'Savings' }, global: { stubs } });
    const none = mount(PortfolioCheckList, { props: { checks, show: ['disclaimer'] }, global: { stubs } });

    expect(other.get('.value').text()).toBe('Checked in Savings');
    expect(none.get('.value').text()).toBe('');
  });
});

describe('swap sheet', () => {
  const sheet = (targets: Array<{ assetId: string; symbol: string }>) =>
    mount(PortfolioSwapSheet, {
      props: {
        symbol: 'XOR',
        holding: { walletName: 'Main', transferable: '9' } as never,
        targets,
        checks: { checks: [], blockers: [] },
        switchTo: null,
        busy: false,
        switchFailed: false,
      },
      global: { stubs: { ...stubs, teleport: true } },
    });

  it('hands over the first target until one is picked, even when the targets arrive after it opened', async () => {
    const wrapper = sheet([]);

    await wrapper.get('[data-testid="swapOpen"]').trigger('click');
    expect(wrapper.emitted('confirm')).toEqual([[undefined]]);

    await wrapper.setProps({ targets: [{ assetId: 'val', symbol: 'VAL' }, { assetId: 'pswap', symbol: 'PSWAP' }] });
    expect(wrapper.get('[data-testid="swapTarget-VAL"]').attributes('aria-checked')).toBe('true');

    await wrapper.get('[data-testid="swapTarget-PSWAP"]').trigger('click');
    await wrapper.get('[data-testid="swapOpen"]').trigger('click');
    expect(wrapper.emitted('confirm')?.[1]).toEqual(['pswap']);
  });
});

describe('route card', () => {
  const card = (readiness: Readiness) => mount(PortfolioRouteCard, { props: { readiness, symbol: 'DOT', network: 'Polkadot' }, global: { stubs } });

  it('says swap-ready for a holding on the venue', () => {
    const wrapper = card({ state: 'ready', hops: [] });

    expect(wrapper.get('.lead').text()).toBe('Swap-ready');
    expect(wrapper.get('[data-testid="routeText"]').text()).toContain('Polkaswap shows the price, fee and impact before you sign.');
  });

  it('numbers the moves of a route, with their provider, time and minimum', () => {
    const wrapper = card({ state: 'route', hops: [hop('Hub', 'Mid'), hop('Mid', 'SORA Mainnet', { minimum: '1.1' })] });
    const hops = wrapper.findAll('[data-testid="routeHops"] li');

    expect(wrapper.get('.lead').text()).toBe('2 moves to SORA');
    expect(hops.map((item) => item.find('.hop-path').text())).toEqual(['Hub → Mid', 'Mid → SORA Mainnet']);
    expect(hops[1].text()).toContain('SORA ↔ Substrate · 5–20 minutes');
    expect(hops[1].text()).toContain('Minimum 1.1 DOT');
  });

  it('shows a paused move as paused, and still names the move', () => {
    const wrapper = card({ state: 'off', hops: [hop('Polkadot', 'SORA Mainnet')], cause: 'moves-off' });

    expect(wrapper.get('.lead').text()).toBe('Moves paused');
    expect(wrapper.get('[data-testid="routeText"]').text()).toContain('turned off in this version');
    expect(wrapper.findAll('[data-testid="routeHops"] li')).toHaveLength(1);
  });

  it('says swaps are paused when they are', () => {
    expect(card({ state: 'off', hops: [], cause: 'swaps-off' }).get('.lead').text()).toBe('Swaps paused');
  });

  it('explains no route, and adds what the registry says for Ethereum', () => {
    const none = card({ state: 'none', hops: [] });
    const ethereum = card({ state: 'none', hops: [], unavailable: 'ethereum-to-sora' });

    expect(none.get('.lead').text()).toBe('No route yet');
    expect(none.get('[data-testid="routeText"]').text()).toContain('from Polkadot to SORA');
    expect(none.find('[data-testid="routeUnavailable"]').exists()).toBe(false);
    expect(ethereum.get('[data-testid="routeUnavailable"]').text()).toContain('Ethereum → SORA requires a contract transaction');
  });

  it('shows nothing before the app knows', () => {
    expect(card({ state: 'unknown', hops: [] }).find('.route').exists()).toBe(false);
  });
});

describe('orbit', () => {
  const network = (name: string, fiat: string) => ({ name, amount: fiat, fiat, share: 50, holdings: [] });
  const orbit = (networks: ReturnType<typeof network>[], readiness: Record<string, string>, selected: string | null = null) =>
    mount(PortfolioOrbit, {
      props: {
        symbol: 'DOT',
        networks,
        selected,
        networkIcon: (name: string) => `${name}.svg`,
        amountText: (item: ReturnType<typeof network>) => `${item.amount} DOT`,
        readinessOf: (name: string) => readiness[name] as never,
      },
      global: { stubs },
    });

  it('draws a satellite per network, with its amount, and picks it on a click', async () => {
    const wrapper = orbit([network('Polkadot', '310'), network('Asset Hub', '40')], {});

    expect(wrapper.findAll('.satellite').map((satellite) => satellite.find('.amount').text())).toEqual(['310 DOT', '40 DOT']);

    await wrapper.get('[data-testid="satellite-Asset Hub"]').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['Asset Hub']]);
  });

  it('marks the network picked, and styles each link to Polkaswap by how that network stands to a swap', () => {
    const wrapper = orbit([network('Polkadot', '310'), network('Asset Hub', '40'), network('SORA', '5')], { Polkadot: 'off', 'Asset Hub': 'none', SORA: 'ready' }, 'SORA');

    expect(wrapper.get('[data-testid="satellite-SORA"]').classes()).toContain('satellite--selected');
    expect(wrapper.get('[data-testid="orbitLink-SORA"]').classes()).toContain('link--ready');
    expect(wrapper.get('[data-testid="orbitLink-Polkadot"]').classes()).toContain('link--off');
    expect(wrapper.get('[data-testid="orbitLink-Asset Hub"]').classes()).toContain('link--none');
  });

  it('lights the Polkaswap node by the best way any network has to it', () => {
    expect(orbit([network('A', '1'), network('B', '1')], { A: 'off', B: 'route' }).get('[data-testid="orbitSwapNode"]').classes()).toContain('swap-node--route');
    expect(orbit([network('A', '1')], { A: 'none' }).get('[data-testid="orbitSwapNode"]').classes()).toContain('swap-node--none');
    expect(orbit([network('A', '1'), network('B', '1')], { A: 'ready', B: 'route' }).get('[data-testid="orbitSwapNode"]').classes()).toContain('swap-node--ready');
  });

  it('folds networks past the last satellite into one that stands for the rest, and does not pick on it', async () => {
    const many = Array.from({ length: 9 }, (_, index) => network(`N${index}`, String(100 - index)));
    const wrapper = orbit(many, {});

    // Seven satellites: the six largest networks, and one for the other three.
    expect(wrapper.findAll('.satellite')).toHaveLength(7);
    expect(wrapper.get('[data-testid="satellite-more"]').text()).toContain('+3');
    await wrapper.get('[data-testid="satellite-more"]').trigger('click');
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('is a picture for the pointer: hidden from assistive technology, its satellites out of the tab order', () => {
    const wrapper = orbit([network('Polkadot', '310')], {});

    expect(wrapper.get('[data-testid="portfolioOrbit"]').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('.satellite').attributes('tabindex')).toBe('-1');
  });
});
