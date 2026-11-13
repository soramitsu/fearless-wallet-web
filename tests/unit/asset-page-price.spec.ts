import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import { APIItemState } from '@extension-base/api/types/networks';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { buildPortfolioSections, createAssetKey, getBalancePrice } from '@/portfolio/assetIdentity';
import { createUntrustedAssetCheck } from '@/portfolio/untrustedAssets';
import { ALL_NETWORKS } from '@/consts/networks';

// The token page (Asset.vue and its header, AssetInfo.vue) shows the price the portfolio trusts for exactly the asset
// on screen, and says the price is unavailable when there is none, as the wallet's list does. It used to read the
// token group's price id, which turned "no price" into "$ 0.00", "1 KICK = $0.00" and "0.00% ($0.00)".

type Store = Record<string, unknown>;

const boundary = vi.hoisted(() => ({ accounts: {} as Store, networks: {} as Store, route: {} as Store }));

vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => boundary.accounts }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => boundary.networks }));
vi.mock('@/extension/messaging', () => ({ getHistory: vi.fn(), toggleFavoriteNetwork: vi.fn(), sendMessage: vi.fn(), fetchEvmBalance: vi.fn() }));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));
vi.mock('@/util/BaseApi', () => ({ default: { formatAddress: () => 'address', isEthereumNetwork: () => false } }));
vi.mock('@/screens/wallet&asset/SendForm.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/wallet&asset/ReceiveForm.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/wallet&asset/BuyPopup.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/wallet&asset/NetworkManagement.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/main/NetworkManagementButton.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/wallet&asset/asset/HistoryDetailsForm.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/accounts/AccountSettingsPopup.vue', () => ({ default: { template: '<div />' } }));
// The page needs no router here; the real one imports every screen, this one among them.
vi.mock('@/router', () => ({ default: { push: vi.fn(), currentRoute: { value: { name: '' } } } }));
vi.mock('@/router/routes', () => ({ Components: { AssetHistory: 'AssetHistory', AssetNetworks: 'AssetNetworks' } }));

import Asset from '@/screens/wallet&asset/asset/Asset.vue';
import AssetNetworks from '@/screens/wallet&asset/asset/AssetNetworks.vue';
import BalanceDetailsPopup from '@/screens/wallet&asset/BalanceDetailsPopup.vue';

const ETH_ID = 'c2a6c062-d511-4bde-9ce6-ea775d2a302c';
const USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const UNPRICED_REGISTRY_TOKEN = '0x1111111111111111111111111111111111111111';
// KickToken, found outside the registry through the wallet's ERC-20 token lists.
const KICK = '0xC12D1c73eE7DC3615BA4e37E4ABFdbDDFA38907E';
const JETTON = 'EQ_Unverified_Jetton_Master';
const SPL_MINT = 'Fake1111111111111111111111111111111111111111';

const ethereum = {
  name: 'Ethereum',
  chainId: '1',
  ecosystem: 'ethereum',
  icon: 'ethereum',
  active: true,
  assets: [
    { id: ETH_ID, symbol: 'eth', name: 'Ether', priceId: 'ethereum', precision: 18 },
    { id: USDT, symbol: 'usdt', name: 'Tether USD', priceId: 'tether', precision: 6 },
    { id: UNPRICED_REGISTRY_TOKEN, symbol: 'tkn', name: 'Registry token without a price', precision: 18 },
  ],
} as unknown as NetworkJson;
const ton = { name: 'TON Mainnet', chainId: '-239', ecosystem: 'ton', icon: 'ton', active: true, assets: [] } as unknown as NetworkJson;
const solana = { name: 'Solana', chainId: 'solana-mainnet', ecosystem: 'solana', icon: 'solana', active: true, assets: [] } as unknown as NetworkJson;
const networks = [ethereum, ton, solana];

const PRICES: Record<string, number> = { ethereum: 2000, tether: 1 };
const PRICE_CHANGES: Record<string, number> = { ethereum: 1.5, tether: -0.25 };

const balance = (fields: Partial<BalanceItem> & Pick<BalanceItem, 'id' | 'name' | 'symbol'>): BalanceItem =>
  ({
    icon: '',
    precision: 18,
    state: APIItemState.READY,
    total: '0',
    transferable: '0',
    free: '0',
    reserved: '0',
    frozen: '0',
    locked: '0',
    ...fields,
  }) as BalanceItem;

