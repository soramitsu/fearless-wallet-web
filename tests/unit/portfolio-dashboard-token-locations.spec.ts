import { flushPromises, mount } from '@vue/test-utils';
import { reactive, ref } from 'vue';
import { dashboardI18n } from './support/dashboardI18n';
import type { PortfolioHolding } from '@extension-base/background/types/types';
import type { MutableAction } from '@extension-base/services/action-capability-service';
import type { WalletPortfolio } from '@/portfolio/dashboard/aggregate';
import type { PolkaswapWalletFacts } from '@/portfolio/dashboard/polkaswapChecks';
import { holdingRefs, type GroupOf } from '@/portfolio/dashboard/facets';
import { SORA_CHAIN_ID, type MoveHop, type Readiness, type ReadinessSubject } from '@/portfolio/dashboard/readiness';

type Actions = Partial<Record<MutableAction, boolean>>;

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  switchTo: vi.fn(),
  failed: undefined as unknown as { value: boolean },
  accounts: undefined as unknown,
  networks: undefined as unknown,
  dashboard: undefined as unknown,
  actions: undefined as unknown,
  readinessOf: vi.fn(),
  facts: undefined as unknown,
  canSend: true,
}));

vi.mock('@/locales/useI18n', () => ({ useI18n: () => dashboardI18n }));
vi.mock('@/portfolio/dashboard/locales', () => ({ registerDashboardMessages: () => undefined }));
vi.mock('@/portfolio/usePortfolioFormatting', () => ({
  usePortfolioFormatting: () => ({
    formatAmount: (value: string) => value,
    formatFiatValue: (value: string) => `$${value}`,
    roleLabel: (role?: string) => role ?? '',
  }),
}));
vi.mock('@/portfolio/usePortfolio', () => ({ usePortfolio: () => ({ summaryInput: {}, hiddenKeys: {} }) }));
vi.mock('@/portfolio/dashboard/usePortfolioDashboard', () => ({ usePortfolioDashboard: () => mocks.dashboard }));
vi.mock('@/portfolio/dashboard/useReadiness', () => ({
  useReadiness: () => ({ actions: mocks.actions, readinessOf: (subject: unknown) => mocks.readinessOf(subject) }),
}));
vi.mock('@/portfolio/dashboard/useWalletSwitch', () => ({
  useWalletSwitch: () => ({ failed: mocks.failed, switching: ref(null), switchTo: mocks.switchTo }),
}));
vi.mock('@/portfolio/dashboard/polkaswapChecks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/portfolio/dashboard/polkaswapChecks')>()),
  derivePolkaswapFacts: () => mocks.facts,
}));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => mocks.accounts }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => mocks.networks }));
vi.mock('@/stores/sendKillSwitch', () => ({ useSendKillSwitchStore: () => ({ vetoes: {} }) }));
vi.mock('@/util/releaseFeatures', () => ({ isNetworkTransferEnabled: () => mocks.canSend }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push, back: mocks.back }) }));

import TokenLocations from '@/screens/portfolio/TokenLocations.vue';

const XOR_ID = '0x0200000000000000000000000000000000000000000000000000000000000000';
const VAL_ID = '0x0200040000000000000000000000000000000000000000000000000000000000';
const PSWAP_ID = '0x0200050000000000000000000000000000000000000000000000000000000000';
const XSTUSD_ID = '0x0200080000000000000000000000000000000000000000000000000000000000';
const SORA_DOT_ID = '0x0200090000000000000000000000000000000000000000000000000000000000';
const XOR_KEY = `substrate:${SORA_CHAIN_ID}:${XOR_ID}`;

