import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PortfolioDashboard from '@/screens/portfolio/PortfolioDashboard.vue';
import { Components } from '@/router/routes';
import { locationsLocation } from '@/portfolio/dashboard/handoff';

const boundary = vi.hoisted(() => ({ dashboard: null as any, accounts: [] as any[], push: vi.fn(), setScope: vi.fn(), setLens: vi.fn(), updateAccount: vi.fn(), discover: vi.fn() }));
vi.mock('vue-router', async original => ({ ...await original<typeof import('vue-router')>(), useRouter: () => ({ push: boundary.push }) }));
vi.mock('@/router', () => ({ default: { push: boundary.push, beforeEach: vi.fn(), afterEach: vi.fn(), currentRoute: { value: {} } } }));
vi.mock('@/portfolio/dashboard/usePortfolioDashboard', () => ({ usePortfolioDashboard: () => boundary.dashboard }));
vi.mock('@/portfolio/dashboard/useReadiness', () => ({ useReadiness: () => ({ readinessOf: () => 'ready' }) }));
vi.mock('@/portfolio/dashboard/locales', () => ({ registerDashboardMessages: vi.fn() }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ accounts: boundary.accounts }) }));
vi.mock('@/stores/portfolioDashboard', () => ({ usePortfolioDashboardStore: () => ({ setScope: boundary.setScope, setLens: boundary.setLens }) }));
vi.mock('@/extension/messaging', () => ({ updateCurrentAccount: boundary.updateAccount, forceAssetDiscoverySweep: boundary.discover }));
vi.mock('@/screens/portfolio/PortfolioHero.vue', () => ({ default: { name: 'PortfolioHero', props: ['total', 'changeAmount', 'changePercent', 'caption', 'hiddenCount', 'unpricedCount', 'unavailableCount', 'poolStakesExcluded', 'loading', 'activeKey', 'showSwap'], template: '<div />' } }));
vi.mock('@/screens/portfolio/PortfolioAllWallets.vue', () => ({ default: { name: 'PortfolioAllWallets', props: ['focus', 'activeKey', 'slotOf', 'lens'], template: '<div />' } }));
vi.mock('@/screens/portfolio/PortfolioCountingSheet.vue', () => ({ default: { name: 'PortfolioCountingSheet', props: ['allWallets'], template: '<div />' } }));
vi.mock('@/screens/portfolio/PortfolioSyncSheet.vue', () => ({ default: { name: 'PortfolioSyncSheet', props: ['refreshing'], template: '<div />' } }));
const wrappers: VueWrapper[] = [];
beforeEach(() => {
  vi.clearAllMocks(); boundary.updateAccount.mockResolvedValue(undefined); boundary.discover.mockResolvedValue(undefined);
  boundary.accounts = [{ address: 'alice', walletEcosystem: 'substrate' }];
  boundary.dashboard = { scope: ref('wallet'), lens: ref('token'), pending: ref(false), syncState: ref({}), allocation: ref({ groups: [{ key: 'xor' }, { key: 'other' }], slots: { xor: 2 } }), aggregate: ref({ total: 30, changeAmount: 3, changePercent: 10, hiddenCount: 4, unpricedCount: 5, unavailableCount: 6, poolStakesExcluded: true, wallets: [] }), tokenRows: ref([]), networkSections: ref([]), refresh: vi.fn().mockResolvedValue(undefined) };
});
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()));
function form() {
  const wrapper = shallowMount(PortfolioDashboard, { props: { summary: { total: 10, changeAmount: 1, changePercent: 11, hiddenCount: 1, unpricedCount: 2, unavailableCount: 3, poolStakesExcluded: false } as never, summaryInput: {} as never, hiddenKeys: new Set<string>(), caption: 'Showing SORA', loading: false } });
  wrappers.push(wrapper); return wrapper;
}
function hero(wrapper: VueWrapper) { return wrapper.getComponent({ name: 'PortfolioHero' }); }
function all(wrapper: VueWrapper) { return wrapper.getComponent({ name: 'PortfolioAllWallets' }); }
async function select(wrapper: VueWrapper, key = 'xor') { hero(wrapper).vm.$emit('select', key); await flushPromises(); }

