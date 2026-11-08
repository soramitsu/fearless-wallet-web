import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, nextTick } from 'vue';
import { APIItemState } from '@extension-base/api/types/networks';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import {
  EVM_ADDRESS,
  SUBSTRATE_ADDRESS,
  networkMap305,
  readLegacy305Fixture,
  readSnapshot,
  type Legacy305FixtureName,
} from '../fixtures/legacy-305/generate';
import type { AccountJson, TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type { PortfolioLens } from '@/portfolio/portfolioViewSettings';
import { WalletEcosystem } from '@/interfaces';
import { POPULAR_NETWORKS } from '@/consts/networks';
import { usePortfolio } from '@/portfolio/usePortfolio';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/router/routes', () => ({ Components: { AssetHistory: 'AssetHistory' } }));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key, tc: (key: string, count: number) => `${key}:${count}` }),
}));
vi.mock('@/extension/messaging', () => ({ getHistory: vi.fn(), toggleFavoriteNetwork: vi.fn(), sendMessage: vi.fn() }));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));
vi.mock('@/extension/messaging/asset-discovery', () => ({ forceAssetDiscoverySweep: vi.fn() }));
vi.mock('@/extension/messaging/nfts', () => ({ fetchNfts: vi.fn() }));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => ({ features: { assetDiscoveryMode: 'shadow' } }) }));

import Currencies from '@/screens/wallet&asset/wallet/Currencies.vue';
import ManageAssets from '@/screens/portfolio/ManageAssets.vue';

const routerPush = vi.fn(() => Promise.resolve());

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
let storage: ReturnType<typeof createLocalStorageStub>;

// The user's 3.0.5 localStorage (the "Hide zero" click there hid every asset that was empty at the time).
function seed(name: Legacy305FixtureName) {
  const { localStorage: entries } = readLegacy305Fixture(name);
  Object.entries(entries).forEach(([key, value]) => storage.setItem(key, value));
}

function ready(groups: TokenGroup[]): TokenGroup[] {
  groups.forEach(({ balances }) =>
    balances.forEach((balance) => Object.assign(balance, { state: APIItemState.READY }))
  );
  return groups;
}

function fund(groups: TokenGroup[], networkName: string, symbol: string, amount: string) {
  const items = groups
    .flatMap(({ balances }) => balances)
    .filter((balance) => balance.name === networkName.toLowerCase() && balance.symbol === symbol);
  if (!items.length) throw new Error(`No ${symbol} on ${networkName}`);
  items.forEach((balance) =>
    Object.assign(balance, { state: APIItemState.READY, total: amount, transferable: amount })
  );
}

function funded(...holdings: [network: string, symbol: string, amount: string][]): TokenGroup[] {
  const groups = ready(getMockAssets(networkMap, WalletEcosystem.Substrate));
  holdings.forEach(([network, symbol, amount]) => fund(groups, network, symbol, amount));
  return groups;
}

// Every case runs for a wallet without a stored grouping and for one that kept By network before the list became one
// list: both get the same token rows.
const LENSES: PortfolioLens[] = ['token', 'network'];
let lens: PortfolioLens;

function open(groups: TokenGroup[], selectedNetwork?: string) {
  const accountsStore = useAccountsStore();
  const networksStore = useNetworksStore();
  networksStore.allNetworks = productionNetworks;
  networksStore.setPrices({ tokenPriceMap: PRICES, tokenPriceChange: {} });
  accountsStore.setSelectedWallet({
    address: SUBSTRATE_ADDRESS,
    ethereumAddress: EVM_ADDRESS,
    name: 'Upgraded',
    walletEcosystem: WalletEcosystem.Substrate,
  } as AccountJson);
  accountsStore.setBalance({ details: groups });
  accountsStore.setIsBalanceLoading(false);
  if (selectedNetwork) accountsStore.setSelectedNetwork(selectedNetwork);
  // By token needs no write: it is what a wallet without a stored choice gets.
  if (lens !== 'token') accountsStore.updatePortfolioView({ lens });
  expect(accountsStore.portfolioView.lens).toBe(lens);
  const scope = effectScope();
  const portfolio = scope.run(() => usePortfolio())!;

  return { accountsStore, portfolio, scope };
}

