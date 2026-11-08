import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, nextTick } from 'vue';
import { APIItemState } from '@extension-base/api/types/networks';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import { EVM_ADDRESS, SUBSTRATE_ADDRESS, networkMap305, readLegacy305Fixture, readSnapshot } from '../fixtures/legacy-305/generate';
import type { AccountJson, TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type { PortfolioAsset, PortfolioNetworkSection } from '@/portfolio/assetIdentity';
import {
  MANAGE_SEARCH_LIMIT,
  buildManageEntries,
  buildManageView,
  isInWalletList,
  manageSearchRank,
  manageSectionOf,
  placeManageEntries,
  preferenceForSwitch,
} from '@/portfolio/manageAssets';
import { WalletEcosystem } from '@/interfaces';
import { usePortfolio } from '@/portfolio/usePortfolio';
import { registryAssetKey } from '@/portfolio/zeroRule';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';

const push = vi.fn(() => Promise.resolve());

vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/router/routes', () => ({ Components: { AssetHistory: 'AssetHistory', TokenOverview: 'TokenOverview' } }));
// Interpolated values are kept, so a test can read what a label names.
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key),
    tc: (key: string, count: number) => `${key}:${count}`,
  }),
}));
vi.mock('@/extension/messaging', () => ({ getHistory: vi.fn(), toggleFavoriteNetwork: vi.fn(), sendMessage: vi.fn() }));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));
vi.mock('@/extension/messaging/asset-discovery', () => ({ forceAssetDiscoverySweep: vi.fn() }));
vi.mock('@/extension/messaging/nfts', () => ({ fetchNfts: vi.fn() }));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => ({ features: { assetDiscoveryMode: 'shadow' } }) }));

import ManageAssets from '@/screens/portfolio/ManageAssets.vue';
import Currencies from '@/screens/wallet&asset/wallet/Currencies.vue';
import AssetSearchField from '@/screens/wallet&asset/wallet/AssetSearchField.vue';

const SHADOW = { surfaceDiscoveredAssets: false };
const VISIBLE = { surfaceDiscoveredAssets: true };

const asset = (overrides: Partial<PortfolioAsset> = {}): PortfolioAsset => {
  const symbol = overrides.symbol ?? 'DOT';
  const networkName = overrides.networkName ?? 'Polkadot';

  return {
    key: `substrate:${networkName}:${symbol}`,
    keyParts: { ecosystem: 'substrate', chainId: networkName, assetId: symbol.toLowerCase() },
    groupId: symbol.toLowerCase(),
    networkName,
    networkIcon: networkName,
    assetId: symbol.toLowerCase(),
    name: symbol,
    symbol,
    icon: symbol,
    balanceText: '0',
    transferableText: '0',
    hasBalance: false,
    fiatValue: null,
    hasPrice: false,
    unitPrice: null,
    priceChangePercent: null,
    priceTrust: 'canonicalAsset',
    trust: 'verified',
    source: 'registry',
    preference: 'auto',
    preferenceSource: 'auto',
    hidden: false,
    isNative: false,
    isUtility: false,
    isTestnet: false,
    isReady: true,
    ...overrides,
  };
};

const held = (overrides: Partial<PortfolioAsset> = {}): PortfolioAsset =>
  asset({ balanceText: '2', transferableText: '2', hasBalance: true, fiatValue: '10', ...overrides });

const section = (assets: PortfolioAsset[], detectedAssets: PortfolioAsset[] = []): PortfolioNetworkSection => ({
  key: 'section',
  name: 'Section',
  icon: '',
  ecosystem: 'substrate',
  chainId: 'section',
  address: SUBSTRATE_ADDRESS,
  subtotal: '0',
  hasPricedAssets: false,
  isTestnet: false,
  stale: false,
  coverage: 'complete',
  assets,
  detectedAssets,
});

const RANKS: Record<string, number> = { 'SORA Mainnet': 0, Polkadot: 8, Kusama: 9, Moonbeam: 12 };
const entriesOf = (assets: PortfolioAsset[], popular: string[] = []) =>
  buildManageEntries({
    sections: [section(assets)],
    rules: SHADOW,
    isPopular: ({ symbol }) => popular.includes(symbol),
    networkRank: (name) => RANKS[name] ?? Number.POSITIVE_INFINITY,
  });
const keysOf = (entries: { asset: PortfolioAsset }[]) => entries.map(({ asset: { symbol, networkName } }) => `${networkName}:${symbol}`);