const holding = (key: string, symbol: string, networkName: string, amount: string, fiat: string, extra: Partial<PortfolioHolding> = {}): PortfolioHolding => ({
  key,
  symbol,
  name: `${symbol} token`,
  networkName,
  amount,
  transferable: amount,
  fiat,
  changePercent: null,
  ...extra,
});
const wallet = (name: string, holdings: PortfolioHolding[]): WalletPortfolio => ({
  address: `addr-${name}`,
  name,
  total: '0',
  changeAmount: '0',
  changePercent: '0',
  hiddenCount: 0,
  unpricedCount: 0,
  unavailableCount: 0,
  poolStakesExcluded: false,
  holdings,
  staleNetworks: [],
});

const DOT_RELAY = holding('substrate:polkadot:dot', 'DOT', 'Polkadot', '10', '50', { changePercent: '2.5', transferable: '4' });
const DOT_HUB = holding('substrate:hub:dot', 'DOT', 'Asset Hub', '4', '20', { changePercent: '2.5' });
const XOR_MAIN = holding(XOR_KEY, 'XOR', 'SORA', '100', '30', { transferable: '90' });
const XOR_SAVINGS = holding(XOR_KEY, 'XOR', 'SORA', '30', '10');
const REFS = holdingRefs([wallet('Main', [DOT_RELAY, DOT_HUB, XOR_MAIN]), wallet('Savings', [DOT_RELAY, XOR_SAVINGS])]);
const groupOf: GroupOf = (key) => (key === DOT_RELAY.key || key === DOT_HUB.key ? { id: 'dot', symbol: 'DOT', name: 'Polkadot' } : undefined);

const network = (name: string, chainId: string, assets: Array<{ id: string; symbol: string }>) => ({
  name,
  chainId,
  icon: `${name}.svg`,
  assets: assets.map((asset) => ({ ...asset, icon: `${asset.symbol}.svg` })),
});
const NETWORKS = [
  network('Polkadot', 'polkadot-chain', [{ id: 'dot', symbol: 'DOT' }]),
  network('Asset Hub', 'hub-chain', [{ id: 'dot', symbol: 'DOT' }]),
  network('SORA', SORA_CHAIN_ID, [
    { id: XOR_ID, symbol: 'XOR' },
    { id: VAL_ID, symbol: 'VAL' },
    { id: PSWAP_ID, symbol: 'PSWAP' },
    { id: XSTUSD_ID, symbol: 'XSTUSD' },
  ]),
];

const hop = (extra: Partial<MoveHop> = {}): MoveHop => ({
  routeId: 'polkadot>sora',
  providerId: 'sora-substrate-bridge',
  providerName: 'SORA ↔ Substrate',
  protocol: 'SORA Substrate bridge',
  originNetwork: 'Polkadot',
  originChainId: 'polkadot-chain',
  destinationNetwork: 'SORA Mainnet',
  destinationChainId: SORA_CHAIN_ID,
  symbol: 'DOT',
  minimum: null,
  destinationFee: '0',
  enabled: true,
  assetKey: 'substrate:polkadot-chain:dot',
  ...extra,
});

const NONE: Readiness = { state: 'none', hops: [] };
const READY: Readiness = { state: 'ready', hops: [] };
const ROUTE: Readiness = { state: 'route', hops: [hop()], soraAssetId: SORA_DOT_ID };
const GOOD_FACTS: PolkaswapWalletFacts = { hasSoraAccount: true, signable: true, runtimeAvailable: true, usableAssets: true, disclaimerAccepted: true };
const ALL_ON: Actions = { polkaswap: true, crossChainXcm: true, crossChainSoraBridge: true, crossChainLiberland: true };

let readinessByKey: Record<string, Readiness> = {};

