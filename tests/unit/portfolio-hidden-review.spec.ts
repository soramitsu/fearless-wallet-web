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
  const scope = effectScope();
  const portfolio = scope.run(() => usePortfolio())!;

  return { accountsStore, portfolio, scope };
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
  wrapper
    .findAll('.network-section')
    .flatMap((section) =>
      section
        .findAll('.asset-row')
        .map(
          (row) =>
            `${section.attributes('data-network')}:${row.get('.asset-symbol').text()}` +
            (row.find('[data-testid="testnetBadge"]').exists() || section.find('[data-testid="testnetBadge"]').exists()
              ? ':testnet'
              : '')
        )
    );

const text = (wrapper: VueWrapper, testId: string) => {
  const element = wrapper.find(`[data-testid="${testId}"]`);
  return element.exists() ? element.text() : null;
};

// Review (the notice), "N hidden not included · Manage" (the footer) and "Hidden (N)" (the chip) all open Manage on
// the Hidden filter. Wallet.vue does that by setting these two props.
async function review(wrapper: VueWrapper) {
  await wrapper.get('[data-testid="reviewHiddenFunds"]').trigger('click');
  expect(wrapper.emitted('toggleAssetsManagementForm')?.at(-1)).toEqual([true]);
  expect(wrapper.emitted('update:manageHiddenOnly')?.at(-1)).toEqual([true]);
  await wrapper.setProps({ showAssetsManagementForm: true, manageHiddenOnly: true });
}

describe('reviewing hidden funds after a 3.0.5 upgrade', () => {
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

    await review(wrapper);

    expect(rows(wrapper)).toContain('Polkadot AssetHub:USDT');
    // The "Hidden (N)" chip counts exactly the rows this list shows.
    expect(rows(wrapper)).toHaveLength(portfolio.summary.value.hiddenAssetCount);
    wrapper.unmount();
    scope.stop();
  });

  it('lists a funded hidden asset on another network than the one selected, instead of "No hidden assets"', async () => {
    seed('hide-zero');
    const { scope } = open(funded(['Polkadot', 'dot', '12.5'], ['Kusama', 'ksm', '3']), 'Polkadot');
    const wrapper = mountCurrencies();
    await nextTick();

    expect(text(wrapper, 'hiddenNotIncluded')).toBe('portfolioPage.hiddenNotIncluded:1');
    await review(wrapper);

    expect(rows(wrapper)).toContain('Kusama:KSM');
    expect(text(wrapper, 'infoText')).toBeNull();
    wrapper.unmount();
    scope.stop();
  });

  it('counts in the chip exactly what the Hidden list shows under a network filter', async () => {
    seed('switches');
    const { portfolio, scope } = open(funded(['Polkadot', 'dot', '1']), POPULAR_NETWORKS);
    const wrapper = mountCurrencies({ showAssetsManagementForm: true, manageHiddenOnly: true });
    await nextTick();

    expect(portfolio.summary.value.hiddenAssetCount).toBeGreaterThan(0);
    expect(rows(wrapper)).toHaveLength(portfolio.summary.value.hiddenAssetCount);
    wrapper.unmount();
    scope.stop();
  });

  it('ignores a search typed before Review, because Manage has no search field to clear it', async () => {
    seed('hide-zero');
    const { scope } = open(funded(['Polkadot', 'dot', '12.5'], ['Kusama', 'ksm', '3']));
    const wrapper = mountCurrencies({ filterValue: 'dot' });
    await nextTick();
    expect(rows(wrapper)).not.toContain('Kusama:KSM');

    await review(wrapper);

    expect(rows(wrapper)).toContain('Kusama:KSM');
    expect(rows(wrapper).some((row) => !/dot/i.test(row))).toBe(true);

    // Back in the list, the search applies again.
    await wrapper.setProps({ showAssetsManagementForm: false, manageHiddenOnly: false });
    expect(rows(wrapper).every((row) => /dot/i.test(row))).toBe(true);
    wrapper.unmount();
    scope.stop();
  });
});

describe('test networks in the portfolio', () => {
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

describe('portfolio empty states', () => {
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
    expect(wrapper.get('[data-testid="portfolioZeroNetworks"] .zero-header').text()).toBe(
      'portfolioPage.zeroNetworks:1'
    );
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
    expect(wrapper.get('[data-testid="portfolioZeroNetworks"] .zero-header').text()).toBe(
      'portfolioPage.popularNoBalance'
    );
    wrapper.unmount();
    scope.stop();
  });
});