describe('Manage assets: which assets the list shows', () => {
  it('lists what the wallet holds with nothing switched on, and a token with no balance only once it is added', () => {
    expect(isInWalletList(held(), SHADOW)).toBe(true);
    expect(isInWalletList(asset(), SHADOW)).toBe(false);
    expect(isInWalletList(asset({ preference: 'shown' }), SHADOW)).toBe(true);
    // A balance nobody could load may be one: it is never treated as an empty token.
    expect(isInWalletList(asset({ balanceUnavailable: true }), SHADOW)).toBe(true);
    expect(isInWalletList(held({ preference: 'hidden', hidden: true }), SHADOW)).toBe(false);
  });

  it('lists a held token that is not verified only when discovered tokens are shown, or when the owner shows it', () => {
    const unverified = held({ trust: 'unverified', fiatValue: null });

    expect(isInWalletList(unverified, SHADOW)).toBe(false);
    expect(isInWalletList(unverified, VISIBLE)).toBe(true);
    expect(isInWalletList({ ...unverified, preference: 'shown' }, SHADOW)).toBe(true);
    // An unverified token with nothing in it is never listed, shown or not.
    expect(isInWalletList(asset({ trust: 'unverified', preference: 'shown' }), SHADOW)).toBe(false);
  });

  it('writes the lightest choice that puts an asset in the list or takes it out', () => {
    // On: an empty token is added; a held one hidden before goes back to automatic.
    expect(preferenceForSwitch(asset(), true, SHADOW)).toBe('shown');
    expect(preferenceForSwitch(held({ preference: 'hidden', hidden: true }), true, SHADOW)).toBe('auto');
    expect(preferenceForSwitch(asset({ preference: 'hidden', hidden: true }), true, SHADOW)).toBe('shown');
    expect(preferenceForSwitch(held({ trust: 'unverified' }), true, SHADOW)).toBe('shown');
    expect(preferenceForSwitch(held({ trust: 'unverified', preference: 'hidden', hidden: true }), true, VISIBLE)).toBe('auto');

    // Off: a held token is hidden; a token that was only added becomes automatic again, so a deposit still shows it.
    expect(preferenceForSwitch(held(), false, SHADOW)).toBe('hidden');
    expect(preferenceForSwitch(held({ preference: 'shown' }), false, SHADOW)).toBe('hidden');
    expect(preferenceForSwitch(asset({ preference: 'shown' }), false, SHADOW)).toBe('auto');
    expect(preferenceForSwitch(asset({ balanceUnavailable: true }), false, SHADOW)).toBe('hidden');
    expect(preferenceForSwitch(held({ trust: 'unverified' }), false, VISIBLE)).toBe('hidden');
    expect(preferenceForSwitch(held({ trust: 'unverified', preference: 'shown' }), false, SHADOW)).toBe('auto');
  });

  it('puts every asset in one place: in the list, found but not verified, to add, or hidden', () => {
    expect(manageSectionOf(held(), SHADOW)).toBe('wallet');
    expect(manageSectionOf(asset({ preference: 'shown' }), SHADOW)).toBe('wallet');
    expect(manageSectionOf(asset(), SHADOW)).toBe('add');
    expect(manageSectionOf(asset({ preference: 'hidden', hidden: true }), SHADOW)).toBe('hidden');
    expect(manageSectionOf(held({ preference: 'hidden', hidden: true }), SHADOW)).toBe('hidden');
    expect(manageSectionOf(held({ trust: 'unverified' }), SHADOW)).toBe('unverified');
    expect(manageSectionOf(held({ trust: 'unverified' }), VISIBLE)).toBe('wallet');
    expect(manageSectionOf(asset({ trust: 'unverified' }), SHADOW)).toBeUndefined();
  });

  it('says which listed tokens were added at zero, and lists each asset once', () => {
    const added = asset({ symbol: 'KSM', networkName: 'Kusama', preference: 'shown' });
    const dot = held();
    const entries = buildManageEntries({ sections: [section([dot, added]), section([dot])], rules: SHADOW });

    expect(entries.map(({ asset: { symbol }, added: wasAdded }) => [symbol, wasAdded])).toEqual([
      ['DOT', false],
      ['KSM', true],
    ]);
  });

  it('suggests popular tokens before anything is typed, and finds any token by symbol, name or network after', () => {
    const entries = entriesOf(
      [
        held({ symbol: 'DOT', networkName: 'Polkadot', fiatValue: '50' }),
        held({ symbol: 'GLMR', networkName: 'Moonbeam', fiatValue: '80' }),
        asset({ symbol: 'KSM', networkName: 'Kusama' }),
        asset({ symbol: 'XOR', networkName: 'SORA Mainnet' }),
        asset({ symbol: 'USDT', name: 'Tether USD', networkName: 'Polkadot AssetHub' }),
        asset({ symbol: 'USDC', name: 'USD Coin', networkName: 'Moonbeam' }),
      ],
      ['KSM', 'XOR']
    );

    const idle = buildManageView(entries);
    // The most valuable holding first; popular suggestions by network rank; the rest only through search.
    expect(keysOf(idle.wallet)).toEqual(['Moonbeam:GLMR', 'Polkadot:DOT']);
    expect(keysOf(idle.add)).toEqual(['SORA Mainnet:XOR', 'Kusama:KSM']);
    expect(idle.addableCount).toBe(4);

    expect(keysOf(buildManageView(entries, { query: 'tether' }).add)).toEqual(['Polkadot AssetHub:USDT']);
    // A network is named from the start of a word: "dot" is DOT, not every token on Polkadot AssetHub.
    expect(keysOf(buildManageView(entries, { query: 'dot' }).add)).toEqual([]);
    expect(keysOf(buildManageView(entries, { query: 'dot' }).wallet)).toEqual(['Polkadot:DOT']);
    // Every word must match: a token and its network.
    expect(keysOf(buildManageView(entries, { query: 'usd moonbeam' }).add)).toEqual(['Moonbeam:USDC']);
    expect(keysOf(buildManageView(entries, { query: 'moonbeam' }).add)).toEqual(['Moonbeam:USDC']);
    expect(keysOf(buildManageView(entries, { query: 'moonbeam' }).wallet)).toEqual(['Moonbeam:GLMR']);
  });

  it('ranks the exact symbol above a prefix, a name and a network', () => {
    const query = 'eth';

    expect(manageSearchRank(asset({ symbol: 'ETH', networkName: 'Ethereum' }), query)).toBeLessThan(
      manageSearchRank(asset({ symbol: 'ETHX', networkName: 'Ethereum' }), query)!
    );
    expect(manageSearchRank(asset({ symbol: 'ETHX' }), query)).toBeLessThan(
      manageSearchRank(asset({ symbol: 'WETH', name: 'Wrapped Ether', networkName: 'Moonbeam' }), query)!
    );
    expect(manageSearchRank(asset({ symbol: 'USDC', name: 'USD Coin', networkName: 'Ethereum' }), query)).toBe(4);
    expect(manageSearchRank(asset({ symbol: 'USDC.E', name: 'Bridged USDC' }), 'usdc.e')).toBe(0);
    expect(manageSearchRank(asset({ symbol: 'DOT' }), 'ksm')).toBeUndefined();
  });

  it('keeps a switched row where it was, so a switch never moves it from under the pointer', () => {
    const dot = held();
    const before = entriesOf([dot]);
    const placement = placeManageEntries(before);
    // Switched off: the asset is hidden now.
    const after = entriesOf([{ ...dot, preference: 'hidden', hidden: true }]);

    expect(keysOf(buildManageView(after, { placement }).wallet)).toEqual(['Polkadot:DOT']);
    expect(buildManageView(after, { placement }).wallet[0].listed).toBe(false);
    // Opened again (no placement), it is with the hidden ones.
    expect(keysOf(buildManageView(after).hidden)).toEqual(['Polkadot:DOT']);
  });

  it('lists a limited number of search results and says how many more match', () => {
    const tokens = Array.from({ length: MANAGE_SEARCH_LIMIT + 7 }, (_, index) =>
      asset({ symbol: `TOK${index}`, name: 'Token', networkName: `Network ${index}` })
    );
    const view = buildManageView(entriesOf(tokens), { query: 'tok' });

    expect(view.add).toHaveLength(MANAGE_SEARCH_LIMIT);
    expect(view.moreToAdd).toBe(7);
  });
});

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

