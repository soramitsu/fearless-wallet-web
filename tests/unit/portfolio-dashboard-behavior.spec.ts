import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PortfolioDashboard from '@/screens/portfolio/PortfolioDashboard.vue';
import { Components } from '@/router/routes';
import { locationsLocation } from '@/portfolio/dashboard/handoff';

const boundary = vi.hoisted(() => ({ dashboard: null as any, accounts: [] as any[], recoveryOnly: new Set<string>(), push: vi.fn(), setScope: vi.fn(), setLens: vi.fn(), updateAccount: vi.fn(), discover: vi.fn(), switchTo: vi.fn() }));
vi.mock('vue-router', async original => ({ ...await original<typeof import('vue-router')>(), useRouter: () => ({ push: boundary.push }) }));
vi.mock('@/router', () => ({ default: { push: boundary.push, beforeEach: vi.fn(), afterEach: vi.fn(), currentRoute: { value: {} } } }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key), tc: (key: string) => key }) }));
vi.mock('@/portfolio/dashboard/usePortfolioDashboard', () => ({ usePortfolioDashboard: () => boundary.dashboard }));
vi.mock('@/portfolio/dashboard/useReadiness', () => ({ useReadiness: () => ({ readinessOf: () => 'ready' }) }));
vi.mock('@/portfolio/dashboard/useWalletSwitch', () => ({ useWalletSwitch: () => ({ switching: ref(null), failed: ref(false), switchTo: boundary.switchTo }) }));
vi.mock('@/portfolio/dashboard/locales', () => ({ registerDashboardMessages: vi.fn() }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ accounts: boundary.accounts, fiatSymbol: '$' }) }));
vi.mock('@/stores/portfolioDashboard', () => ({ usePortfolioDashboardStore: () => ({ setScope: boundary.setScope, setLens: boundary.setLens }) }));
vi.mock('@/extension/messaging', () => ({ updateCurrentAccount: boundary.updateAccount, forceAssetDiscoverySweep: boundary.discover }));
vi.mock('@/consts/global', async original => ({ ...await original<typeof import('@/consts/global')>(), IS_EXTENSION: true }));
vi.mock('@/util/walletRecoveryPolicy', () => ({ isSelectedWalletRecoveryOnly: (_accounts: unknown, address: string) => boundary.recoveryOnly.has(address) }));
vi.mock('@/screens/portfolio/PortfolioHero.vue', () => ({ default: { name: 'PortfolioHero', props: ['total', 'changeAmount', 'changePercent', 'caption', 'hiddenCount', 'unpricedCount', 'unavailableCount', 'poolStakesExcluded', 'loading', 'showSwap', 'showSend', 'showReceive'], template: '<div />' } }));
vi.mock('@/screens/portfolio/PortfolioAllWallets.vue', () => ({ default: { name: 'PortfolioAllWallets', props: ['focus', 'activeKey', 'slotOf', 'lens'], template: '<div />' } }));
vi.mock('@/screens/portfolio/PortfolioCountingSheet.vue', () => ({ default: { name: 'PortfolioCountingSheet', props: ['allWallets'], template: '<div />' } }));
vi.mock('@/screens/portfolio/PortfolioSyncSheet.vue', () => ({ default: { name: 'PortfolioSyncSheet', props: ['refreshing'], template: '<div />' } }));
vi.mock('@/screens/portfolio/PortfolioSheet.vue', () => ({ default: { name: 'PortfolioSheet', props: ['title', 'testid'], emits: ['close'], template: '<section :data-testid="testid"><slot /></section>' } }));
vi.mock('@/screens/portfolio/AssetPickerSheet.vue', () => ({ default: { name: 'AssetPickerSheet', props: ['action'], emits: ['close'], template: '<div />' } }));
const wrappers: VueWrapper[] = [];
const wallet = (address: string, name: string, total: string) => ({ address, name, total });
beforeEach(() => {
  vi.clearAllMocks(); boundary.updateAccount.mockResolvedValue(undefined); boundary.discover.mockResolvedValue(undefined); boundary.switchTo.mockResolvedValue(true);
  boundary.accounts = [{ address: 'alice', walletEcosystem: 'substrate' }, { address: 'bob', walletEcosystem: 'substrate' }];
  boundary.recoveryOnly = new Set();
  boundary.dashboard = { scope: ref('wallet'), lens: ref('token'), pending: ref(false), syncState: ref({}), allocation: ref({ groups: [{ key: 'xor' }, { key: 'other' }], slots: { xor: 2 } }), aggregate: ref({ total: 30, changeAmount: 3, changePercent: 10, hiddenCount: 4, unpricedCount: 5, unavailableCount: 6, poolStakesExcluded: true, wallets: [wallet('alice', 'Alice', '20'), wallet('bob', 'Bob', '10')] }), tokenRows: ref([]), networkSections: ref([]), refresh: vi.fn().mockResolvedValue(undefined) };
});
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()));
function form(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  // The wallet chooser's sheet renders its content, so its options can be picked.
  const wrapper = shallowMount(PortfolioDashboard, { props: { summary: { total: 10, changeAmount: 1, changePercent: 11, hiddenCount: 1, unpricedCount: 2, unavailableCount: 3, poolStakesExcluded: false } as never, summaryInput: {} as never, hiddenKeys: new Set<string>(), caption: 'Showing SORA', loading: false, ...props }, slots, global: { stubs: { PortfolioSheet: false } } });
  wrappers.push(wrapper); return wrapper;
}
function hero(wrapper: VueWrapper) { return wrapper.getComponent({ name: 'PortfolioHero' }); }
function all(wrapper: VueWrapper) { return wrapper.getComponent({ name: 'PortfolioAllWallets' }); }
const chooserOptions = (wrapper: VueWrapper) => wrapper.findAll('[data-testid="walletChooserOption"]').map((option) => option.attributes('data-address'));