beforeEach(() => {
  mocks.push.mockReset().mockResolvedValue(undefined);
  mocks.back.mockReset();
  mocks.switchTo.mockReset().mockResolvedValue(true);
  mocks.failed = ref(false);
  mocks.canSend = true;
  mocks.facts = GOOD_FACTS;
  mocks.actions = ref<Actions | undefined>({ ...ALL_ON });
  mocks.accounts = reactive({
    selectedWallet: { address: 'addr-Main' },
    accounts: [{ address: 'addr-Main' }, { address: 'addr-Savings' }],
    balances: [],
    showPolkaswapAlert: false,
    fiatSymbol: '$',
  });
  mocks.networks = { allNetworks: NETWORKS, getNetwork: (name: string) => NETWORKS.find((candidate) => candidate.name === name) };
  mocks.dashboard = {
    scope: ref('all'),
    pending: ref(false),
    refs: ref(REFS),
    groupOf: ref(groupOf),
    aggregate: ref({ total: '2120' }),
    groupIndex: ref({ memberOfKey: new Map() }),
  };
  readinessByKey = { [DOT_RELAY.key]: ROUTE, [DOT_HUB.key]: NONE, [XOR_KEY]: READY };
  mocks.readinessOf.mockImplementation((subject: ReadinessSubject) => readinessByKey[subject.key] ?? NONE);
});

const screen = (props: { token: string; holding?: string } = { token: 'group:dot' }) =>
  mount(TokenLocations, { props, global: { stubs: { teleport: true, Icon: true, ExternalLogo: true, Shimmer: true } } });

const SAVINGS_POLKADOT = 'addr-Savings|substrate:polkadot:dot';
const MAIN_HUB = 'addr-Main|substrate:hub:dot';
const SAVINGS_XOR = `addr-Savings|${XOR_KEY}`;
const byId = (id: string) => `[data-testid="${id}"]`;
const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

describe('Where it lives: what the screen shows', () => {
  it('shows a placeholder, and says so in words, while the first answer is on its way', () => {
    mocks.dashboard = { ...(mocks.dashboard as object), refs: ref([]), pending: ref(true) };

    const wrapper = screen();

    expect(wrapper.find(byId('locationsLoading')).exists()).toBe(true);
    expect(wrapper.get(byId('locationsLoading')).attributes('role')).toBe('status');
    expect(wrapper.get(byId('locationsLoading')).text()).toBe('Loading where it lives');
    expect(wrapper.find(byId('locationsHead')).exists()).toBe(false);
  });

  it('says the token is gone when it is no longer in the portfolio, and offers the way back', async () => {
    const wrapper = screen({ token: 'group:nothing' });

    expect(wrapper.get(byId('locationsNotFound')).text()).toContain('This token is not in your portfolio any more.');

    await wrapper.get(`${byId('locationsNotFound')} button`).trigger('click');
    expect(mocks.back).toHaveBeenCalledTimes(1);
  });

  it('names the token, its value, its share and how many holdings it has', () => {
    const wrapper = screen();

    expect(wrapper.get('.head-symbol').text()).toBe('DOT');
    expect(wrapper.get(byId('locationsFiat')).text()).toBe('$120');
    expect(wrapper.get('.change').text()).toContain('+2.5%');
    expect(clean(wrapper.get(byId('locationsLine')).text())).toBe('24 DOT · 6% of your portfolio · 3 holdings');
  });

  it('lists every holding, largest first, with its network, its wallet and how it stands to a swap', () => {
    const rows = screen().findAll(`${byId('locationsHoldings')} > li`);

    expect(rows.map((row) => row.get('.holding-network').text())).toEqual(['Polkadot', 'Polkadot', 'Asset Hub']);
    expect(rows.map((row) => row.get('.holding-meta span').text())).toEqual(['Main', 'Savings', 'Main']);
    expect(rows.map((row) => row.find('.readiness').exists() && row.get('.readiness').text())).toEqual(['1 move', '1 move', false]);
  });

  it('opens on the largest holding, or on the one it was asked for', () => {
    const pressed = (wrapper: ReturnType<typeof screen>) => wrapper.findAll(`${byId('locationsHoldings')} .holding`).map((row) => row.attributes('aria-pressed'));
    const first = screen();
    const asked = screen({ token: 'group:dot', holding: MAIN_HUB });

    expect(pressed(first)).toEqual(['true', 'false', 'false']);
    expect(first.get('.panel-title').text()).toBe('DOT · Polkadot · Main');
    expect(pressed(asked)).toEqual(['false', 'false', 'true']);
    expect(asked.get('.panel-title').text()).toBe('DOT · Asset Hub · Main');
  });

  it('picks a holding on a click, and a network on its satellite', async () => {
    const wrapper = screen();

    await wrapper.get(byId(`holding-${SAVINGS_POLKADOT}`)).trigger('click');
    expect(wrapper.get('.panel-title').text()).toBe('DOT · Polkadot · Savings');

    await wrapper.get(byId('satellite-Asset Hub')).trigger('click');
    expect(wrapper.get('.panel-title').text()).toBe('DOT · Asset Hub · Main');
    expect(wrapper.get(byId('satellite-Asset Hub')).classes()).toContain('satellite--selected');
  });

  it('draws the orbit with how each network stands to a swap, and says what the holding cannot send now', () => {
    const wrapper = screen();

    expect(wrapper.get(byId('orbitLink-Polkadot')).classes()).toContain('link--route');
    expect(wrapper.get(byId('orbitLink-Asset Hub')).classes()).toContain('link--none');
    expect(wrapper.get(byId('breakdownTransferable')).text()).toBe('4 DOT');
    expect(wrapper.get(byId('breakdownHeld')).text()).toBe('6 DOT');
    expect(wrapper.get(byId('portfolioRouteCard')).text()).toContain('1 move to SORA');
  });

  it("shows the checks behind a swap, and says where the other wallet's will be read", async () => {
    mocks.actions = ref<Actions>({ polkaswap: true });

    const wrapper = screen();
    const state = () =>
      Object.fromEntries(
        wrapper.findAll(`${byId('polkaswapCard')} .check`).map((row) => [row.attributes('data-testid'), [row.attributes('data-ok'), row.get('.value').text()]])
      );

    expect(state()).toEqual({
      'check-account': ['true', 'Yes'],
      'check-moves': ['false', 'Off'],
      'check-swaps': ['true', 'On'],
      'check-disclaimer': ['true', 'Yes'],
    });

    await wrapper.get(byId(`holding-${SAVINGS_POLKADOT}`)).trigger('click');
    expect(state()).toMatchObject({ 'check-account': ['null', 'Checked in Savings'], 'check-disclaimer': ['null', 'Checked in Savings'], 'check-moves': ['false', 'Off'] });
  });
});