const PRICES = { polkadot: 5, kusama: 20, ethereum: 2000, tether: 1, 'usd-coin': 1 };
const networkMap = networkMap305(readSnapshot());
const productionNetworks = Object.values(networkMap).map((network) => ({ ...network, favorite: [] })) as NetworkJson[];

function funded(...holdings: [network: string, symbol: string, amount: string][]): TokenGroup[] {
  const groups = getMockAssets(networkMap, WalletEcosystem.Substrate);
  groups.forEach(({ balances }) => balances.forEach((balance) => Object.assign(balance, { state: APIItemState.READY })));
  holdings.forEach(([network, symbol, amount]) => {
    const items = groups
      .flatMap(({ balances }) => balances)
      .filter((balance) => balance.name === network.toLowerCase() && balance.symbol === symbol);
    if (!items.length) throw new Error(`No ${symbol} on ${network}`);
    items.forEach((balance) => Object.assign(balance, { total: amount, transferable: amount }));
  });
  return groups;
}

function open(groups: TokenGroup[], selectedNetwork?: string) {
  const accountsStore = useAccountsStore();
  const networksStore = useNetworksStore();
  networksStore.allNetworks = productionNetworks;
  networksStore.setPrices({ tokenPriceMap: PRICES, tokenPriceChange: {} });
  accountsStore.setSelectedWallet({
    address: SUBSTRATE_ADDRESS,
    ethereumAddress: EVM_ADDRESS,
    name: 'Main',
    walletEcosystem: WalletEcosystem.Substrate,
  } as AccountJson);
  accountsStore.setBalance({ details: groups });
  accountsStore.setIsBalanceLoading(false);
  if (selectedNetwork) accountsStore.setSelectedNetwork(selectedNetwork);
  const scope = effectScope();
  const portfolio = scope.run(() => usePortfolio())!;

  return { accountsStore, portfolio, scope };
}