describe('portfolio dashboard orchestration', () => {
  it('uses the selected-wallet summary and switches totals and exclusions with scope', async () => {
    const wrapper = form();
    expect(hero(wrapper).props()).toMatchObject({ total: 10, changeAmount: 1, changePercent: 11, caption: 'Showing SORA', hiddenCount: 1, unpricedCount: 2, unavailableCount: 3, showSwap: true, showSend: true, showReceive: true });
    expect(wrapper.find('[data-testid="allWalletsPanel"]').exists()).toBe(false);
    boundary.dashboard.scope.value = 'all'; await flushPromises();
    expect(hero(wrapper).props()).toMatchObject({ total: 30, changeAmount: 3, changePercent: 10, caption: '', hiddenCount: 4, unpricedCount: 5, unavailableCount: 6, poolStakesExcluded: true, showSwap: true, showSend: true, showReceive: true });
    expect(all(wrapper).props('slotOf')('xor')).toBe(2); expect(all(wrapper).props('slotOf')('unknown')).toBe(0);
  });
  it('shows loading while either the selected wallet or aggregate is loading', async () => {
    const wrapper = form(); expect(hero(wrapper).props('loading')).toBe(false);
    boundary.dashboard.pending.value = true; await flushPromises(); expect(hero(wrapper).props('loading')).toBe(true);
    boundary.dashboard.pending.value = false; await wrapper.setProps({ loading: true }); expect(hero(wrapper).props('loading')).toBe(true);
  });
  it('closes Receive and Swap to a wallet that cannot take funds, in one wallet and in All wallets', async () => {
    const single = form({ swapAvailable: false, receiveAvailable: false });
    expect(hero(single).props()).toMatchObject({ showSend: true, showReceive: false, showSwap: false });
    boundary.recoveryOnly = new Set(['alice', 'bob']); boundary.dashboard.scope.value = 'all';
    const everyWalletOld = form();
    expect(hero(everyWalletOld).props()).toMatchObject({ showSend: true, showReceive: false, showSwap: false });
  });
  it('puts the wallet screen toolbar under the balance, telling it which scope is on screen', async () => {
    const wrapper = form({}, { toolbar: '<nav class="toolbar-stub">{{ params.allWallets }}</nav>' });
    expect(wrapper.get('.toolbar-stub').text()).toBe('false');
    boundary.dashboard.scope.value = 'all'; await flushPromises();
    expect(wrapper.get('.toolbar-stub').text()).toBe('true');
  });
  it('lists All wallets on the Assets view only', async () => {
    boundary.dashboard.scope.value = 'all';
    expect(form().find('[data-testid="allWalletsPanel"]').exists()).toBe(true);
    expect(form({ showAllWalletsList: false }).find('[data-testid="allWalletsPanel"]').exists()).toBe(false);
  });
  it('opens the token picker for Send and Receive of one wallet, and Polkaswap for Swap', async () => {
    const wrapper = form();
    hero(wrapper).vm.$emit('send'); await flushPromises();
    expect(wrapper.getComponent({ name: 'AssetPickerSheet' }).props('action')).toBe('send');
    wrapper.getComponent({ name: 'AssetPickerSheet' }).vm.$emit('close'); await flushPromises();
    expect(wrapper.findComponent({ name: 'AssetPickerSheet' }).exists()).toBe(false);
    hero(wrapper).vm.$emit('receive'); await flushPromises();
    expect(wrapper.getComponent({ name: 'AssetPickerSheet' }).props('action')).toBe('receive');
    hero(wrapper).vm.$emit('swap'); await flushPromises();
    expect(boundary.push).toHaveBeenCalledWith({ name: Components.Polkaswap });
    expect(wrapper.find('[data-testid="walletChooser"]').exists()).toBe(false);
  });
  it('asks All wallets which wallet to send from, switches to it, then asks which token', async () => {
    boundary.dashboard.scope.value = 'all'; const wrapper = form();
    hero(wrapper).vm.$emit('send'); await flushPromises();
    expect(chooserOptions(wrapper)).toEqual(['alice', 'bob']);
    expect(wrapper.findComponent({ name: 'AssetPickerSheet' }).exists()).toBe(false);
    await wrapper.get('[data-testid="walletChooserOption"][data-address="bob"]').trigger('click'); await flushPromises();
    expect(boundary.switchTo).toHaveBeenCalledWith('bob');
    expect(boundary.setScope).toHaveBeenCalledWith('wallet');
    expect(wrapper.find('[data-testid="walletChooser"]').exists()).toBe(false);
    expect(wrapper.getComponent({ name: 'AssetPickerSheet' }).props('action')).toBe('send');
  });
  it('offers only wallets that can take funds for Receive and Swap, and swaps in the wallet chosen', async () => {
    boundary.recoveryOnly = new Set(['bob']); boundary.dashboard.scope.value = 'all'; const wrapper = form();
    hero(wrapper).vm.$emit('receive'); await flushPromises();
    expect(chooserOptions(wrapper)).toEqual(['alice']);
    wrapper.getComponent({ name: 'PortfolioSheet' }).vm.$emit('close'); await flushPromises();
    hero(wrapper).vm.$emit('swap'); await flushPromises();
    expect(chooserOptions(wrapper)).toEqual(['alice']);
    await wrapper.get('[data-testid="walletChooserOption"]').trigger('click'); await flushPromises();
    expect(boundary.switchTo).toHaveBeenCalledWith('alice');
    expect(boundary.push).toHaveBeenCalledWith({ name: Components.Polkaswap });
  });
  it('stays on the chooser and says so when the wallet could not be switched to', async () => {
    boundary.switchTo.mockResolvedValueOnce(false); boundary.dashboard.scope.value = 'all'; const wrapper = form();
    hero(wrapper).vm.$emit('send'); await flushPromises();
    await wrapper.get('[data-testid="walletChooserOption"][data-address="bob"]').trigger('click'); await flushPromises();
    expect(boundary.setScope).not.toHaveBeenCalled();
    expect(wrapper.findComponent({ name: 'AssetPickerSheet' }).exists()).toBe(false);
    expect(wrapper.get('[data-testid="walletChooser"] [role="alert"]').text()).toContain('portfolioDashboard.where.switchFailed');
  });
  it('forwards fiat, lens and location actions', async () => {
    boundary.dashboard.scope.value = 'all'; const wrapper = form();
    hero(wrapper).vm.$emit('openFiats'); all(wrapper).vm.$emit('update:lens', 'network'); all(wrapper).vm.$emit('open', 'xor', 'holding-id'); await flushPromises();
    expect(wrapper.emitted('openFiats')).toHaveLength(1); expect(boundary.push).toHaveBeenCalledWith(locationsLocation('xor', 'holding-id')); expect(boundary.setLens).toHaveBeenCalledWith('network');
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