const group = (balances: BalanceItem[], fields: Partial<TokenGroup> = {}): TokenGroup =>
  ({
    balances,
    groupId: balances[0].id,
    icon: '',
    mainNetwork: balances[0].name,
    providers: [],
    relayChain: 'ethereum',
    symbol: balances[0].symbol,
    tokenName: balances[0].symbol,
    ...fields,
  }) as TokenGroup;

const eth = (total = '1.5') => balance({ id: ETH_ID, name: 'Ethereum', symbol: 'eth', total, transferable: total, free: total, priceId: 'ethereum' });
const kick = () =>
  balance({
    id: KICK,
    name: 'Ethereum',
    symbol: 'KICK',
    precision: 8,
    total: '888888',
    transferable: '888888',
    free: '888888',
    assetMetadataTrust: 'unverified',
    // Written by EvmBalanceService for a token found through the token lists (not in this branch's type yet).
    assetMetadataSource: 'tokenList' as unknown as BalanceItem['assetMetadataSource'],
  });

// Every case the portfolio has no trusted price for, each with a price id a page could still have read.
const unpricedCases: [string, NetworkJson, TokenGroup][] = [
  ['an ERC-20 token found through the token lists', ethereum, group([kick()])],
  [
    'an unverified TON jetton whose group carries a priced id',
    ton,
    group([balance({ id: JETTON, name: 'TON Mainnet', symbol: 'USDT', total: '50', assetMetadataTrust: 'unverified', assetMetadataSource: 'indexer', priceId: 'tether' })], { priceId: 'tether' }),
  ],
  [
    'an unverified Solana SPL token whose group carries a priced id',
    solana,
    group([balance({ id: SPL_MINT, solanaTokenMint: SPL_MINT, name: 'Solana', symbol: 'USDT', total: '75', assetMetadataTrust: 'unverified', priceId: 'tether' })], { priceId: 'tether', relayChain: 'solana' }),
  ],
  [
    'a registry asset without a price id',
    ethereum,
    group([balance({ id: UNPRICED_REGISTRY_TOKEN, name: 'Ethereum', symbol: 'tkn', total: '10', priceId: 'ethereum' })], { priceId: 'ethereum' }),
  ],
  [
    'a registry asset whose price has not arrived',
    { ...ethereum, assets: [{ id: USDT, symbol: 'usdt', priceId: 'tether-not-loaded' }] } as unknown as NetworkJson,
    group([balance({ id: USDT, name: 'Ethereum', symbol: 'usdt', total: '20' })]),
  ],
  [
    'a verified balance whose price id is bound to another asset',
    ton,
    group([balance({ id: JETTON, name: 'TON Mainnet', symbol: 'USD', total: '5', assetMetadataTrust: 'verified', priceId: 'tether', priceAssetKey: createAssetKey({ ecosystem: 'ton', chainId: '-239', assetId: 'EQ_Other' }) })]),
  ],
];

