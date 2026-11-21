import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { SyncState } from '@/portfolio/dashboard/syncState';

vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key),
    tc: (key: string, count: number) => `${key}:${count}`,
  }),
}));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ fiatSymbol: '$' }) }));

import PortfolioHero from '@/screens/portfolio/PortfolioHero.vue';

// Brand kit v4 SPEC "Shikiban" parts 2, 5 and 6 on the balance card: the sync dial and its count, the composition's
// marks, and the line a changed total draws.
const hero = (sync: Pick<SyncState, 'kind'> & Partial<SyncState>, props: Record<string, unknown> = {}) =>
  mount(PortfolioHero, {
    props: {
      total: '10', changeAmount: '0', changePercent: '0', caption: '', hiddenCount: 0, unpricedCount: 0, unavailableCount: 0,
      poolStakesExcluded: false, loading: false, showSwap: false, sync: { savedWallets: [], staleNetworks: [], pendingNetworks: [], ...sync },
      ...props,
    } as never,
    global: { stubs: { Icon: true, Shimmer: true, RoundActions: true } },
  });

describe('the balance card as an instrument', () => {
  it('shows how many networks have answered, of how many, in place of the word while they answer', () => {
    const wrapper = hero({ kind: 'updating', pendingNetworks: ['Kusama'] }, { syncProgress: { done: 9, failed: 0, total: 14 } });
    const chip = wrapper.get('[data-testid="heroSync"]');

    expect(chip.get('[data-testid="heroSyncCount"]').text()).toBe('9 / 14');
    expect(chip.text()).toBe('9 / 14');
    // The accessible label keeps the wallet's own words, with the numbers.
    expect(chip.attributes('aria-label')).toContain('portfolioDashboard.sync.updating 9 / 14');
    const dial = chip.get('[data-testid="syncDial"]');
    expect(dial.attributes('data-state')).toBe('syncing');
    expect(Number(dial.attributes('data-lit'))).toBeCloseTo(9 / 14, 4);
    expect(wrapper.get('[data-testid="heroCard"]').classes()).toContain('hero-card--syncing');
  });

  it('never shows more answered than there are', () => {
    const wrapper = hero({ kind: 'updating' }, { syncProgress: { done: 20, failed: 0, total: 14 } });

    expect(wrapper.get('[data-testid="heroSyncCount"]').text()).toBe('14 / 14');
  });

  it('keeps the word when the wallet does not know its numbers, and once it is live', () => {
    const unknown = hero({ kind: 'updating', pendingNetworks: ['Kusama'] });
    expect(unknown.find('[data-testid="heroSyncCount"]').exists()).toBe(false);
    expect(unknown.get('[data-testid="heroSync"]').text()).toBe('portfolioDashboard.sync.updating');

    const live = hero({ kind: 'live' }, { syncProgress: { done: 14, failed: 0, total: 14 } });
    expect(live.find('[data-testid="heroSyncCount"]').exists()).toBe(false);
    expect(live.get('[data-testid="heroSync"]').text()).toBe('portfolioDashboard.sync.live');
    expect(live.get('[data-testid="syncDial"]').attributes('data-state')).toBe('live');
    expect(live.get('[data-testid="heroCard"]').classes()).not.toContain('hero-card--syncing');
  });

  it('passes the share that gave up to the dial', () => {
    const wrapper = hero({ kind: 'partial', staleNetworks: ['Kusama', 'Acala'] }, { syncProgress: { done: 14, failed: 2, total: 16 } });

    expect(wrapper.get('[data-testid="syncDial"]').attributes('data-failed')).toBe('0.125');
  });

  it('carries the composition\'s marks and lattice, hidden from assistive technology, and declares its depth', () => {
    const wrapper = hero({ kind: 'live' });

    expect(wrapper.get('[data-testid="heroMarks"]').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('[data-testid="heroLattice"]').find('pattern path').attributes('d')).toMatch(/^M/);
    expect(wrapper.get('[data-testid="heroBand"]').element.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(wrapper.get('[data-testid="heroCard"]').attributes('data-fw-depth')).toBe('0');
  });

  it('draws a line under a total that changes, never under the first one', async () => {
    const wrapper = hero({ kind: 'live' });
    expect(wrapper.find('[data-testid="heroTotalLine"]').exists()).toBe(false);

    await wrapper.setProps({ total: '12' });
    expect(wrapper.get('[data-testid="heroTotalLine"]').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('[data-testid="heroTotal"]').classes()).toContain('total--tick-up');
  });
});