describe('Where it lives: Move', () => {
  it('opens a sheet that names the route, and hands over to the cross-chain screen on a confirm, signing nothing', async () => {
    const wrapper = screen();
    const move = wrapper.get(byId('action-move'));

    expect(move.text()).toBe('Move DOT to SORA');
    expect(move.attributes('disabled')).toBeUndefined();

    await move.trigger('click');
    expect(wrapper.get(byId('moveFrom')).text()).toContain('Polkadot');
    expect(wrapper.get(byId('moveTo')).text()).toContain('SORA Mainnet');
    expect(wrapper.get(byId('moveFacts')).text()).toContain('SORA ↔ Substrate');
    expect(mocks.push).not.toHaveBeenCalled();

    await wrapper.get(byId('moveReview')).trigger('click');
    await flushPromises();

    expect(mocks.switchTo).toHaveBeenCalledWith('addr-Main');
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith({ name: 'CrossChain', query: { originChainId: 'polkadot-chain', assetKey: 'substrate:polkadot-chain:dot' } });
    expect(wrapper.find(byId('portfolioMoveSheet')).exists()).toBe(false);
  });

  it("switches to the holding's wallet first, and says so on the button and in a note", async () => {
    const wrapper = screen({ token: 'group:dot', holding: SAVINGS_POLKADOT });

    expect(wrapper.get(byId('switchNote')).text()).toBe('This is in Savings. We switch to it first and you can switch back any time.');
    expect(wrapper.get(byId('action-move')).text()).toBe('Switch to Savings and review move');

    await wrapper.get(byId('action-move')).trigger('click');
    expect(wrapper.get(byId('moveSwitchNote')).text()).toContain('Savings');
    expect(wrapper.get(byId('moveReview')).text()).toBe('Switch to Savings and review move');

    await wrapper.get(byId('moveReview')).trigger('click');
    await flushPromises();

    expect(mocks.switchTo).toHaveBeenCalledWith('addr-Savings');
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.switchTo.mock.invocationCallOrder[0]).toBeLessThan(mocks.push.mock.invocationCallOrder[0]);
  });

  it('goes nowhere when the wallet could not be switched, says so, and lets the person try again', async () => {
    mocks.switchTo.mockImplementation(async () => {
      mocks.failed.value = true;

      return false;
    });

    const wrapper = screen({ token: 'group:dot', holding: SAVINGS_POLKADOT });

    await wrapper.get(byId('action-move')).trigger('click');
    await wrapper.get(byId('moveReview')).trigger('click');
    await flushPromises();

    expect(mocks.push).not.toHaveBeenCalled();
    expect(wrapper.find(byId('portfolioMoveSheet')).exists()).toBe(true);
    expect(wrapper.findAll('[role="alert"]').map((alert) => alert.text())).toContain('Could not switch to Savings. Choose it from the wallet list.');
    expect(wrapper.get(byId('moveReview')).attributes('disabled')).toBeUndefined();
  });

  it('starts the first move of a longer route, and names where it lands', async () => {
    readinessByKey[DOT_RELAY.key] = {
      state: 'route',
      hops: [hop({ destinationNetwork: 'Asset Hub', destinationChainId: 'hub-chain' }), hop({ routeId: 'hub>sora', originNetwork: 'Asset Hub', originChainId: 'hub-chain', assetKey: 'substrate:hub-chain:dot' })],
    };

    const wrapper = screen();

    expect(wrapper.get(byId('action-move')).text()).toBe('Start: move to Asset Hub');
    expect(wrapper.get(byId('portfolioRouteCard')).text()).toContain('2 moves to SORA');

    await wrapper.get(byId('action-move')).trigger('click');
    await wrapper.get(byId('moveReview')).trigger('click');
    await flushPromises();

    expect(mocks.push).toHaveBeenCalledWith({ name: 'CrossChain', query: { originChainId: 'polkadot-chain', assetKey: 'substrate:polkadot-chain:dot' } });
  });

  it('only ever hands over once, however fast the button is pressed', async () => {
    let release: (switched: boolean) => void = () => undefined;

    mocks.switchTo.mockReturnValue(new Promise<boolean>((resolve) => (release = resolve)));

    const wrapper = screen();

    await wrapper.get(byId('action-move')).trigger('click');
    await Promise.all([wrapper.get(byId('moveReview')).trigger('click'), wrapper.get(byId('moveReview')).trigger('click')]);
    release(true);
    await flushPromises();

    expect(mocks.switchTo).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it('offers to receive on SORA instead, when a reviewed route names the asset there', async () => {
    const wrapper = screen();

    await wrapper.get(byId('action-move')).trigger('click');
    await wrapper.get(byId('moveReceiveOnSora')).trigger('click');
    await flushPromises();

    expect(mocks.push).toHaveBeenCalledWith({ name: 'ReceiveForm', params: { assetId: SORA_DOT_ID, network: 'SORA' } });
  });

  it('does not offer it when no reviewed route names the asset on SORA', async () => {
    readinessByKey[DOT_RELAY.key] = { state: 'route', hops: [hop()] };

    const wrapper = screen();

    await wrapper.get(byId('action-move')).trigger('click');
    expect(wrapper.find(byId('moveReceiveOnSora')).exists()).toBe(false);
  });

  it('keeps a paused move closed, says why, and offers what is open', async () => {
    readinessByKey[DOT_RELAY.key] = { state: 'off', hops: [hop()], cause: 'moves-off', soraAssetId: SORA_DOT_ID };

    const wrapper = screen();
    const move = wrapper.get(byId('action-move'));

    expect(move.text()).toBe('Move unavailable');
    expect(move.attributes('disabled')).toBeDefined();
    expect(wrapper.get(byId('actionReason')).text()).toBe('Cross-network moves are turned off in this version.');
    expect(wrapper.get(byId('portfolioRouteCard')).text()).toContain('Moves paused');

    await move.trigger('click');
    expect(wrapper.find(byId('portfolioMoveSheet')).exists()).toBe(false);

    await wrapper.get(byId('action-receiveOnSora')).trigger('click');
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledWith({ name: 'ReceiveForm', params: { assetId: SORA_DOT_ID, network: 'SORA' } });
  });
});

describe('Where it lives: Swap', () => {
  const xor = () => screen({ token: XOR_KEY });

  it('is the primary action of a holding already on SORA, and opens a sheet with the pair to pick', async () => {
    const wrapper = xor();

    expect(wrapper.get(byId('action-swap')).text()).toBe('Swap XOR on Polkaswap');

    await wrapper.get(byId('action-swap')).trigger('click');

    expect(wrapper.get(byId('swapPay')).text()).toContain('XOR');
    expect(wrapper.get(byId('swapPay')).text()).toContain('Transferable 90 XOR');
    // The pay asset is not offered as the asset to receive, and the first of the others is chosen.
    expect(wrapper.findAll('[role="radio"]').map((target) => [target.text(), target.attributes('aria-checked')])).toEqual([
      ['VAL', 'true'],
      ['PSWAP', 'false'],
      ['XSTUSD', 'false'],
    ]);
  });

  it('hands over to Polkaswap with the pair chosen, and never an amount', async () => {
    const wrapper = xor();

    await wrapper.get(byId('action-swap')).trigger('click');
    await wrapper.get(byId('swapTarget-PSWAP')).trigger('click');
    expect(wrapper.get(byId('swapTarget-PSWAP')).attributes('aria-checked')).toBe('true');

    await wrapper.get(byId('swapOpen')).trigger('click');
    await flushPromises();

    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith({ name: 'Polkaswap', query: { from: XOR_ID, to: PSWAP_ID } });
    expect(wrapper.find(byId('portfolioSwapSheet')).exists()).toBe(false);
  });

  it("switches to the holding's wallet first, when it is in another one", async () => {
    const wrapper = xor();

    await wrapper.get(byId(`holding-${SAVINGS_XOR}`)).trigger('click');
    expect(wrapper.get(byId('action-swap')).text()).toBe('Switch to Savings and open Polkaswap');

    await wrapper.get(byId('action-swap')).trigger('click');
    await wrapper.get(byId('swapOpen')).trigger('click');
    await flushPromises();

    expect(mocks.switchTo).toHaveBeenCalledWith('addr-Savings');
    expect(mocks.push).toHaveBeenCalledWith({ name: 'Polkaswap', query: { from: XOR_ID, to: VAL_ID } });
  });

  it('is closed with the reason said next to it when the wallet cannot swap', async () => {
    mocks.facts = { ...GOOD_FACTS, hasSoraAccount: false };

    const wrapper = xor();
    const swap = wrapper.get(byId('action-swap'));

    expect(swap.text()).toBe('Swap unavailable');
    expect(swap.attributes('disabled')).toBeDefined();
    expect(wrapper.get(byId('actionReason')).text()).toBe('This wallet has no SORA account yet.');

    await swap.trigger('click');
    expect(wrapper.find(byId('portfolioSwapSheet')).exists()).toBe(false);
    expect(wrapper.get(byId('cardOpenPolkaswap')).attributes('disabled')).toBeDefined();
  });

  it('says swaps are paused when release policy has them off', () => {
    mocks.actions = ref<Actions>({ ...ALL_ON, polkaswap: false });
    readinessByKey[XOR_KEY] = { state: 'off', hops: [], cause: 'swaps-off' };

    const wrapper = xor();

    expect(wrapper.get(byId('action-swap')).attributes('disabled')).toBeDefined();
    expect(wrapper.get(byId('actionReason')).text()).toBe('Swaps are turned off in this version.');
    expect(wrapper.get(byId('portfolioRouteCard')).text()).toContain('Swaps paused');
  });

  it("names the wallet on the card's button when opening Polkaswap switches wallet first", async () => {
    const wrapper = screen({ token: 'group:dot', holding: SAVINGS_POLKADOT });

    expect(wrapper.get(byId('cardOpenPolkaswap')).text()).toBe('Switch to Savings and open Polkaswap');

    await wrapper.get(byId('cardOpenPolkaswap')).trigger('click');
    await flushPromises();

    expect(mocks.switchTo).toHaveBeenCalledWith('addr-Savings');
    expect(mocks.push).toHaveBeenCalledWith({ name: 'Polkaswap' });
    expect(screen().get(byId('cardOpenPolkaswap')).text()).toBe('Open Polkaswap');
  });

  it('opens Polkaswap from its card with the asset when it is ready, and plain when it is not', async () => {
    const ready = xor();

    await ready.get(byId('cardOpenPolkaswap')).trigger('click');
    await flushPromises();
    expect(mocks.push).toHaveBeenLastCalledWith({ name: 'Polkaswap', query: { from: XOR_ID } });

    const route = screen();

    await route.get(byId('cardOpenPolkaswap')).trigger('click');
    await flushPromises();
    expect(mocks.push).toHaveBeenLastCalledWith({ name: 'Polkaswap' });
  });
});

describe('Where it lives: Send and Receive', () => {
  it('sends a holding that has no route, naming the asset and its network', async () => {
    const wrapper = screen({ token: 'group:dot', holding: MAIN_HUB });

    expect(wrapper.get(byId('action-send')).text()).toBe('Send');
    expect(wrapper.get(byId('portfolioRouteCard')).text()).toContain('No route yet');

    await wrapper.get(byId('action-send')).trigger('click');
    await flushPromises();

    expect(mocks.push).toHaveBeenCalledWith({ name: 'SendForm', params: { assetId: 'dot', network: 'Asset Hub' } });
  });

  it('receives a holding on the network it is on', async () => {
    const wrapper = screen({ token: 'group:dot', holding: MAIN_HUB });

    await wrapper.get(byId('action-receive')).trigger('click');
    await flushPromises();

    expect(mocks.push).toHaveBeenCalledWith({ name: 'ReceiveForm', params: { assetId: 'dot', network: 'Asset Hub' } });
  });

  it('says why Send is closed on a network where sending is off, and does not hand over', async () => {
    mocks.canSend = false;

    const wrapper = screen({ token: 'group:dot', holding: MAIN_HUB });

    expect(wrapper.get(byId('action-send')).attributes('disabled')).toBeDefined();
    expect(wrapper.get(byId('actionReason')).text()).toBe('Sending is not available on this network right now.');

    await wrapper.get(byId('action-send')).trigger('click');
    await flushPromises();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('names the wallet it will switch to on the button', () => {
    const wrapper = screen({ token: 'group:dot', holding: SAVINGS_POLKADOT });

    expect(wrapper.get(byId('action-send')).text()).toBe('Switch to Savings and send');
    expect(wrapper.get(byId('action-receive')).text()).toBe('Switch to Savings and receive');
  });
});

describe('Where it lives: before the app knows', () => {
  it('claims nothing about a route or a swap until release policy has loaded', () => {
    mocks.actions = ref<Actions | undefined>(undefined);
    readinessByKey = {};
    mocks.readinessOf.mockImplementation(() => ({ state: 'unknown', hops: [] }));

    const wrapper = screen();

    expect(wrapper.find(byId('portfolioRouteCard')).exists()).toBe(false);
    expect(wrapper.find('.readiness').exists()).toBe(false);
    expect(wrapper.get(byId('action-send')).text()).toBe('Send');
  });
});