describe('the price the portfolio trusts for one balance', () => {
  // The list's row and the page must say the same: both read the one decision in assetIdentity.ts.
  const listRow = (network: NetworkJson, tokenGroup: TokenGroup, prices: Record<string, number> = PRICES) =>
    buildPortfolioSections({
      groups: [tokenGroup],
      networks: [network],
      prices,
      priceChanges: PRICE_CHANGES,
      preferences: {},
      addressForNetwork: () => 'address',
      mode: 'manage',
      showTestnets: true,
    })
      .flatMap(({ assets, detectedAssets }) => [...assets, ...detectedAssets])
      .find(({ assetId }) => assetId === (tokenGroup.balances[0].solanaTokenMint ?? tokenGroup.balances[0].id));

  it.each(unpricedCases)('has none for %s, as its row in the list', (_case, network, tokenGroup) => {
    const decision = getBalancePrice({ network, balance: tokenGroup.balances[0], group: tokenGroup, prices: PRICES, priceChanges: PRICE_CHANGES });

    expect(decision).toMatchObject({ unitPrice: null, priceChangePercent: null });
    expect(listRow(network, tokenGroup)).toMatchObject({ ...decision, hasPrice: false, fiatValue: null });
  });

  it('has none for an asset on the shared untrusted list, whatever the registry says', () => {
    const isUntrusted = createUntrustedAssetCheck([{ chainId: '1', assetId: USDT }]);
    const usdt = balance({ id: USDT, name: 'Ethereum', symbol: 'usdt', total: '20' });

    expect(getBalancePrice({ network: ethereum, balance: usdt, prices: PRICES, isUntrusted })).toMatchObject({ unitPrice: null, priceTrust: 'unavailable' });
    expect(getBalancePrice({ network: ethereum, balance: usdt, prices: PRICES })).toMatchObject({ unitPrice: '1', priceTrust: 'canonicalAsset' });
  });

  it('is the registry price of a registry asset, and a verified price bound to the asset key, with their change', () => {
    expect(getBalancePrice({ network: ethereum, balance: eth(), prices: PRICES, priceChanges: PRICE_CHANGES })).toEqual({
      priceTrust: 'canonicalAsset',
      unitPrice: '2000',
      priceChangePercent: '1.5',
    });
    expect(listRow(ethereum, group([eth()]))).toMatchObject({ unitPrice: '2000', priceChangePercent: '1.5', fiatValue: '3000' });

    const boundJetton = balance({
      id: JETTON,
      name: 'TON Mainnet',
      symbol: 'USD',
      total: '5',
      assetMetadataTrust: 'verified',
      priceId: 'tether',
      priceAssetKey: createAssetKey({ ecosystem: 'ton', chainId: '-239', assetId: JETTON }),
    });

    expect(getBalancePrice({ network: ton, balance: boundJetton, prices: PRICES })).toMatchObject({ unitPrice: '1', priceChangePercent: null });
  });

  it('keys a network that names no ecosystem by the group relay chain, as the list keys its row', () => {
    const bare = { ...solana, ecosystem: undefined } as unknown as NetworkJson;
    const mint = balance({
      id: SPL_MINT,
      solanaTokenMint: SPL_MINT,
      name: 'Solana',
      symbol: 'USDC',
      total: '5',
      assetMetadataTrust: 'verified',
      priceId: 'tether',
      priceAssetKey: createAssetKey({ ecosystem: 'solana', chainId: 'solana-mainnet', assetId: SPL_MINT }),
    });
    const tokenGroup = group([mint], { relayChain: 'solana' });

    expect(getBalancePrice({ network: bare, balance: mint, group: tokenGroup, prices: PRICES }).unitPrice).toBe('1');
    expect(listRow(bare, tokenGroup)?.unitPrice).toBe('1');
    // Without the group, the key names another ecosystem, so the bound price is not this asset's.
    expect(getBalancePrice({ network: bare, balance: mint, prices: PRICES }).unitPrice).toBeNull();
  });
});

const wrappers: VueWrapper[] = [];

afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));

function mountAssetPage(groups: TokenGroup[], params: Record<string, string>, prices: Record<string, number> = PRICES) {
  boundary.accounts = reactive({
    balances: groups,
    fiatSymbol: '$',
    selectedNetwork: ALL_NETWORKS,
    selectedWallet: { address: 'address', isTon: false },
  });
  boundary.networks = reactive({
    allNetworks: networks,
    assetsPrice: { tokenPriceMap: prices, tokenPriceChange: PRICE_CHANGES },
    // The token group's price id: what the page used to read, and must not.
    getAssetPrice: (priceId: string) => ({ price: prices[priceId] ?? 0, priceChange: (PRICE_CHANGES[priceId] ?? 0) / 100, isExist: Boolean(prices[priceId]) }),
    getNetwork: (name: string) => networks.find((network) => network.name.toLowerCase() === String(name).toLowerCase()),
    getHistory: () => undefined,
    fetchHistory: vi.fn().mockResolvedValue(undefined),
  });
  boundary.route = reactive({ params });

  const wrapper = mount(Asset, {
    global: {
      mocks: {
        $t: (key: string) => key,
        $n: (value: number, format: string) => `${format}(${value})`,
        $route: boundary.route,
      },
      stubs: {
        RouterView: true,
        ContentForm: { template: '<div><slot /></div>' },
        ExternalLogo: true,
        Icon: true,
        Shimmer: { template: '<i data-testid="shimmer" />' },
      },
    },
  });
  wrappers.push(wrapper);

  return wrapper;
}

