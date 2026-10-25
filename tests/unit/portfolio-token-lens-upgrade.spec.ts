import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, nextTick } from 'vue';
import { APIItemState } from '@extension-base/api/types/networks';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import {
  EVM_ADDRESS,
  SUBSTRATE_ADDRESS,
  TON_ADDRESS,
  groupOf,
  networkMap305,
  readLegacy305Fixture,
  readSnapshot,
  type Legacy305FixtureName,
} from '../fixtures/legacy-305/generate';
import { getMockAssets as getMockAssets305 } from '../fixtures/legacy-305/getMockAssets.305';
import { createAccountsStore305, type Storage305 } from '../fixtures/legacy-305/toggle-hide-zero.305';
import type { AccountJson, TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { FPNumber } from '@/sora/number';
import { WalletEcosystem } from '@/interfaces';
import { usePortfolio } from '@/portfolio/usePortfolio';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('vue-router', () => ({ useRouter: () => router }));
vi.mock('@/router/routes', () => ({
  Components: { AssetHistory: 'AssetHistory', SendForm: 'SendForm', ReceiveForm: 'ReceiveForm' },
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
const BEFORE_UPGRADE = 1_700_000_000_000;

const snapshot = readSnapshot();
const networkMap = networkMap305(snapshot);
const productionNetworks = Object.values(networkMap).map((network) => ({ ...network, favorite: [] })) as NetworkJson[];

let storage: ReturnType<typeof createLocalStorageStub>;

function seedStorage(entries: Record<string, string>): Record<string, string> {
  Object.entries(entries).forEach(([key, value]) => storage.setItem(key, value));
  storage.setItem.mockClear();
  return entries;
}

const seed = (name: Legacy305FixtureName) => seedStorage(readLegacy305Fixture(name).localStorage);

function expectLegacyKeysUntouched(entries: Record<string, string>) {
  LEGACY_KEYS.forEach((key) => expect(storage.getItem(key), key).toBe(entries[key] ?? null));
  [...storage.setItem.mock.calls, ...storage.removeItem.mock.calls].forEach(([key]) => expect(LEGACY_KEYS).not.toContain(key));
}

const wallet = (address: string, walletEcosystem = WalletEcosystem.Substrate, whenCreated?: number) =>
  ({
    address,
    ethereumAddress: walletEcosystem === WalletEcosystem.Ton ? '' : EVM_ADDRESS,
    name: address.slice(0, 6),
    walletEcosystem,
    ...(whenCreated === undefined ? {} : { whenCreated }),
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
  fund(groups, 'Polkadot AssetHub', 'dot', '2');
  fund(groups, 'Ethereum', 'eth', '0.75');
  fund(groups, 'Ethereum', 'usdt', '40');
  fund(groups, 'Polygon', 'usdt', '2');
  fund(groups, 'Ethereum', 'usdc', '100');
  return groups;
}

function fundedTon(): TokenGroup[] {
  const groups = ready(getMockAssets(networkMap, WalletEcosystem.Ton));
  const ton = productionNetworks.find(({ ecosystem }) => ecosystem === 'ton')!;
  fund(groups, ton.name, ton.assets[0].symbol, '5');
  return groups;
}

const mountCurrencies = (props: Record<string, unknown> = {}) =>
  mount(Currencies, {
    props: { balances: [], filterValue: '', showAssetsManagementForm: false, manageHiddenOnly: false, ...props },
    global: {
      mocks: {
        $t: (key: string, count?: number) => (typeof count === 'number' ? `${key}:${count}` : key),
        $router: router,
      },
      stubs: {
        // The network picker is teleported to the body in the app; here it renders in place.
        teleport: true,
        ExternalLogo: true,
        Icon: true,
        Loader: true,
        Scroll: { template: '<main><slot /></main>' },
        Switcher: {
          props: ['value'],
          emits: ['change'],
          template: '<button type="button" class="switcher-stub" :data-on="value" @click="$emit(\'change\', !value)" />',
        },
      },
    },
  });

/** The By token rows as `SYMBOL` or `SYMBOL×networks`, in screen order. */
const tokenRows = (wrapper: VueWrapper) =>
  wrapper.findAll('.token-row').map((row) => {
    const count = row.find('[data-testid="networkCount"]');
    const symbol = row.get('.token-symbol').text().split(/\s/)[0];
    return count.exists() ? `${symbol}×${count.text().split(':')[1]}` : `${symbol}@${row.get('[data-testid="tokenNetwork"]').text()}`;
  });

/** The fiat the rendered token rows add up to (the fixture prices produce whole cents). */
const renderedRowFiat = (wrapper: VueWrapper) =>
  wrapper
    .findAll('.token-row [data-testid="tokenFiat"]')
    .map((value) => value.text().replace(/[$,]/g, ''))
    .filter((value) => /^\d/.test(value))
    .reduce((sum, value) => sum.add(new FPNumber(value)), FPNumber.ZERO);

function openPortfolio(address: string, ecosystem: WalletEcosystem, balances: TokenGroup[], whenCreated = BEFORE_UPGRADE) {
  const accountsStore = useAccountsStore();
  const networksStore = useNetworksStore();
  networksStore.allNetworks = productionNetworks;
  networksStore.setPrices({ tokenPriceMap: PRICES, tokenPriceChange: {} });
  // The app records the first run of this layout as it starts, after the upgrade and before anything else.
  accountsStore.recordPortfolioLayoutFirstRun();
  accountsStore.setAccounts({ accounts: [wallet(address, ecosystem, whenCreated)] } as never);
  accountsStore.setSelectedWallet(wallet(address, ecosystem, whenCreated));
  if (ecosystem === WalletEcosystem.Evm) accountsStore.selectedWallet.ethereumAddress = address;
  accountsStore.setBalance({ details: balances });
  accountsStore.setIsBalanceLoading(false);

  const scope = effectScope();
  const portfolio = scope.run(() => usePortfolio())!;

  return { accountsStore, portfolio, scope };
}

describe('By token after an upgrade from 3.0.5', () => {
  beforeEach(() => {
    storage = createLocalStorageStub();
    vi.stubGlobal('localStorage', storage);
    setActivePinia(createPinia());
    router.push.mockReset();
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
  ] as const)('fixture %s opens in By token, and its rows add up to the header', async (name, address, ecosystem, balances, hiddenFunded) => {
    const entries = seed(name);
    const { accountsStore, portfolio, scope } = openPortfolio(address, ecosystem, balances());
    const wrapper = mountCurrencies();
    await nextTick();

    expect(accountsStore.portfolioView.lens).toBe('token');
    expect(wrapper.find('[data-testid="portfolioTokenList"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="portfolioNetworkList"]').exists()).toBe(false);
    expect(portfolio.summary.value.hiddenCount).toBe(hiddenFunded);
    expect(renderedRowFiat(wrapper).toString()).toBe(new FPNumber(portfolio.summary.value.total).toString());
    expect(wrapper.findAll('[data-testid="hiddenBadge"]')).toHaveLength(0);

    wrapper.unmount();
    scope.stop();
    expectLegacyKeysUntouched(entries);
  });

  it('hides the whole KSM group a 3.0.5 user hid, and combines DOT across Polkadot and AssetHub', async () => {
    const entries = seed('switches');
    const { scope } = openPortfolio(SUBSTRATE_ADDRESS, WalletEcosystem.Substrate, fundedEvmAndSubstrate());
    const wrapper = mountCurrencies();
    await nextTick();

    const rows = tokenRows(wrapper);
    expect(rows.filter((row) => row.startsWith('KSM'))).toEqual([]);
    // 3.0.5 hid its "USDT (ethereum)" group, which held both Tether's USDT and Polygon's bridged USDT.
    expect(rows.filter((row) => row.startsWith('USDT'))).toEqual([]);
    // ETH on Arbitrum One, OP Mainnet and Polygon zkEVM are shown at zero by the one zero rule, so ETH is a group.
    expect(rows).toEqual(['ETH×4', 'USDC@Ethereum', 'DOT×2']);

    const dot = wrapper.findAll('.token-row').find((row) => row.attributes('data-token') === 'group:dot')!;
    expect(dot.get('[data-testid="tokenAmount"]').text()).toBe('14.5000 DOT');
    expect(dot.find('[data-testid="tokenNetworks"]').exists()).toBe(false);

    wrapper.unmount();
    scope.stop();
    expectLegacyKeysUntouched(entries);
  });

  it('keeps the order a 3.0.5 user dragged, from the keys the shipped 3.0.5 store wrote', async () => {
    // Replay the shipped 3.0.5 drag-and-drop: the user put USDC (ethereum) first, then DOT (Polkadot).
    const legacy: Storage305 = {};
    const groups305 = getMockAssets305(networkMap, WalletEcosystem.Substrate);
    const usdc = groupOf(groups305, 'usdc', 'ethereum');
    const dot = groupOf(groups305, 'dot', 'Polkadot');
    createAccountsStore305(SUBSTRATE_ADDRESS, groups305, legacy).setBalance({
      details: [usdc, dot, ...groups305.filter((group) => group !== usdc && group !== dot)],
      saveSequence: true,
    });
    const entries = seedStorage(legacy);

    const { accountsStore, scope } = openPortfolio(SUBSTRATE_ADDRESS, WalletEcosystem.Substrate, fundedEvmAndSubstrate());
    accountsStore.updatePortfolioView({ zeroNetworksExpanded: false });
    const wrapper = mountCurrencies();
    await nextTick();

    // By value it would be ETH ($1,500), USDT, USDC, KSM, DOT.
    expect(tokenRows(wrapper).slice(0, 2)).toEqual(['USDC@Ethereum', 'DOT×2']);
    expect(wrapper.find('[data-testid="customOrderKept"]').exists()).toBe(true);

    accountsStore.updatePortfolioView({ sort: 'value' });
    await nextTick();
    expect(tokenRows(wrapper)[0]).toBe('ETH×4');

    wrapper.unmount();
    scope.stop();
    expectLegacyKeysUntouched(entries);
  });
});

describe('the one-time By token note', () => {
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

  it('greets a wallet from before the upgrade once, and never again after "Got it"', async () => {
    seed('switches');
    const { scope } = openPortfolio(SUBSTRATE_ADDRESS, WalletEcosystem.Substrate, fundedEvmAndSubstrate());
    const wrapper = mountCurrencies();
    await nextTick();

    expect(wrapper.find('[data-testid="portfolioLayoutNote"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="customOrderKept"]').exists()).toBe(false);
    await wrapper.get('[data-testid="layoutNoteDismiss"]').trigger('click');
    expect(wrapper.find('[data-testid="portfolioLayoutNote"]').exists()).toBe(false);
    wrapper.unmount();
    scope.stop();

    // Another popup session reads the stored record.
    setActivePinia(createPinia());
    const reopened = openPortfolio(SUBSTRATE_ADDRESS, WalletEcosystem.Substrate, fundedEvmAndSubstrate());
    const again = mountCurrencies();
    await nextTick();
    expect(again.find('[data-testid="portfolioLayoutNote"]').exists()).toBe(false);
    again.unmount();
    reopened.scope.stop();
  });

  it('says nothing to a wallet created after this version first started', async () => {
    const firstRun = Date.now();
    storage.setItem('account_portfolio-layout-v1', JSON.stringify({ value: { firstRunAt: firstRun } }));
    const { scope } = openPortfolio(SUBSTRATE_ADDRESS, WalletEcosystem.Substrate, fundedEvmAndSubstrate(), firstRun + 60_000);
    const wrapper = mountCurrencies();
    await nextTick();

    expect(wrapper.find('[data-testid="portfolioLayoutNote"]').exists()).toBe(false);
    expect(JSON.parse(storage.getItem('account_portfolio-layout-v1')!).value).toEqual({ firstRunAt: firstRun });
    wrapper.unmount();
    scope.stop();
  });

  it('switches to By network from the note, for this wallet, and closes it for good', async () => {
    const { accountsStore, scope } = openPortfolio(SUBSTRATE_ADDRESS, WalletEcosystem.Substrate, fundedEvmAndSubstrate());
    const wrapper = mountCurrencies();
    await nextTick();

    await wrapper.get('[data-testid="layoutNoteByNetwork"]').trigger('click');
    expect(accountsStore.portfolioView.lens).toBe('network');
    expect(accountsStore.portfolioLayout.noteDismissed).toBe(true);
    expect(wrapper.find('[data-testid="portfolioNetworkList"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="portfolioLayoutNote"]').exists()).toBe(false);
    expect(JSON.parse(storage.getItem('account_portfolio-view-v1')!).value[SUBSTRATE_ADDRESS].lens).toBe('network');

    wrapper.unmount();
    scope.stop();
  });
});

describe('Send and Receive from a token group', () => {
  beforeEach(() => {
    storage = createLocalStorageStub();
    vi.stubGlobal('localStorage', storage);
    setActivePinia(createPinia());
    router.push.mockReset();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function openDotGroup() {
    const opened = openPortfolio(SUBSTRATE_ADDRESS, WalletEcosystem.Substrate, fundedEvmAndSubstrate());
    opened.accountsStore.dismissPortfolioLayoutNote();
    const wrapper = mountCurrencies();
    await nextTick();
    const dot = () => wrapper.findAll('.token-row').find((row) => row.attributes('data-token') === 'group:dot')!;
    await dot().get('[data-testid="tokenGroupHeader"]').trigger('click');

    return { ...opened, wrapper, dot };
  }

  it('expands into per-network rows with the role of each, remembered for the wallet', async () => {
    const { accountsStore, wrapper, dot, scope } = await openDotGroup();

    const networks = dot().findAll('.network-row');
    expect(networks.map((row) => row.get('.network-name').text())).toEqual(['Polkadot', 'Polkadot AssetHub']);
    expect(networks.map((row) => row.get('[data-testid="memberRole"]').text())).toEqual([
      'portfolioPage.role.native',
      'portfolioPage.role.systemParachain',
    ]);
    expect(accountsStore.portfolioView.expandedGroups).toEqual(['group:dot']);

    await networks[1].trigger('click');
    expect(router.push).toHaveBeenLastCalledWith({
      name: 'AssetHistory',
      params: { assetId: productionNetworks.find(({ name }) => name === 'Polkadot AssetHub')!.assets[0].id, selectedNetwork: 'Polkadot AssetHub' },
    });

    wrapper.unmount();
    scope.stop();
  });

  it('asks for the network before a Send, with the warning, and opens Send on exactly the network picked', async () => {
    const { wrapper, dot, scope } = await openDotGroup();

    await dot().get('[data-testid="groupSend"]').trigger('click');
    const picker = wrapper.get('[data-testid="groupNetworkPicker"]');
    expect(picker.attributes('role')).toBe('dialog');
    expect(picker.get('[data-testid="groupNetworkWarning"]').text()).toContain('portfolioPage.groupPicker.sendWarning');
    expect(picker.findAll('[data-testid="groupNetworkOption"]').map((option) => option.attributes('data-network'))).toEqual([
      'Polkadot',
      'Polkadot AssetHub',
    ]);
    expect(router.push).not.toHaveBeenCalled();

    await picker.findAll('[data-testid="groupNetworkOption"]')[1].trigger('click');
    expect(router.push).toHaveBeenCalledWith({
      name: 'SendForm',
      params: { assetId: productionNetworks.find(({ name }) => name === 'Polkadot AssetHub')!.assets[0].id, network: 'Polkadot AssetHub' },
    });
    expect(wrapper.find('[data-testid="groupNetworkPicker"]').exists()).toBe(false);

    wrapper.unmount();
    scope.stop();
  });

  it('offers Receive on every DOT network of the wallet, including those it holds nothing on yet', async () => {
    const { wrapper, dot, scope } = await openDotGroup();

    await dot().get('[data-testid="groupReceive"]').trigger('click');
    const options = wrapper.findAll('[data-testid="groupNetworkOption"]').map((option) => option.attributes('data-network'));
    expect(options.slice(0, 2)).toEqual(['Polkadot', 'Polkadot AssetHub']);
    expect(options).toEqual(expect.arrayContaining(['Hydration', 'Acala', 'Moonbeam']));
    expect(wrapper.get('[data-testid="groupNetworkWarning"]').text()).toContain('portfolioPage.groupPicker.receiveWarning');

    await wrapper.get('[data-testid="groupNetworkPickerClose"]').trigger('click');
    expect(wrapper.find('[data-testid="groupNetworkPicker"]').exists()).toBe(false);
    expect(router.push).not.toHaveBeenCalled();

    wrapper.unmount();
    scope.stop();
  });

  it('shows or hides every network of a token with one switch in Manage, in one write', async () => {
    const { accountsStore, scope } = openPortfolio(SUBSTRATE_ADDRESS, WalletEcosystem.Substrate, fundedEvmAndSubstrate());
    const wrapper = mountCurrencies({ showAssetsManagementForm: true });
    await nextTick();
    const setPreferences = vi.spyOn(accountsStore, 'setAssetPreferences');

    const dot = wrapper.findAll('.token-row').find((row) => row.attributes('data-token') === 'group:dot')!;
    await dot.get('[data-testid="tokenRowSwitch"]').trigger('click');

    expect(setPreferences).toHaveBeenCalledTimes(1);
    const written = setPreferences.mock.calls[0][0].entries;
    expect(written.every(({ preference }) => preference === 'hidden')).toBe(true);
    // Every DOT network of the wallet, the ones it holds nothing on included.
    expect(written.length).toBeGreaterThanOrEqual(10);
    expect(Object.values(accountsStore.assetPreferences).every((preference) => preference === 'hidden')).toBe(true);

    wrapper.unmount();
    scope.stop();
  });
});
