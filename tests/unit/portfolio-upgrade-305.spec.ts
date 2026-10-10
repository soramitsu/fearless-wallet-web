import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, nextTick } from 'vue';
import { APIItemState } from '@extension-base/api/types/networks';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import { FPNumber } from '@sora-substrate/util';
import {
  EVM_ADDRESS,
  SUBSTRATE_ADDRESS,
  TON_ADDRESS,
  networkMap305,
  readLegacy305Fixture,
  readSnapshot,
  type Legacy305FixtureName,
} from '../fixtures/legacy-305/generate';
import type { AccountJson, TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { createAssetKey } from '@/portfolio/assetIdentity';
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
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => ({ features: { assetDiscoveryMode: 'visible' } }) }));

import Currencies from '@/screens/wallet&asset/wallet/Currencies.vue';

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

const LEGACY_KEYS = ['account_hidden-assets', 'account_sequence-assets', 'account_custom-sort'];
const PRICES = { polkadot: 5, kusama: 20, ethereum: 2000, tether: 1, 'usd-coin': 1, 'the-open-network': 4 };

const snapshot = readSnapshot();
const networkMap = networkMap305(snapshot);
const productionNetworks = Object.values(networkMap).map((network) => ({ ...network, favorite: [] })) as NetworkJson[];
const tonNetwork = productionNetworks.find(({ ecosystem }) => ecosystem === 'ton')!;

let storage: ReturnType<typeof createLocalStorageStub>;

function seed(name: Legacy305FixtureName): Record<string, string> {
  const { localStorage: entries } = readLegacy305Fixture(name);
  Object.entries(entries).forEach(([key, value]) => storage.setItem(key, value));
  storage.setItem.mockClear();
  return entries;
}

function expectLegacyKeysUntouched(entries: Record<string, string>) {
  LEGACY_KEYS.forEach((key) => expect(storage.getItem(key), key).toBe(entries[key] ?? null));
  [...storage.setItem.mock.calls, ...storage.removeItem.mock.calls].forEach(([key]) => expect(LEGACY_KEYS).not.toContain(key));
}

const wallet = (address: string, walletEcosystem = WalletEcosystem.Substrate) =>
  ({
    address,
    ethereumAddress: walletEcosystem === WalletEcosystem.Ton ? '' : EVM_ADDRESS,
    name: address.slice(0, 6),
    walletEcosystem,
  }) as AccountJson;

function fund(groups: TokenGroup[], networkName: string, symbol: string, amount: string) {
  const items = groups
    .flatMap(({ balances }) => balances)
    .filter((balance) => balance.name === networkName.toLowerCase() && balance.symbol === symbol);
  if (!items.length) throw new Error(`No ${symbol} on ${networkName}`);
  items.forEach((balance) => Object.assign(balance, { state: APIItemState.READY, total: amount, transferable: amount }));
}

function ready(groups: TokenGroup[]): TokenGroup[] {
  groups.forEach(({ balances }) => balances.forEach((balance) => Object.assign(balance, { state: APIItemState.READY })));
  return groups;
}

function fundedEvmAndSubstrate(ecosystem = WalletEcosystem.Substrate): TokenGroup[] {
  const groups = ready(getMockAssets(networkMap, ecosystem));
  fund(groups, 'Kusama', 'ksm', '3');
  fund(groups, 'Kusama AssetHub', 'ksm', '1');
  fund(groups, 'Polkadot', 'dot', '12.5');
  fund(groups, 'Ethereum', 'eth', '0.75');
  fund(groups, 'Ethereum', 'usdt', '40');
  fund(groups, 'Polygon', 'usdt', '2');
  fund(groups, 'Ethereum', 'usdc', '100');
  return groups;
}

const jettonGroup = (name: string, symbol: string, master: string, amount: string): TokenGroup =>
  ({
    icon: '',
    groupId: master,
    mainNetwork: tonNetwork.name,
    providers: [],
    symbol,
    tokenName: name,
    relayChain: tonNetwork.name.toLowerCase(),
    balances: [
      {
        assetMetadataSource: 'indexer',
        assetMetadataTrust: 'unverified',
        icon: tonNetwork.icon,
        id: master,
        name: tonNetwork.name,
        precision: 9,
        state: APIItemState.READY,
        symbol,
        total: amount,
        transferable: amount,
        type: 'jetton',
      },
    ],
  }) as TokenGroup;