describe('portfolio dashboard orchestration', () => {
  it('uses the selected-wallet summary and switches totals and exclusions with scope', async () => {
    const wrapper = form();
    expect(hero(wrapper).props()).toMatchObject({ total: 10, changeAmount: 1, changePercent: 11, caption: 'Showing SORA', hiddenCount: 1, unpricedCount: 2, unavailableCount: 3, showSwap: true });
    expect(wrapper.find('[data-testid="allWalletsPanel"]').exists()).toBe(false);
    boundary.dashboard.scope.value = 'all'; await flushPromises();
    expect(hero(wrapper).props()).toMatchObject({ total: 30, changeAmount: 3, changePercent: 10, caption: '', hiddenCount: 4, unpricedCount: 5, unavailableCount: 6, poolStakesExcluded: true, showSwap: false });
    expect(all(wrapper).props('slotOf')('xor')).toBe(2); expect(all(wrapper).props('slotOf')('unknown')).toBe(0);
  });
  it('shows loading while either the selected wallet or aggregate is loading', async () => {
    const wrapper = form(); expect(hero(wrapper).props('loading')).toBe(false);
    boundary.dashboard.pending.value = true; await flushPromises(); expect(hero(wrapper).props('loading')).toBe(true);
    boundary.dashboard.pending.value = false; await wrapper.setProps({ loading: true }); expect(hero(wrapper).props('loading')).toBe(true);
  });
  it('highlights a first selection and opens token locations on the second', async () => {
    const wrapper = form(); await select(wrapper); expect(hero(wrapper).props('activeKey')).toBe('xor'); expect(boundary.push).not.toHaveBeenCalled();
    await select(wrapper); expect(hero(wrapper).props('activeKey')).toBeNull(); expect(boundary.push).toHaveBeenCalledWith(locationsLocation('xor'));
  });
  it.each([['token', 'other'], ['network', 'xor'], ['wallet', 'xor']])('does not navigate from a %s/%s selection', async (lens, key) => {
    boundary.dashboard.lens.value = lens; const wrapper = form(); await select(wrapper, key); await select(wrapper, key);
    expect(boundary.push).not.toHaveBeenCalled(); expect(hero(wrapper).props('activeKey')).toBeNull();
  });
  it('repeated selections focus the all-wallets row and resets focus when lens or scope changes', async () => {
    boundary.dashboard.scope.value = 'all'; const wrapper = form(); await select(wrapper); await select(wrapper);
    expect(all(wrapper).props('focus')).toEqual({ key: 'xor', count: 1 }); await select(wrapper);
    expect(all(wrapper).props('focus')).toEqual({ key: 'xor', count: 2 });
    boundary.dashboard.lens.value = 'network'; await flushPromises(); expect(all(wrapper).props('focus')).toBeNull(); expect(hero(wrapper).props('activeKey')).toBeNull();
    await select(wrapper); boundary.dashboard.scope.value = 'wallet'; await flushPromises(); expect(hero(wrapper).props('activeKey')).toBeNull();
  });
  it('clears a highlight when its group disappears', async () => {
    const wrapper = form(); await select(wrapper); boundary.dashboard.allocation.value.groups = []; await flushPromises(); expect(hero(wrapper).props('activeKey')).toBeNull();
  });
  it('forwards fiat, swap, lens and location actions', async () => {
    boundary.dashboard.scope.value = 'all'; const wrapper = form();
    hero(wrapper).vm.$emit('openFiats'); hero(wrapper).vm.$emit('swap'); all(wrapper).vm.$emit('update:lens', 'network'); all(wrapper).vm.$emit('open', 'xor', 'holding-id'); await flushPromises();
    expect(wrapper.emitted('openFiats')).toHaveLength(1); expect(boundary.push).toHaveBeenCalledWith({ name: Components.Polkaswap }); expect(boundary.push).toHaveBeenCalledWith(locationsLocation('xor', 'holding-id')); expect(boundary.setLens).toHaveBeenCalledWith('network');
  });
  it('opens and closes counting and sync detail sheets', async () => {
    const wrapper = form(); hero(wrapper).vm.$emit('openCounting'); hero(wrapper).vm.$emit('openSync'); await flushPromises();
    const counting = wrapper.getComponent({ name: 'PortfolioCountingSheet' }); expect(counting.props('allWallets')).toBe(false);
    counting.vm.$emit('close'); wrapper.getComponent({ name: 'PortfolioSyncSheet' }).vm.$emit('close'); await flushPromises();
    expect(wrapper.findComponent({ name: 'PortfolioCountingSheet' }).exists()).toBe(false); expect(wrapper.findComponent({ name: 'PortfolioSyncSheet' }).exists()).toBe(false);
  });
  it('switches scope only after the chosen account is activated and ignores unknown accounts', async () => {
    boundary.dashboard.scope.value = 'all'; const wrapper = form(); let finish!: () => void;
    boundary.updateAccount.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
    all(wrapper).vm.$emit('openWallet', 'unknown'); await flushPromises(); expect(boundary.updateAccount).not.toHaveBeenCalled();
    all(wrapper).vm.$emit('openWallet', 'alice'); await flushPromises(); expect(boundary.updateAccount).toHaveBeenCalledWith('alice', 'substrate'); expect(boundary.setScope).not.toHaveBeenCalled();
    finish(); await flushPromises(); expect(boundary.setScope).toHaveBeenCalledWith('wallet');
  });
  it('coalesces refresh clicks and still refreshes cached wallets when discovery fails', async () => {
    const wrapper = form(); hero(wrapper).vm.$emit('openSync'); await flushPromises(); const sheet = wrapper.getComponent({ name: 'PortfolioSyncSheet' });
    let fail!: (error: Error) => void; boundary.discover.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
    sheet.vm.$emit('refresh'); sheet.vm.$emit('refresh'); await flushPromises(); expect(sheet.props('refreshing')).toBe(true); expect(boundary.discover).toHaveBeenCalledTimes(1);
    fail(new Error('offline')); await flushPromises(); expect(boundary.dashboard.refresh).toHaveBeenCalledOnce(); expect(sheet.props('refreshing')).toBe(false);
  });
});