describe('the token page', () => {
  it('says the price of a found ERC-20 token is unavailable: no value, no unit price, no change', async () => {
    const wrapper = mountAssetPage([group([kick()]), group([eth()])], { assetId: KICK, selectedNetwork: 'Ethereum' });
    await flushPromises();

    expect(wrapper.get('[data-testid="assetBalance"]').text()).toBe('888,888.0000 KICK');
    expect(wrapper.get('[data-testid="fiatAssetBalance"]').text()).toBe('portfolioPage.priceUnavailable');
    expect(wrapper.get('[data-testid="fiatAssetBalance"]').classes()).toContain('asset__balance--unpriced');
    expect(wrapper.find('[data-testid="assetUnitPrice"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="assetPriceChange"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('$');
    expect(wrapper.text()).not.toContain('1 KICK =');
    expect(wrapper.text()).not.toContain('percent(');
  });

  it.each(unpricedCases)('says the price is unavailable for %s', async (_case, network, tokenGroup) => {
    networks.splice(networks.indexOf(networks.find(({ name }) => name === network.name)!), 1, network);
    try {
      const [item] = tokenGroup.balances;
      const wrapper = mountAssetPage([tokenGroup], { assetId: item.solanaTokenMint ?? item.id, selectedNetwork: network.name });
      await flushPromises();

      expect(wrapper.get('[data-testid="fiatAssetBalance"]').text()).toBe('portfolioPage.priceUnavailable');
      expect(wrapper.find('[data-testid="assetUnitPrice"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="assetPriceChange"]').exists()).toBe(false);
      expect(wrapper.text()).not.toContain('$');
    } finally {
      networks.splice(0, networks.length, ethereum, ton, solana);
    }
  });

  it('still shows the value, unit price and change of a priced token', async () => {
    const wrapper = mountAssetPage([group([eth('1.5')]), group([kick()])], { assetId: ETH_ID, selectedNetwork: 'Ethereum' });
    await flushPromises();

    expect(wrapper.get('[data-testid="assetBalance"]').text()).toBe('1.5000 ETH');
    expect(wrapper.get('[data-testid="fiatAssetBalance"]').text()).toBe('$ 3,000.00');
    expect(wrapper.get('[data-testid="fiatAssetBalance"]').classes()).not.toContain('asset__balance--unpriced');
    expect(wrapper.get('[data-testid="assetUnitPrice"]').text()).toBe('1 ETH = $price(2000)');
    const change = wrapper.findAll('[data-testid="assetPriceChange"] span');
    expect(change.map((part) => part.text())).toEqual(['percent(0.015)', '($price(45))']);
    expect(change[0].classes()).toContain('up-price');
  });

  it('shows a priced token without a known change with no change at all, not "NaN%"', async () => {
    const wrapper = mountAssetPage([group([balance({ id: USDT, name: 'Ethereum', symbol: 'usdt', total: '20', transferable: '20' })])], {
      assetId: USDT,
      selectedNetwork: 'Ethereum',
    });
    boundary.networks.assetsPrice = { tokenPriceMap: PRICES, tokenPriceChange: {} };
    await flushPromises();

    expect(wrapper.get('[data-testid="fiatAssetBalance"]').text()).toBe('$ 20.00');
    expect(wrapper.get('[data-testid="assetUnitPrice"]').text()).toBe('1 USDT = $price(1)');
    expect(wrapper.find('[data-testid="assetPriceChange"]').exists()).toBe(false);
  });

  it('says the price is unavailable while the prices have not arrived, and shows it once they do', async () => {
    const wrapper = mountAssetPage([group([eth('2')])], { assetId: ETH_ID, selectedNetwork: 'Ethereum' }, {});
    await flushPromises();

    expect(wrapper.get('[data-testid="fiatAssetBalance"]').text()).toBe('portfolioPage.priceUnavailable');

    boundary.networks.assetsPrice = { tokenPriceMap: PRICES, tokenPriceChange: PRICE_CHANGES };
    await flushPromises();

    expect(wrapper.get('[data-testid="fiatAssetBalance"]').text()).toBe('$ 4,000.00');
    expect(wrapper.get('[data-testid="assetUnitPrice"]').text()).toBe('1 ETH = $price(2000)');
  });

  it('marks a kept amount of an unpriced token as out of date without a value', async () => {
    const stale = { ...kick(), state: APIItemState.ERROR };
    const wrapper = mountAssetPage([group([stale])], { assetId: KICK, selectedNetwork: 'Ethereum' });
    await flushPromises();

    expect(wrapper.get('[data-testid="assetBalanceFailed"]').text()).toBe('portfolioPage.priceUnavailable · portfolioPage.balanceStatus.failed');
    expect(wrapper.text()).not.toContain('$');
  });

  it('on an old link across networks, lends no network the price of another', async () => {
    // One group, USDT on Ethereum (priced) and an unverified USDT jetton on TON: the page names no network.
    const jetton = balance({ id: JETTON, name: 'TON Mainnet', symbol: 'usdt', total: '50', assetMetadataTrust: 'unverified' });
    const usdt = balance({ id: USDT, name: 'Ethereum', symbol: 'usdt', total: '20', transferable: '20' });
    const mixed = mountAssetPage([group([usdt, jetton], { groupId: 'usdt', priceId: 'tether' })], { assetId: 'usdt' });
    await flushPromises();

    expect(mixed.findComponent({ name: 'AssetInfo' }).props('price')).toBeNull();

    // Every network that holds it has the same trusted price: that price.
    const priced = mountAssetPage([group([usdt], { groupId: 'usdt', priceId: 'tether' })], { assetId: 'usdt' });
    await flushPromises();

    expect(priced.findComponent({ name: 'AssetInfo' }).props('price')).toEqual({ price: 1, priceChange: -0.0025 });
  });
});

describe('the parts of the token page that show fiat', () => {
  it('lists no fiat value in the balance details of an unpriced token, and keeps it for a priced one', () => {
    boundary.accounts = reactive({ fiatSymbol: '$' });
    boundary.networks = reactive({ getNetwork: () => ({ active: true }) });
    const mountDetails = (assetPrice: { price: number } | null, item: BalanceItem) =>
      mount(BalanceDetailsPopup, {
        props: { network: 'Ethereum', currency: group([item]), assetPrice },
        global: {
          mocks: { $t: (key: string) => key, $n: (value: number) => String(value) },
          stubs: { Popup: { template: '<div><slot /></div>' } },
        },
      });

    const unpriced = mountDetails(null, kick());
    expect(unpriced.findAll('[data-testid="valueBalanceDetails"]').map((row) => row.text())).toContain('888888 KICK');
    expect(unpriced.find('[data-testid="fiatValue"]').exists()).toBe(false);
    unpriced.unmount();

    const priced = mountDetails({ price: 2000 }, eth('1.5'));
    expect(priced.findAll('[data-testid="fiatValue"]').map((row) => row.text())).toEqual(['$3000', '$3000']);
    priced.unmount();
  });

  it("prices each network's row by that network's own trusted price on the across-networks list", () => {
    const usdt = balance({ id: USDT, name: 'Ethereum', symbol: 'usdt', total: '20', transferable: '20' });
    const jetton = balance({ id: JETTON, name: 'TON Mainnet', symbol: 'usdt', total: '50', transferable: '50', assetMetadataTrust: 'unverified' });
    boundary.accounts = reactive({ fiatSymbol: '$', selectedNetwork: ALL_NETWORKS, selectedWallet: { address: 'address', isTon: false } });
    boundary.networks = reactive({
      assetsPrice: { tokenPriceMap: PRICES, tokenPriceChange: PRICE_CHANGES },
      getNetwork: (name: string) => networks.find((network) => network.name === name),
    });

    const wrapper = mount(AssetNetworks, {
      props: { currency: group([usdt, jetton], { groupId: 'usdt', priceId: 'tether', mainNetwork: 'Ethereum' }) },
      global: {
        mocks: { $t: (key: string) => key, $n: (value: number) => String(value), $route: { params: { assetId: 'usdt' } } },
        stubs: { ContentForm: { template: '<div><slot /></div>' }, Scroll: { template: '<div><slot /></div>' }, TabButton: true, Icon: true, SelectPopup: true, AssetRow: true },
      },
    });
    const vm = wrapper.vm as unknown as { getFiatInNetworkString: (network: string) => string };

    expect(vm.getFiatInNetworkString('Ethereum')).toBe('$ 20');
    expect(vm.getFiatInNetworkString('TON Mainnet')).toBe('portfolioPage.priceUnavailable');
    expect(vm.getFiatInNetworkString('Missing')).toBe('portfolioPage.priceUnavailable');
    wrapper.unmount();
  });
});