function fundedTon(): TokenGroup[] {
  const groups = ready(getMockAssets(networkMap, WalletEcosystem.Ton));
  fund(groups, tonNetwork.name, tonNetwork.assets[0].symbol, '5');
  return [
    ...groups,
    jettonGroup('Tether USD', 'usdt', 'EQ_RealTether', '10'),
    jettonGroup('Notcoin', 'not', 'EQ_Notcoin', '0'),
    jettonGroup('Dogs', 'dogs', 'EQ_Dogs', '3'),
  ];
}

const mountCurrencies = (props: Record<string, unknown> = {}) =>
  mount(Currencies, {
    props: { balances: [], filterValue: '', showAssetsManagementForm: false, manageHiddenOnly: false, ...props },
    global: {
      mocks: { $t: (key: string, count?: number) => (typeof count === 'number' ? `${key}:${count}` : key) },
      stubs: {
        ExternalLogo: true,
        Icon: true,
        Loader: true,
        Scroll: { template: '<main><slot /></main>' },
        Switcher: {
          props: ['value'],
          emits: ['change'],
          template: '<button type="button" class="switcher-stub" @click="$emit(\'change\', !value)" />',
        },
      },
    },
  });

const rows = (wrapper: VueWrapper) =>
  wrapper.findAll('.network-section').flatMap((section) =>
    section
      .findAll('.asset-row')
      .map(
        (row) =>
          `${section.attributes('data-network')}:${row.get('.asset-symbol').text()}` +
          (row.find('[data-testid="hiddenBadge"]').exists() ? ':hidden' : '')
      )
  );

/** The fiat the rendered network headers add up to (the fixture prices produce whole cents). */
const renderedSubtotals = (wrapper: VueWrapper) =>
  wrapper
    .findAll('.network-value')
    .map((value) => value.text().replace(/,/g, ''))
    .filter(Boolean)
    .reduce((sum, value) => sum.add(new FPNumber(value)), FPNumber.ZERO);

function openPortfolio(address: string, ecosystem: WalletEcosystem, balances: TokenGroup[]) {
  const accountsStore = useAccountsStore();
  const networksStore = useNetworksStore();
  networksStore.allNetworks = productionNetworks;
  networksStore.setPrices({ tokenPriceMap: PRICES, tokenPriceChange: {} });
  accountsStore.setSelectedWallet(wallet(address, ecosystem));
  if (ecosystem === WalletEcosystem.Evm) accountsStore.selectedWallet.ethereumAddress = address;
  accountsStore.setBalance({ details: balances });
  accountsStore.setIsBalanceLoading(false);
  // Show every network, zero-only ones included, so an absent row really is absent.
  accountsStore.updatePortfolioView({ zeroNetworksExpanded: true });

  const scope = effectScope();
  const portfolio = scope.run(() => usePortfolio())!;

  return { accountsStore, portfolio, scope };
}