const switcherStub = {
  props: ['value', 'ariaLabel'],
  emits: ['change'],
  template: '<button type="button" role="switch" :aria-checked="value" :aria-label="ariaLabel" @click="$emit(\'change\', !value)" />',
};

const routerPush = vi.fn(() => Promise.resolve());
const stubs = {
  ExternalLogo: true,
  Icon: true,
  Loader: true,
  SearchInput: true,
  Scroll: { template: '<main><slot /></main>' },
  Switcher: switcherStub,
};
const mocks = {
  $t: (key: string, count?: number) => (typeof count === 'number' ? `${key}:${count}` : key),
  $router: { push: routerPush },
};

const mountManage = (props: Record<string, unknown> = {}) => mount(ManageAssets, { props, global: { stubs, mocks } });
const mountList = () => mount(Currencies, { props: { filterValue: '' }, global: { stubs, mocks } });

/** "Network:SYMBOL" of each row of one Manage section. */
const sectionRows = (wrapper: VueWrapper, testId: string) =>
  wrapper
    .findAll(`[data-testid="${testId}"] [data-testid="manageAssetRow"]`)
    .map((row) => `${row.attributes('data-network')}:${row.attributes('data-symbol')}`);

const row = (wrapper: VueWrapper, testId: string, key: string) => {
  const found = wrapper
    .findAll(`[data-testid="${testId}"] [data-testid="manageAssetRow"]`)
    .find((candidate) => `${candidate.attributes('data-network')}:${candidate.attributes('data-symbol')}` === key);
  if (!found) throw new Error(`No ${key} in ${testId}: ${sectionRows(wrapper, testId).join(', ')}`);
  return found;
};

const switchOf = (wrapper: VueWrapper, testId: string, key: string) => row(wrapper, testId, key).get('[role="switch"]');

/** "Network:SYMBOL" of each single-network row of the wallet's list, "group:SYMBOL" for a token on several. */
const listRows = (wrapper: VueWrapper) =>
  wrapper.findAll('.token-row').map((token) =>
    token.attributes('data-network')
      ? `${token.attributes('data-network')}:${token.attributes('data-symbol')}`
      : `group:${token.attributes('data-symbol')}`
  );

const keyOf = (wrapper: VueWrapper, testId: string, key: string) => row(wrapper, testId, key).attributes('data-asset-key')!;

