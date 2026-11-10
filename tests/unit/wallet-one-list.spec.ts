import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, nextTick } from 'vue';
import { APIItemState } from '@extension-base/api/types/networks';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import { EVM_ADDRESS, SUBSTRATE_ADDRESS, networkMap305, readSnapshot } from '../fixtures/legacy-305/generate';
import type { AccountJson, TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { usePortfolio } from '@/portfolio/usePortfolio';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('vue-router', () => ({ useRouter: () => router }));
vi.mock('@/router/routes', () => ({
  Components: { AssetHistory: 'AssetHistory', TokenOverview: 'TokenOverview', Currencies: 'Currencies' },
}));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key),
    tc: (key: string, count: number) => `${key}:${count}`,
  }),
}));
vi.mock('@/extension/messaging', () => ({ getHistory: vi.fn(), toggleFavoriteNetwork: vi.fn(), sendMessage: vi.fn() }));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));
vi.mock('@/extension/messaging/asset-discovery', () => ({ forceAssetDiscoverySweep: vi.fn() }));
vi.mock('@/extension/messaging/nfts', () => ({ fetchNfts: vi.fn() }));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => ({ features: { assetDiscoveryMode: 'shadow' } }) }));

import Currencies from '@/screens/wallet&asset/wallet/Currencies.vue';
import ManageAssets from '@/screens/portfolio/ManageAssets.vue';

const PRICES = { polkadot: 5, kusama: 20, ethereum: 2000, tether: 1, 'usd-coin': 1 };
const BEFORE_UPGRADE = 1_700_000_000_000;

const snapshot = readSnapshot();
const networkMap = networkMap305(snapshot);
const networks = Object.values(networkMap).map((network) => ({ ...network, favorite: [] })) as NetworkJson[];

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

const wallet = (whenCreated = Date.now() + 60_000) =>
  ({
    address: SUBSTRATE_ADDRESS,
    ethereumAddress: EVM_ADDRESS,
    name: 'Main',
    walletEcosystem: WalletEcosystem.Substrate,
    whenCreated,
  }) as AccountJson;

function fund(groups: TokenGroup[], networkName: string, symbol: string, amount: string) {
  const items = groups
    .flatMap(({ balances }) => balances)
    .filter((balance) => balance.name === networkName.toLowerCase() && balance.symbol === symbol);
  if (!items.length) throw new Error(`No ${symbol} on ${networkName}`);
  items.forEach((balance) => Object.assign(balance, { state: APIItemState.READY, total: amount, transferable: amount }));
}

function holdings(): TokenGroup[] {
  const groups = getMockAssets(networkMap, WalletEcosystem.Substrate);
  groups.forEach(({ balances }) => balances.forEach((balance) => Object.assign(balance, { state: APIItemState.READY })));
  fund(groups, 'Kusama', 'ksm', '3');
  fund(groups, 'Kusama AssetHub', 'ksm', '1');
  fund(groups, 'Polkadot', 'dot', '12.5');
  fund(groups, 'Polkadot AssetHub', 'dot', '2');
  fund(groups, 'Ethereum', 'eth', '0.75');
  fund(groups, 'Ethereum', 'usdt', '40');
  fund(groups, 'Ethereum', 'usdc', '100');
  return groups;
}

let scope: ReturnType<typeof effectScope> | undefined;
const wrappers: VueWrapper[] = [];

/** A wallet created after this layout first ran (no one-time note) unless it is older. */
function openWallet({ whenCreated }: { whenCreated?: number } = {}) {
  const accountsStore = useAccountsStore();
  const networksStore = useNetworksStore();
  networksStore.allNetworks = networks;
  networksStore.setPrices({ tokenPriceMap: PRICES, tokenPriceChange: {} });
  vi.spyOn(networksStore, 'loadIndexerNetworkBalance').mockResolvedValue(undefined as never);
  accountsStore.recordPortfolioLayoutFirstRun();
  accountsStore.setAccounts({ accounts: [wallet(whenCreated)] } as never);
  accountsStore.setSelectedWallet(wallet(whenCreated));
  accountsStore.setBalance({ details: holdings() });
  accountsStore.setIsBalanceLoading(false);
  accountsStore.setSelectedNetwork('all');

  scope = effectScope();
  const portfolio = scope.run(() => usePortfolio())!;

  return { accountsStore, networksStore, portfolio };
}