const globalOptions = {
  mocks: {
    $t: (key: string, count?: number) => (typeof count === 'number' ? `${key}:${count}` : key),
    $router: { push: routerPush },
  },
  stubs: {
    ExternalLogo: true,
    Icon: true,
    Loader: true,
    SearchInput: true,
    Scroll: { template: '<main><slot /></main>' },
    Switcher: {
      props: ['value'],
      emits: ['change'],
      template: '<button type="button" class="switcher-stub" @click="$emit(\'change\', !value)" />',
    },
  },
};

const mountCurrencies = (props: Record<string, unknown> = {}) =>
  mount(Currencies, { props: { filterValue: '', ...props }, global: globalOptions });

const testnetMark = (...elements: { find: VueWrapper['find'] }[]) =>
  elements.some((element) => element.find('[data-testid="testnetBadge"]').exists()) ? ':testnet' : '';

// What the list shows, one "Network:SYMBOL" per asset: the rows of each detected network section, and each token row
// (a token on several networks as "group:SYMBOL").
const rows = (wrapper: VueWrapper) => [
  ...wrapper
    .findAll('.network-section')
    .flatMap((section) =>
      section
        .findAll('.asset-row')
        .map((row) => `${section.attributes('data-network')}:${row.get('.asset-symbol').text()}${testnetMark(row, section)}`)
    ),
  ...wrapper.findAll('.token-row').map((row) =>
    row.attributes('data-network')
      ? `${row.attributes('data-network')}:${row.attributes('data-symbol')}${testnetMark(row)}`
      : `group:${row.attributes('data-symbol')}`
  ),
];

// The hidden assets Manage assets lists, one "Network:SYMBOL" per asset.
const hiddenRows = (page: VueWrapper) =>
  page
    .findAll('[data-testid="manageHidden"] [data-testid="manageAssetRow"]')
    .map((row) => `${row.attributes('data-network')}:${row.attributes('data-symbol')}`);

const text = (wrapper: VueWrapper, testId: string) => {
  const element = wrapper.find(`[data-testid="${testId}"]`);
  return element.exists() ? element.text() : null;
};

// Review (the notice) and "N hidden not included · Manage" (the footer) open Manage assets on its hidden assets, with
// a search of its own: what was typed in the list does not narrow it.
async function review(wrapper: VueWrapper, trigger = 'reviewHiddenFunds'): Promise<VueWrapper> {
  routerPush.mockClear();
  await wrapper.get(`[data-testid="${trigger}"]`).trigger('click');
  expect(routerPush).toHaveBeenCalledExactlyOnceWith({ name: 'ManageAssets', query: { focus: 'hidden' } });

  const page = mount(ManageAssets, { props: { focus: 'hidden' }, global: globalOptions });
  await nextTick();
  return page;
}