describe('the Manage assets page', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageStub());
    setActivePinia(createPinia());
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    routerPush.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows what the wallet holds without anyone switching it on, and suggests popular tokens to add', async () => {
    const { accountsStore, scope } = open(funded(['Polkadot', 'dot', '12.5'], ['Kusama', 'ksm', '3']));
    const wrapper = mountManage();
    await nextTick();

    // The most valuable first: 12.5 DOT at $5 before 3 KSM at $20.
    expect(sectionRows(wrapper, 'manageShown')).toEqual(['Polkadot:DOT', 'Kusama:KSM']);
    expect(switchOf(wrapper, 'manageShown', 'Polkadot:DOT').attributes('aria-checked')).toBe('true');
    // Popular tokens the wallet does not hold yet, switched off; nothing was written to show the holdings.
    expect(sectionRows(wrapper, 'manageAdd')).toContain('Moonbeam:GLMR');
    expect(sectionRows(wrapper, 'manageAdd')).not.toContain('Polkadot:DOT');
    expect(switchOf(wrapper, 'manageAdd', 'Moonbeam:GLMR').attributes('aria-checked')).toBe('false');
    expect(accountsStore.assetPreferences).toEqual({});
    expect(wrapper.find('[data-testid="manageSearchHint"]').exists()).toBe(true);
    wrapper.unmount();
    scope.stop();
  });

  it('adds a token with no balance, keeps its row in place, and the wallet list then shows it at zero', async () => {
    const { accountsStore, scope } = open(funded(['Polkadot', 'dot', '12.5']));
    const wrapper = mountManage();
    await nextTick();

    const key = keyOf(wrapper, 'manageAdd', 'Moonbeam:GLMR');
    await switchOf(wrapper, 'manageAdd', 'Moonbeam:GLMR').trigger('click');

    expect(accountsStore.assetPreferences[key]).toBe('shown');
    // Still under the suggestions, now switched on and marked as added.
    expect(switchOf(wrapper, 'manageAdd', 'Moonbeam:GLMR').attributes('aria-checked')).toBe('true');
    expect(row(wrapper, 'manageAdd', 'Moonbeam:GLMR').get('[data-testid="manageAssetNote"]').text()).toBe(
      'walletHome.manage.added'
    );
    wrapper.unmount();

    // Opened again, it is with the tokens the wallet shows.
    const reopened = mountManage();
    await nextTick();
    expect(sectionRows(reopened, 'manageShown')).toEqual(['Polkadot:DOT', 'Moonbeam:GLMR']);
    reopened.unmount();

    const list = mountList();
    await nextTick();
    expect(listRows(list)).toEqual(['Polkadot:DOT', 'Moonbeam:GLMR']);
    list.unmount();
    scope.stop();
  });

  it('finds any supported token by search, and its network by name', async () => {
    const { accountsStore, scope } = open(funded(['Polkadot', 'dot', '12.5']));
    const wrapper = mountManage();
    await nextTick();

    wrapper.findComponent(AssetSearchField).vm.$emit('change', 'usdt asset');
    await nextTick();

    const results = sectionRows(wrapper, 'manageAdd');
    expect(results).toContain('Polkadot AssetHub:USDT');
    expect(results).toContain('Kusama AssetHub:USDT');
    expect(results.every((result) => /AssetHub:USDT$/u.test(result))).toBe(true);
    // No holding matches, so the list of shown tokens steps aside, as do the options.
    expect(wrapper.find('[data-testid="manageShown"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="manageOptions"]').exists()).toBe(false);

    await switchOf(wrapper, 'manageAdd', 'Polkadot AssetHub:USDT').trigger('click');
    const key = keyOf(wrapper, 'manageAdd', 'Polkadot AssetHub:USDT');
    expect(accountsStore.assetPreferences[key]).toBe('shown');

    wrapper.findComponent(AssetSearchField).vm.$emit('change', 'no such token anywhere');
    await nextTick();
    expect(wrapper.get('[data-testid="manageNoMatches"]').text()).toContain('no such token anywhere');
    wrapper.unmount();
    scope.stop();
  });

  it('hides a held token in place, and lists it with the hidden ones next time', async () => {
    const { accountsStore, portfolio, scope } = open(funded(['Polkadot', 'dot', '12.5'], ['Kusama', 'ksm', '3']));
    const wrapper = mountManage();
    await nextTick();

    const key = keyOf(wrapper, 'manageShown', 'Kusama:KSM');
    await switchOf(wrapper, 'manageShown', 'Kusama:KSM').trigger('click');

    expect(accountsStore.assetPreferences[key]).toBe('hidden');
    expect(switchOf(wrapper, 'manageShown', 'Kusama:KSM').attributes('aria-checked')).toBe('false');
    expect(portfolio.summary.value).toMatchObject({ hiddenCount: 1, total: '62.5' });

    // A slip is undone where it happened: switched back on, the held token is automatic again.
    await switchOf(wrapper, 'manageShown', 'Kusama:KSM').trigger('click');
    expect(accountsStore.assetPreferences[key]).toBe('auto');
    await switchOf(wrapper, 'manageShown', 'Kusama:KSM').trigger('click');
    wrapper.unmount();

    const reopened = mountManage();
    await nextTick();
    expect(sectionRows(reopened, 'manageShown')).toEqual(['Polkadot:DOT']);
    expect(sectionRows(reopened, 'manageHidden')).toEqual(['Kusama:KSM']);
    reopened.unmount();
    scope.stop();
  });

  it('shows a 3.0.5 hide with funds again, labelled, and opens on the hidden assets from Review', async () => {
    const { localStorage: entries } = readLegacy305Fixture('hide-zero');
    Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    const { accountsStore, portfolio, scope } = open(funded(['Polkadot', 'dot', '12.5'], ['Kusama', 'ksm', '3']));
    const wrapper = mountManage({ focus: 'hidden' });
    await nextTick();
    await nextTick();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(sectionRows(wrapper, 'manageHidden')).toContain('Kusama:KSM');
    expect(sectionRows(wrapper, 'manageHidden')).toHaveLength(portfolio.summary.value.hiddenAssetCount);
    expect(row(wrapper, 'manageHidden', 'Kusama:KSM').find('[data-testid="hiddenPreviousVersion"]').exists()).toBe(true);
    // The funded hidden token comes first, with what it holds.
    expect(sectionRows(wrapper, 'manageHidden')[0]).toBe('Kusama:KSM');
    expect(row(wrapper, 'manageHidden', 'Kusama:KSM').get('[data-testid="manageAssetBalance"]').text()).toContain('KSM');

    const key = keyOf(wrapper, 'manageHidden', 'Kusama:KSM');
    await switchOf(wrapper, 'manageHidden', 'Kusama:KSM').trigger('click');

    // An explicit Auto overrides the 3.0.5 hide, and the 3.0.5 keys are left as they were.
    expect(accountsStore.assetPreferences[key]).toBe('auto');
    expect(portfolio.summary.value.hiddenCount).toBe(0);
    Object.entries(entries).forEach(([storageKey, value]) => expect(localStorage.getItem(storageKey)).toBe(value));
    wrapper.unmount();
    scope.stop();
  });

  it('opens ready to search when Add tokens opened it, with the network the list was narrowed to', async () => {
    const { scope } = open(funded(['Polkadot', 'dot', '1']));
    const wrapper = mount(ManageAssets, {
      props: { focus: 'search', search: 'Kusama' },
      attachTo: document.body,
      global: {
        stubs: { ...stubs, SearchInput: { props: ['value'], template: '<label><input class="search-stub" :value="value" /></label>' } },
        mocks,
      },
    });
    await nextTick();

    expect(document.activeElement?.classList.contains('search-stub')).toBe(true);
    expect((wrapper.get('.search-stub').element as HTMLInputElement).value).toBe('Kusama');
    // Kusama's own KSM first: popular, and named by the search; KSM elsewhere and Kusama's other tokens follow.
    expect(sectionRows(wrapper, 'manageAdd')[0]).toBe('Kusama:KSM');
    expect(sectionRows(wrapper, 'manageAdd')).toContain('Kusama AssetHub:USDT');
    wrapper.unmount();
    scope.stop();
  });

  it('lists test networks once they are switched on in Options', async () => {
    const { accountsStore, scope } = open(funded(['Polkadot', 'dot', '1']));
    const wrapper = mountManage();
    await nextTick();

    const testnets = wrapper.get('[data-testid="manageTestnets"]');
    expect(testnets.attributes('aria-label')).toBe('walletHome.manage.showTestnets');
    await testnets.trigger('click');

    expect(accountsStore.portfolioView.showTestnets).toBe(true);
    wrapper.unmount();
    scope.stop();
  });

  it('names every switch by its token and network for screen readers', async () => {
    const { scope } = open(funded(['Polkadot', 'dot', '1']));
    const wrapper = mountManage();
    await nextTick();

    const label = switchOf(wrapper, 'manageShown', 'Polkadot:DOT').attributes('aria-label');
    expect(label).toBe('walletHome.manage.switchLabel:{"symbol":"DOT","network":"Polkadot"}');
    expect(wrapper.findAll('[data-testid="manageAssetRow"] button:not([role="switch"])')).toHaveLength(0);
    wrapper.unmount();
    scope.stop();
  });
});