const mountList = (props: Record<string, unknown> = {}) => {
  const wrapper = mount(Currencies, {
    props: { filterValue: '', ...props },
    global: {
      mocks: {
        $t: (key: string, values?: unknown) => (values && typeof values === 'object' ? `${key} ${JSON.stringify(values)}` : key),
        $router: router,
      },
      stubs: {
        teleport: true,
        ExternalLogo: true,
        Icon: true,
        Loader: true,
        Scroll: { template: '<main><slot /></main>' },
        SearchInput: {
          props: ['value', 'placeholder'],
          emits: ['change'],
          template: '<label class="search-stub">{{ placeholder }}<input :value="value" @input="$emit(\'change\', $event.target.value)" /></label>',
        },
        NetworkPicker: { name: 'NetworkPicker', props: ['type'], template: '<div data-testid="networkPicker" />' },
        Switcher: { props: ['value'], template: '<button type="button" />' },
      },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
};

/** Each token row as `SYMBOL@network` when held on one network or `SYMBOL×count` when on several. */
const rows = (wrapper: VueWrapper) =>
  wrapper.findAll('[data-testid="portfolioTokenList"] .token-row').map((row) => {
    const count = row.find('[data-testid="networkCount"]');
    const symbol = row.get('.token-symbol').text().split(/\s/)[0];
    return count.exists() ? `${symbol}×${count.text()}` : `${symbol}@${row.get('[data-testid="tokenNetwork"]').text()}`;
  });
const fundedRows = (wrapper: VueWrapper) =>
  wrapper.findAll('[data-testid="portfolioTokenList"] > .token-row').map((row) => row.attributes('data-symbol'));
const chips = (wrapper: VueWrapper) =>
  wrapper.findAll('[data-testid="networkFilterChip"]').map((chip) => chip.attributes('data-network'));
const pressed = (wrapper: VueWrapper) =>
  wrapper.findAll('[data-testid="networkFilter"] [aria-pressed="true"]').map((chip) => chip.attributes('data-network') ?? chip.attributes('data-testid'));

describe('the wallet as one list', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageStub());
    setActivePinia(createPinia());
    router.push.mockReset();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
    scope?.stop();
    scope = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('adds up each network the wallet holds something on, largest first, in the same pass as the total', () => {
    const { portfolio } = openWallet();

    expect(portfolio.networkTotals.value.map(({ name, value, fundedCount }) => [name, Number(value), fundedCount])).toEqual([
      ['Ethereum', 1640, 3],
      ['Polkadot', 62.5, 1],
      ['Kusama', 60, 1],
      ['Kusama AssetHub', 20, 1],
      ['Polkadot AssetHub', 10, 1],
    ]);
    const sum = portfolio.networkTotals.value.reduce((total, { value }) => total + Number(value), 0);
    expect(sum).toBe(Number(portfolio.summary.value.total));
  });

  it('keeps one row per token, with search and the network chips on screen and no grouping switch', async () => {
    openWallet();
    const wrapper = mountList();
    await nextTick();

    expect(wrapper.find('[data-testid="portfolioNetworkList"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="portfolioLens"]').exists()).toBe(false);
    expect(wrapper.get('.search-stub').text()).toBe('walletHome.toolbar.searchPlaceholder');
    expect(fundedRows(wrapper)).toEqual(['ETH', 'USDC', 'KSM', 'DOT', 'USDT']);
    expect(chips(wrapper)).toEqual(['Ethereum', 'Polkadot', 'Kusama', 'Kusama AssetHub', 'Polkadot AssetHub']);
    expect(pressed(wrapper)).toEqual(['networkFilterAll']);
    expect(wrapper.find('[data-testid="portfolioLayoutNote"]').exists()).toBe(false);
  });

  it('finds the assets of a network by its name, each as a row of its own', async () => {
    openWallet();
    const wrapper = mountList();

    await wrapper.setProps({ filterValue: 'AssetHub' });

    expect(rows(wrapper).filter((row) => /^(DOT|KSM)/.test(row))).toEqual(['KSM@Kusama AssetHub', 'DOT@Polkadot AssetHub']);
  });

  it("sends what is typed to the wallet screen, which owns the search", async () => {
    openWallet();
    const wrapper = mountList();

    await wrapper.get('.search-stub input').setValue('dot');

    expect(wrapper.emitted('update:filterValue')).toEqual([['dot']]);
  });

  it("narrows the list to a network with its chip, as the wallet's network filter, and back with a second pick", async () => {
    const { accountsStore, networksStore } = openWallet();
    const wrapper = mountList();
    await nextTick();

    await wrapper.get('[data-testid="networkFilterChip"][data-network="Kusama"]').trigger('click');

    expect(accountsStore.selectedNetwork).toBe('Kusama');
    expect(networksStore.loadIndexerNetworkBalance).toHaveBeenCalledWith('Kusama');
    expect(rows(wrapper).every((row) => row.endsWith('@Kusama'))).toBe(true);
    expect(fundedRows(wrapper)).toEqual(['KSM']);
    expect(pressed(wrapper)).toEqual(['Kusama']);

    await wrapper.get('[data-testid="networkFilterChip"][data-network="Kusama"]').trigger('click');

    expect(accountsStore.selectedNetwork).toBe('all');
    expect(pressed(wrapper)).toEqual(['networkFilterAll']);
  });

  it('offers every network when a search finds nothing on the one picked', async () => {
    const { accountsStore } = openWallet();
    accountsStore.setSelectedNetwork('Kusama');
    const wrapper = mountList({ filterValue: 'USDC' });
    await nextTick();

    expect(wrapper.get('[data-testid="infoText"] strong').text()).toBe('walletHome.search.noMatchOn {"network":"Kusama"}');

    await wrapper.get('[data-testid="searchAllNetworks"]').trigger('click');

    expect(accountsStore.selectedNetwork).toBe('all');
    expect(rows(wrapper)).toContain('USDC@Ethereum');
    expect(wrapper.find('[data-testid="searchAllNetworks"]').exists()).toBe(false);
  });

  it('names a group chosen in the full list on a chip of its own, and a picked network that holds nothing', async () => {
    const { accountsStore } = openWallet();
    accountsStore.setSelectedNetwork('popular');
    const wrapper = mountList();
    await nextTick();

    expect(wrapper.get('[data-testid="networkFilterGroup"]').text()).toBe('header.networkManagement.tabs.popular');
    expect(pressed(wrapper)).toEqual(['networkFilterGroup']);

    const empty = networks.find(({ name }) => !['Ethereum', 'Polkadot', 'Kusama', 'Kusama AssetHub', 'Polkadot AssetHub'].includes(name))!;
    accountsStore.setSelectedNetwork(empty.name);
    await nextTick();

    expect(wrapper.find('[data-testid="networkFilterGroup"]').exists()).toBe(false);
    expect(chips(wrapper)[0]).toBe(empty.name);
    expect(pressed(wrapper)).toEqual([empty.name]);
  });

  it('opens the full network list from More networks and closes it once a network is picked there', async () => {
    const { accountsStore } = openWallet();
    const wrapper = mountList();

    await wrapper.get('[data-testid="networkFilterMore"]').trigger('click');
    expect(wrapper.getComponent({ name: 'NetworkPicker' }).props('type')).toBe('all');

    accountsStore.setSelectedNetwork('Polkadot');
    await nextTick();

    expect(wrapper.find('[data-testid="networkPicker"]').exists()).toBe(false);
  });

  it('tells someone who kept the list by network once, and makes it the one list for good when they close the note', async () => {
    const { accountsStore } = openWallet();
    accountsStore.updatePortfolioView({ lens: 'network' });
    const wrapper = mountList();
    await nextTick();

    expect(wrapper.find('[data-testid="portfolioTokenList"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="portfolioLayoutNote"]').text()).toContain('walletHome.layoutNote.title');
    expect(wrapper.find('[data-testid="layoutNoteByNetwork"]').exists()).toBe(false);

    await wrapper.get('[data-testid="layoutNoteDismiss"]').trigger('click');

    expect(accountsStore.portfolioView.lens).toBe('token');
    expect(wrapper.find('[data-testid="portfolioLayoutNote"]').exists()).toBe(false);
  });

  it('keeps the search and the chips on the list, while Manage assets has its own search and covers every network', async () => {
    const { accountsStore } = openWallet();
    accountsStore.setSelectedNetwork('Kusama');
    const wrapper = mountList({ filterValue: 'ksm' });
    await nextTick();

    expect(wrapper.find('.search-stub').exists()).toBe(true);
    expect(wrapper.find('[data-testid="networkFilter"]').exists()).toBe(true);

    const page = mount(ManageAssets, {
      global: {
        stubs: {
          ExternalLogo: true,
          SearchInput: { props: ['value'], template: '<input class="manage-search-stub" :value="value" />' },
          Switcher: { props: ['value'], template: '<button type="button" />' },
        },
      },
    });
    wrappers.push(page);
    await nextTick();

    // Opened from a list narrowed to Kusama and searched for KSM, it starts with an empty search and every network.
    expect((page.get('.manage-search-stub').element as HTMLInputElement).value).toBe('');
    const shown = page
      .findAll('[data-testid="manageShown"] [data-testid="manageAssetRow"]')
      .map((row) => `${row.attributes('data-network')}:${row.attributes('data-symbol')}`);
    expect(shown).toEqual(expect.arrayContaining(['Polkadot:DOT', 'Ethereum:ETH', 'Kusama:KSM']));
  });

  it('shows the one-time note to a wallet older than this layout', async () => {
    openWallet({ whenCreated: BEFORE_UPGRADE });
    const wrapper = mountList();
    await nextTick();

    expect(wrapper.get('[data-testid="portfolioLayoutNote"]').text()).toContain('walletHome.layoutNote.description');
  });
});