describe.each(LENSES)('reviewing hidden funds after a 3.0.5 upgrade (by %s)', (currentLens) => {
  beforeEach(() => {
    lens = currentLens;
    storage = createLocalStorageStub();
    vi.stubGlobal('localStorage', storage);
    setActivePinia(createPinia());
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('announces matching visible assets in either lens', async () => {
    vi.useFakeTimers();
    const { scope } = open(funded(['Polkadot', 'dot', '12.5']), 'Polkadot');
    const wrapper = mountCurrencies({ filterValue: 'DOT' });
    try {
      await nextTick();
      await vi.advanceTimersByTimeAsync(200);
      expect(text(wrapper, 'searchResultStatus')).toBe('common.searchAmongAssets: 1');
      await wrapper.setProps({ filterValue: 'no-such-fixture-asset' });
      await vi.advanceTimersByTimeAsync(200);
      expect(text(wrapper, 'searchResultStatus')).toBe('common.searchAmongAssets: 0');
    } finally {
      wrapper.unmount();
      scope.stop();
      vi.useRealTimers();
    }
  });

  it('lists a funded hidden asset outside the Popular filter that new accounts start with', async () => {
    seed('hide-zero');
    // Polkadot AssetHub has no rank, so Popular leaves it out; USDT there was hidden at zero and funded later.
    const { portfolio, scope } = open(
      funded(['Polkadot', 'dot', '12.5'], ['Polkadot AssetHub', 'usdt', '250']),
      POPULAR_NETWORKS
    );
    const wrapper = mountCurrencies();
    await nextTick();

    expect(portfolio.summary.value).toMatchObject({ hiddenCount: 1, hiddenValue: '250' });
    expect(text(wrapper, 'hiddenFundsNotice')).toContain('portfolioPage.hiddenFundsNotice:1');

    const page = await review(wrapper);

    expect(hiddenRows(page)).toContain('Polkadot AssetHub:USDT');
    // Every hidden asset of the wallet, whatever network the list is narrowed to.
    expect(hiddenRows(page)).toHaveLength(portfolio.summary.value.hiddenAssetCount);
    page.unmount();
    wrapper.unmount();
    scope.stop();
  });

  it('lists a funded hidden asset on another network than the one selected, instead of "No hidden assets"', async () => {
    seed('hide-zero');
    const { scope } = open(funded(['Polkadot', 'dot', '12.5'], ['Kusama', 'ksm', '3']), 'Polkadot');
    const wrapper = mountCurrencies();
    await nextTick();

    expect(text(wrapper, 'hiddenNotIncluded')).toBe('portfolioPage.hiddenNotIncluded:1');
    const page = await review(wrapper, 'hiddenNotIncluded');

    expect(hiddenRows(page)).toContain('Kusama:KSM');
    expect(text(page, 'manageNoMatches')).toBeNull();
    page.unmount();
    wrapper.unmount();
    scope.stop();
  });

  it('lists every hidden asset the summary counts, under a network filter too', async () => {
    seed('switches');
    const { portfolio, scope } = open(funded(['Polkadot', 'dot', '1']), POPULAR_NETWORKS);
    const page = mount(ManageAssets, { props: { focus: 'hidden' }, global: globalOptions });
    await nextTick();

    expect(portfolio.summary.value.hiddenAssetCount).toBeGreaterThan(0);
    expect(hiddenRows(page)).toHaveLength(portfolio.summary.value.hiddenAssetCount);
    page.unmount();
    scope.stop();
  });

  it('ignores a search typed in the list before Review: Manage assets has a search of its own', async () => {
    seed('hide-zero');
    const { scope } = open(funded(['Polkadot', 'dot', '12.5'], ['Kusama', 'ksm', '3']));
    const wrapper = mountCurrencies({ filterValue: 'dot' });
    await nextTick();
    expect(rows(wrapper)).not.toContain('Kusama:KSM');

    const page = await review(wrapper);

    expect(hiddenRows(page)).toContain('Kusama:KSM');
    expect(hiddenRows(page).some((row) => !/dot/i.test(row))).toBe(true);
    page.unmount();

    // Back in the list, its search still applies.
    expect(rows(wrapper).every((row) => /dot/i.test(row))).toBe(true);
    wrapper.unmount();
    scope.stop();
  });
});

describe.each(LENSES)('test networks in the portfolio (by %s)', (currentLens) => {
  beforeEach(() => {
    lens = currentLens;
    storage = createLocalStorageStub();
    vi.stubGlobal('localStorage', storage);
    setActivePinia(createPinia());
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows a test network chosen as the only network, labelled, with the Testnets switch off', async () => {
    const { accountsStore, scope } = open(
      funded(['Polkadot', 'dot', '1'], ['Avail Turing Testnet', 'avail', '50']),
      'Avail Turing Testnet'
    );
    expect(accountsStore.portfolioView.showTestnets).toBe(false);
    const wrapper = mountCurrencies();
    await nextTick();

    expect(rows(wrapper)).toEqual(['Avail Turing Testnet:AVAIL:testnet']);
    expect(text(wrapper, 'infoText')).toBeNull();
    expect(text(wrapper, 'testnetsNotShown')).toBeNull();
    wrapper.unmount();
    scope.stop();
  });

  it('says how many funded testnet assets the list leaves out and shows them on request', async () => {
    const { accountsStore, portfolio, scope } = open(
      funded(['Polkadot', 'dot', '1'], ['Avail Turing Testnet', 'avail', '50'])
    );
    const wrapper = mountCurrencies();
    await nextTick();

    expect(rows(wrapper)).not.toContain('Avail Turing Testnet:AVAIL:testnet');
    expect(text(wrapper, 'testnetsNotShown')).toBe('portfolioPage.testnetsNotShown:1');
    // Testnet value is never part of the total.
    expect(portfolio.summary.value.total).toBe('5');

    await wrapper.get('[data-testid="testnetsNotShown"]').trigger('click');

    expect(accountsStore.portfolioView.showTestnets).toBe(true);
    expect(rows(wrapper)).toContain('Avail Turing Testnet:AVAIL:testnet');
    expect(text(wrapper, 'testnetsNotShown')).toBeNull();
    expect(portfolio.summary.value.total).toBe('5');
    wrapper.unmount();
    scope.stop();
  });
});

describe.each(LENSES)('portfolio empty states (by %s)', (currentLens) => {
  beforeEach(() => {
    lens = currentLens;
    storage = createLocalStorageStub();
    vi.stubGlobal('localStorage', storage);
    setActivePinia(createPinia());
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not call a wallet whose only funds are hidden empty', async () => {
    seed('hide-zero');
    const { scope } = open(funded(['Kusama', 'ksm', '3']));
    const wrapper = mountCurrencies();
    await nextTick();

    expect(text(wrapper, 'hiddenFundsNotice')).toContain('portfolioPage.hiddenFundsNotice:1');
    expect(text(wrapper, 'hiddenNotIncluded')).toBe('portfolioPage.hiddenNotIncluded:1');
    expect(text(wrapper, 'infoText')).toBeNull();
    wrapper.unmount();
    scope.stop();
  });

  it('names a filtered view without a balance as such, not as an empty wallet of popular networks', async () => {
    const { scope } = open(funded(['Kusama', 'ksm', '3']), 'Polkadot');
    const wrapper = mountCurrencies();
    await nextTick();

    expect(text(wrapper, 'infoText')).toContain('portfolioPage.noBalanceInView');
    expect(text(wrapper, 'infoText')).toContain('portfolioPage.scanDescription');
    // No block of empty tokens: Add tokens opens Manage assets on that network instead.
    expect(wrapper.find('[data-testid="portfolioZeroNetworks"]').exists()).toBe(false);
    expect(rows(wrapper)).toEqual([]);
    await wrapper.get('[data-testid="emptyAddTokens"]').trigger('click');
    expect(routerPush).toHaveBeenLastCalledWith({ name: 'ManageAssets', query: { focus: 'search', search: 'Polkadot' } });
    wrapper.unmount();
    scope.stop();
  });

  it('tells the owner of an empty wallet how to get started', async () => {
    const { scope } = open(funded());
    const wrapper = mountCurrencies();
    await nextTick();

    expect(text(wrapper, 'infoText')).toContain('portfolioPage.emptyWalletTitle');
    expect(text(wrapper, 'infoText')).toContain('portfolioPage.emptyWalletDescription');
    expect(text(wrapper, 'infoText')).not.toContain('portfolioPage.scanDescription');
    // Popular tokens are suggested in Manage assets, one tap away, instead of a block of empty rows here.
    expect(wrapper.find('[data-testid="portfolioZeroNetworks"]').exists()).toBe(false);
    expect(text(wrapper, 'emptyAddTokens')).toBe('walletHome.list.addTokens');
    wrapper.unmount();
    scope.stop();
  });
});