describe('the wallet list with Manage assets', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageStub());
    setActivePinia(createPinia());
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    routerPush.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('lists only what the wallet holds, with no block of empty tokens, and offers Add tokens under it', async () => {
    const { scope } = open(funded(['Polkadot', 'dot', '12.5']));
    const wrapper = mountList();
    await nextTick();

    expect(listRows(wrapper)).toEqual(['Polkadot:DOT']);
    expect(wrapper.find('[data-testid="portfolioZeroNetworks"]').exists()).toBe(false);

    await wrapper.get('[data-testid="addTokens"]').trigger('click');
    expect(routerPush).toHaveBeenLastCalledWith({ name: 'ManageAssets', query: { focus: 'search' } });
    wrapper.unmount();
    scope.stop();
  });

  it('greets an empty wallet with a way to add tokens, and lists the ones added at zero instead', async () => {
    const { accountsStore, scope } = open(funded());
    const wrapper = mountList();
    await nextTick();

    expect(wrapper.get('[data-testid="infoText"]').text()).toContain('portfolioPage.emptyWalletTitle');
    expect(listRows(wrapper)).toEqual([]);
    await wrapper.get('[data-testid="emptyAddTokens"]').trigger('click');
    expect(routerPush).toHaveBeenLastCalledWith({ name: 'ManageAssets', query: { focus: 'search' } });

    const moonbeam = productionNetworks.find(({ name }) => name === 'Moonbeam')!;
    const glmr = moonbeam.assets.find(({ symbol }) => symbol === 'glmr')!;
    accountsStore.setAssetPreference({ key: registryAssetKey(moonbeam, glmr), preference: 'shown' });
    await nextTick();

    expect(listRows(wrapper)).toEqual(['Moonbeam:GLMR']);
    expect(wrapper.find('[data-testid="infoText"]').exists()).toBe(false);
    wrapper.unmount();
    scope.stop();
  });

  it('ignores a "Hide zero balances" choice an earlier version stored, so a token added at zero is never hidden', async () => {
    const { accountsStore, scope } = open(funded(['Polkadot', 'dot', '12.5']));
    accountsStore.updatePortfolioView({ hideZero: true });
    const moonbeam = productionNetworks.find(({ name }) => name === 'Moonbeam')!;
    accountsStore.setAssetPreference({
      key: registryAssetKey(moonbeam, moonbeam.assets.find(({ symbol }) => symbol === 'glmr')!),
      preference: 'shown',
    });
    const wrapper = mountList();
    await nextTick();

    expect(listRows(wrapper)).toEqual(['Polkadot:DOT', 'Moonbeam:GLMR']);
    wrapper.unmount();
    scope.stop();
  });

  it('opens Manage on the network a filtered list holds nothing on', async () => {
    const { scope } = open(funded(['Kusama', 'ksm', '3']), 'Polkadot');
    const wrapper = mountList();
    await nextTick();

    expect(wrapper.get('[data-testid="infoText"]').text()).toContain('portfolioPage.noBalanceInView');
    await wrapper.get('[data-testid="emptyAddTokens"]').trigger('click');
    expect(routerPush).toHaveBeenLastCalledWith({ name: 'ManageAssets', query: { focus: 'search', search: 'Polkadot' } });
    wrapper.unmount();
    scope.stop();
  });

  it('opens Manage on the hidden assets from the notice and from the footer', async () => {
    const { localStorage: entries } = readLegacy305Fixture('hide-zero');
    Object.entries(entries).forEach(([key, value]) => localStorage.setItem(key, value));
    const { scope } = open(funded(['Polkadot', 'dot', '12.5'], ['Kusama', 'ksm', '3']));
    const wrapper = mountList();
    await nextTick();

    await wrapper.get('[data-testid="reviewHiddenFunds"]').trigger('click');
    expect(routerPush).toHaveBeenLastCalledWith({ name: 'ManageAssets', query: { focus: 'hidden' } });
    routerPush.mockClear();
    await wrapper.get('[data-testid="hiddenNotIncluded"]').trigger('click');
    expect(routerPush).toHaveBeenLastCalledWith({ name: 'ManageAssets', query: { focus: 'hidden' } });
    wrapper.unmount();
    scope.stop();
  });
});