describe('portfolio after an upgrade from 3.0.5', () => {
  beforeEach(() => {
    storage = createLocalStorageStub();
    vi.stubGlobal('localStorage', storage);
    setActivePinia(createPinia());
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    ['switches', SUBSTRATE_ADDRESS, WalletEcosystem.Substrate, fundedEvmAndSubstrate, 4],
    ['hide-zero', SUBSTRATE_ADDRESS, WalletEcosystem.Substrate, fundedEvmAndSubstrate, 4],
    ['ton', TON_ADDRESS, WalletEcosystem.Ton, fundedTon, 0],
    ['evm-standalone', EVM_ADDRESS, WalletEcosystem.Evm, () => fundedEvmAndSubstrate(WalletEcosystem.Evm), 2],
  ] as const)('fixture %s: the header equals the visible subtotals and the footer counts what is hidden', async (name, address, ecosystem, balances, hiddenFunded) => {
    const entries = seed(name);
    const { portfolio, scope } = openPortfolio(address, ecosystem, balances());
    const wrapper = mountCurrencies();
    await nextTick();

    const summary = portfolio.summary.value;
    expect(summary.hiddenCount).toBe(hiddenFunded);
    expect(renderedSubtotals(wrapper).toString()).toBe(new FPNumber(summary.total).toString());
    expect(rows(wrapper).filter((row) => row.endsWith(':hidden'))).toEqual([]);

    const footer = wrapper.find('[data-testid="hiddenNotIncluded"]');
    expect(footer.exists()).toBe(hiddenFunded > 0);
    if (hiddenFunded) expect(footer.text()).toBe(`portfolioPage.hiddenNotIncluded:${hiddenFunded}`);

    wrapper.unmount();
    scope.stop();
    expectLegacyKeysUntouched(entries);
  });

  it('keeps the 3.0.5 KSM group hide on all 15 Kusama networks, while DOT and the rest stay', async () => {
    const entries = seed('switches');
    const { portfolio, scope } = openPortfolio(SUBSTRATE_ADDRESS, WalletEcosystem.Substrate, fundedEvmAndSubstrate());
    const wrapper = mountCurrencies();
    await nextTick();

    expect(rows(wrapper).filter((row) => row.endsWith(':KSM'))).toEqual([]);
    expect(rows(wrapper)).toEqual(expect.arrayContaining(['Polkadot:DOT', 'Ethereum:ETH', 'Ethereum:USDC']));
    // KSM 4 × $20 and the Ethereum-family USDT 42 × $1 are excluded from the header and named in the footer.
    expect(portfolio.summary.value).toMatchObject({ total: '1662.5', hiddenValue: '122', hiddenCount: 4 });

    wrapper.unmount();
    scope.stop();
    expectLegacyKeysUntouched(entries);
  });
});

describe('the hidden-with-funds notice', () => {
  beforeEach(() => {
    storage = createLocalStorageStub();
    vi.stubGlobal('localStorage', storage);
    setActivePinia(createPinia());
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('appears when a 3.0.5 "Hide zero" hide receives funds, stays quiet once kept, and returns for a new one', async () => {
    const entries = seed('hide-zero');
    const groups = ready(getMockAssets(networkMap, WalletEcosystem.Substrate));
    fund(groups, 'Polkadot', 'dot', '12.5');
    fund(groups, 'Ethereum', 'eth', '0.75');
    fund(groups, 'Ethereum', 'usdc', '100');
    const { accountsStore, scope } = openPortfolio(SUBSTRATE_ADDRESS, WalletEcosystem.Substrate, groups);
    const wrapper = mountCurrencies();
    await nextTick();

    // Exactly what was funded when the user clicked Hide zero in 3.0.5 is visible; nothing hidden holds funds.
    expect(wrapper.find('[data-testid="hiddenFundsNotice"]').exists()).toBe(false);

    fund(groups, 'Kusama', 'ksm', '3');
    accountsStore.setBalance({ details: [...groups] });
    await nextTick();
    const notice = wrapper.get('[data-testid="hiddenFundsNotice"]');
    expect(notice.text()).toContain('portfolioPage.hiddenFundsNotice:1');
    expect(rows(wrapper)).not.toContain('Kusama:KSM');

    await wrapper.get('[data-testid="keepHiddenFunds"]').trigger('click');
    expect(wrapper.find('[data-testid="hiddenFundsNotice"]').exists()).toBe(false);
    expect(JSON.parse(storage.getItem('account_portfolio-view-v1')!).value[SUBSTRATE_ADDRESS].hiddenFundsNoticeAck).toBeTruthy();

    // The same set stays quiet after the popup reopens.
    wrapper.unmount();
    const reopened = mountCurrencies();
    await nextTick();
    expect(reopened.find('[data-testid="hiddenFundsNotice"]').exists()).toBe(false);

    fund(groups, 'Polkadot AssetHub', 'usdt', '5');
    accountsStore.setBalance({ details: [...groups] });
    await nextTick();
    expect(reopened.get('[data-testid="hiddenFundsNotice"]').text()).toContain('portfolioPage.hiddenFundsNotice:2');

    await reopened.get('[data-testid="reviewHiddenFunds"]').trigger('click');
    expect(reopened.emitted('toggleAssetsManagementForm')).toEqual([[true]]);
    expect(reopened.emitted('update:manageHiddenOnly')).toEqual([[true]]);

    // Review: Manage lists only hidden assets, zero-balance ones too even with the zero block closed;
    // showing one writes one explicit preference and nothing else.
    accountsStore.updatePortfolioView({ zeroNetworksExpanded: false });
    await reopened.setProps({ showAssetsManagementForm: true, manageHiddenOnly: true });
    expect(rows(reopened)).toEqual(
      expect.arrayContaining(['Kusama:KSM:hidden', 'Polkadot AssetHub:USDT:hidden', 'Kusama AssetHub:KSM:hidden'])
    );
    expect(rows(reopened).every((row) => row.endsWith(':hidden'))).toBe(true);
    const kusama = reopened.findAll('.network-section').find((section) => section.attributes('data-network') === 'Kusama')!;
    await kusama.get('.switcher-stub').trigger('click');
    const ksmKey = createAssetKey({
      ecosystem: 'substrate',
      chainId: productionNetworks.find(({ name }) => name === 'Kusama')!.chainId,
      assetId: productionNetworks.find(({ name }) => name === 'Kusama')!.assets[0].id,
    });
    expect(accountsStore.assetPreferences).toEqual({ [ksmKey]: 'shown' });
    expect(rows(reopened)).not.toContain('Kusama:KSM:hidden');

    reopened.unmount();
    scope.stop();
    expectLegacyKeysUntouched(entries);
  });
});

describe('zero-balance networks', () => {
  beforeEach(() => {
    storage = createLocalStorageStub();
    vi.stubGlobal('localStorage', storage);
    setActivePinia(createPinia());
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows an empty wallet the empty state and its popular networks collapsed, expansion remembered', async () => {
    const { accountsStore, scope } = openPortfolio(SUBSTRATE_ADDRESS, WalletEcosystem.Substrate, ready(getMockAssets(networkMap, WalletEcosystem.Substrate)));
    accountsStore.updatePortfolioView({ zeroNetworksExpanded: false });
    const wrapper = mountCurrencies();
    await nextTick();

    expect(wrapper.find('[data-testid="infoText"]').exists()).toBe(true);
    const header = wrapper.get('[data-testid="portfolioZeroNetworks"] .zero-header');
    expect(header.text()).toBe('portfolioPage.popularNoBalance');
    expect(header.attributes('aria-expanded')).toBe('false');
    expect(wrapper.findAll('.network-section')).toHaveLength(0);

    await header.trigger('click');
    expect(accountsStore.portfolioView.zeroNetworksExpanded).toBe(true);
    // Only the listed utility assets of ranked mainnets (shared zero list), one per network.
    expect(rows(wrapper).sort()).toEqual(
      ['Analog Timechain:ANLOG', 'Arbitrum One:ETH', 'Avalanche C-Chain:AVAX', 'BNB Smart Chain:BNB', 'Ethereum:ETH', 'Kusama:KSM', 'Moonbeam:GLMR', 'Moonriver:MOVR', 'OP Mainnet:ETH', 'Pendulum:PEN', 'Polkadot:DOT', 'Polygon:POL', 'Polygon zkEVM:ETH', 'SORA Mainnet:XOR', 'X Layer Mainnet:OKB'].sort()
    );

    wrapper.unmount();
    scope.stop();
  });

  it('collapses zero-only networks of a funded wallet behind a count, and opens them for a matching search', async () => {
    const groups = ready(getMockAssets(networkMap, WalletEcosystem.Substrate));
    fund(groups, 'Polkadot', 'dot', '1');
    const { accountsStore, scope } = openPortfolio(SUBSTRATE_ADDRESS, WalletEcosystem.Substrate, groups);
    accountsStore.updatePortfolioView({ zeroNetworksExpanded: false });
    const wrapper = mountCurrencies();
    await nextTick();

    expect(wrapper.find('[data-testid="infoText"]').exists()).toBe(false);
    expect(rows(wrapper)).toEqual(['Polkadot:DOT']);
    expect(wrapper.get('.zero-header').text()).toBe('portfolioPage.zeroNetworks:14');

    await wrapper.setProps({ filterValue: 'kusama' });
    expect(wrapper.get('.zero-header').attributes('aria-expanded')).toBe('true');
    expect(rows(wrapper)).toEqual(['Kusama:KSM']);
    expect(accountsStore.portfolioView.zeroNetworksExpanded).toBe(false);

    await wrapper.setProps({ filterValue: 'no-such-asset' });
    expect(wrapper.get('[data-testid="infoText"]').text()).toContain('portfolioPage.noMatchingAssets');

    wrapper.unmount();
    scope.stop();
  });
});
