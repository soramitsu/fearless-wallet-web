import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, nextTick } from 'vue';
import { APIItemState, NETWORK_STATUS } from '@extension-base/api/types/networks';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import BalanceService from '@extension-base/services/balance-service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUBSTRATE_ADDRESS, networkMap305, readSnapshot } from '../fixtures/legacy-305/generate';
import type State from '@extension-base/background/handlers/State';
import type { AccountJson, TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { scopeNetworksToWallet } from '@/portfolio/assetIdentity';
import { getPortfolioLoadStatus, PORTFOLIO_FIRST_LOAD_TIMEOUT_MS } from '@/portfolio/portfolioLoading';
import { isTestnetNetwork } from '@/portfolio/zeroRule';
import { usePortfolio } from '@/portfolio/usePortfolio';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';

const storageMock = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));

vi.mock('@extension-base/stores/Storage', () => ({ storage: storageMock }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/router/routes', () => ({ Components: { AssetHistory: 'AssetHistory' } }));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key, tc: (key: string, count: number) => `${key}:${count}` }),
}));
vi.mock('@/extension/messaging', () => ({ getHistory: vi.fn(), toggleFavoriteNetwork: vi.fn(), sendMessage: vi.fn() }));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));
vi.mock('@/extension/messaging/asset-discovery', () => ({ forceAssetDiscoverySweep: vi.fn() }));
vi.mock('@/extension/messaging/nfts', () => ({ fetchNfts: vi.fn() }));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => ({ features: {} }) }));

import Currencies from '@/screens/wallet&asset/wallet/Currencies.vue';
import WalletBalance from '@/screens/main/WalletBalance.vue';

const PRICES = { polkadot: 5, kusama: 20, ethereum: 2000 };
const snapshot = readSnapshot();
const networkMap = networkMap305(snapshot);
const networks = Object.values(networkMap).map((network) => ({ ...network, favorite: [] })) as NetworkJson[];
// The mainnets a Substrate wallet's placeholders cover (the shared testnet list removes two), and those a wallet
// without an EVM account holds an account for.
const mainnetNames = [...new Set(getMockAssets(networkMap, WalletEcosystem.Substrate).map(({ mainNetwork }) => mainNetwork))].filter(
  (name) => !isTestnetNetwork(networkMap[name])
);
const substrateNetworkCount = mainnetNames.length;
const inScopeOfSubstrateOnlyWallet = scopeNetworksToWallet(undefined, { walletEcosystem: WalletEcosystem.Substrate });
const substrateOnlyCount = mainnetNames.filter((name) => inScopeOfSubstrateOnlyWallet(networkMap[name])).length;

const createLocalStorageStub = () => {
  const values = new Map<string, string>();

  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
    get length() {
      return values.size;
    },
  };
};

const balanceOf = (groups: TokenGroup[], networkName: string, symbol: string) =>
  groups.flatMap(({ balances }) => balances).find((balance) => balance.name === networkName.toLowerCase() && balance.symbol === symbol)!;

function answer(groups: TokenGroup[], networkName: string, symbol: string, amount: string) {
  Object.assign(balanceOf(groups, networkName, symbol), { state: APIItemState.READY, total: amount, transferable: amount, timestamp: 1 });
}

/** Every balance of a network answered (zero unless funded). */
function answerNetwork(groups: TokenGroup[], networkName: string) {
  groups
    .flatMap(({ balances }) => balances)
    .filter(({ name }) => name === networkName.toLowerCase())
    .forEach((balance) => Object.assign(balance, { state: APIItemState.READY, total: balance.total ?? '0', timestamp: 1 }));
}

/**
 * What the background holds for a wallet upgraded in place from 3.0.5, before any network answers. 3.0.5 cached
 * balances under `balances[address][symbol][chain]` (balance-service/index.ts:51-69 at 129807f0); this build reads
 * `assetBalances`, so hydration finds nothing and the first balance message carries only registry placeholders.
 */
async function backgroundAfterUpgradeFrom305(): Promise<TokenGroup[]> {
  const dot = { chain: 'Polkadot', id: 'b54f9075-placeholder', name: 'polkadot', state: APIItemState.READY, symbol: 'dot', total: '12.5' };
  storageMock.get.mockResolvedValue({ balances: { [SUBSTRATE_ADDRESS]: { dot: { Polkadot: dot } } } });
  storageMock.set.mockResolvedValue(undefined);

  const service = new BalanceService({ networkService: { networkMap, networkValues: networks } } as unknown as State);
  service.generateDefaultBalance(SUBSTRATE_ADDRESS, WalletEcosystem.Substrate);
  await service.hydrateBalanceStorage([SUBSTRATE_ADDRESS]);

  return structuredClone(service.balanceMap[SUBSTRATE_ADDRESS]);
}

describe('portfolio load status', () => {
  const placeholders = () => getMockAssets(networkMap, WalletEcosystem.Substrate);

  it('is loading while every network of the wallet still answers with placeholders', () => {
    expect(getPortfolioLoadStatus({ groups: placeholders(), networks })).toEqual({
      state: 'loading',
      pendingCount: substrateNetworkCount,
    });
  });

  it('stays loading when only empty networks have answered, so a fast zero never reads as an empty wallet', () => {
    const groups = placeholders();
    answerNetwork(groups, 'Kusama');
    answerNetwork(groups, 'Acala');

    expect(getPortfolioLoadStatus({ groups, networks })).toEqual({ state: 'loading', pendingCount: substrateNetworkCount - 2 });
  });

  it('shows what has arrived once the wallet holds something, while it keeps checking the rest', () => {
    const groups = placeholders();
    answer(groups, 'Polkadot', 'dot', '12.5');

    expect(getPortfolioLoadStatus({ groups, networks })).toEqual({ state: 'syncing', pendingCount: substrateNetworkCount - 1 });
  });

  it('settles once every network has answered or failed', () => {
    const groups = placeholders();
    groups.forEach(({ balances }) =>
      balances.forEach((balance, index) => Object.assign(balance, { state: index % 2 ? APIItemState.ERROR : APIItemState.READY }))
    );

    expect(getPortfolioLoadStatus({ groups, networks })).toEqual({ state: 'settled', pendingCount: 0 });
  });

  it('counts a cached balance as answered: it loaded in an earlier session', () => {
    const groups = placeholders();
    groups.forEach(({ balances }) => balances.forEach((balance) => Object.assign(balance, { timestamp: 1 })));

    expect(getPortfolioLoadStatus({ groups, networks })).toEqual({ state: 'settled', pendingCount: 0 });
  });

  it('never waits on a network that is not being loaded: inactive, disconnected, a testnet, or not this wallet', () => {
    const [polkadot, kusama, acala] = ['Polkadot', 'Kusama', 'Acala'].map((name) => networkMap[name]);
    const groups = [polkadot, kusama, acala].flatMap((network) => getMockAssets({ [network.name]: network }, WalletEcosystem.Substrate));
    const only = (changes: Partial<NetworkJson>[]) =>
      [polkadot, kusama, acala].map((network, index) => ({ ...network, ...changes[index] })) as NetworkJson[];

    expect(
      getPortfolioLoadStatus({ groups, networks: only([{ active: false }, { networkStatus: NETWORK_STATUS.DISCONNECTED }, {}]) })
    ).toEqual({ state: 'loading', pendingCount: 1 });
    expect(
      getPortfolioLoadStatus({ groups, networks: only([{}, {}, {}]), isTestnet: ({ name }) => name !== 'Acala', walletScope: ({ name }) => name !== 'Acala' })
    ).toEqual({ state: 'settled', pendingCount: 0 });
  });

  it('is loading before the first balance message or the network list, and gives up waiting after the timeout', () => {
    expect(getPortfolioLoadStatus({ groups: [], networks })).toEqual({ state: 'loading', pendingCount: 0 });
    expect(getPortfolioLoadStatus({ groups: placeholders(), networks: [] })).toEqual({ state: 'loading', pendingCount: 0 });
    expect(getPortfolioLoadStatus({ groups: [], networks, timedOut: true })).toEqual({ state: 'settled', pendingCount: 0 });
    expect(getPortfolioLoadStatus({ groups: placeholders(), networks, timedOut: true })).toEqual({
      state: 'syncing',
      pendingCount: substrateNetworkCount,
    });
  });
});

describe('first open after upgrading from 3.0.5', () => {
  const stubs = {
    ExternalLogo: true,
    Icon: true,
    Loader: true,
    Scroll: { template: '<main><slot /></main>' },
    Shimmer: { template: '<i class="shimmer-stub" />' },
  };
  const mocks = { $t: (key: string, count?: number) => (typeof count === 'number' ? `${key}:${count}` : key) };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', createLocalStorageStub());
    setActivePinia(createPinia());
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    storageMock.get.mockReset();
    storageMock.set.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function openPopup(groups: TokenGroup[]) {
    const accountsStore = useAccountsStore();
    const networksStore = useNetworksStore();
    networksStore.allNetworks = networks;
    networksStore.setPrices({ tokenPriceMap: PRICES, tokenPriceChange: {} });
    accountsStore.setSelectedWallet({ address: SUBSTRATE_ADDRESS, ethereumAddress: '', name: 'Upgraded' } as AccountJson);
    // The background answers the first balance request at once.
    accountsStore.setBalance({ details: groups });
    accountsStore.setIsBalanceLoading(false);
    // Rows are read per network section; the loading state is the same in both lenses.
    accountsStore.updatePortfolioView({ lens: 'network' });

    const scope = effectScope();
    const portfolio = scope.run(() => usePortfolio())!;
    const list = mount(Currencies, {
      props: { balances: [], filterValue: '', showAssetsManagementForm: false, manageHiddenOnly: false },
      global: { mocks, stubs },
    });
    const header = () =>
      mount(WalletBalance, {
        props: { balance: portfolio.summary.value.total, loading: portfolio.loadStatus.value.state === 'loading' },
        global: { mocks, stubs },
      });
    await nextTick();

    return { accountsStore, portfolio, list, header, scope };
  }

  it('says it is loading instead of "$0.00" and "No assets detected yet", then shows the funds as they arrive', async () => {
    const groups = await backgroundAfterUpgradeFrom305();
    // The 3.0.5 cache was not read: every row is a placeholder.
    expect(groups.flatMap(({ balances }) => balances).every(({ state, timestamp }) => state === APIItemState.PENDING && !timestamp)).toBe(true);

    const { accountsStore, portfolio, list, header, scope } = await openPopup(groups);

    expect(list.find('[data-testid="portfolioLoading"]').text()).toContain('portfolioPage.loadingBalances');
    expect(list.find('[data-testid="portfolioLoading"]').text()).toContain(`portfolioPage.checkingNetworks:${substrateOnlyCount}`);
    expect(list.find('[data-testid="infoText"]').exists()).toBe(false);
    const loadingHeader = header();
    expect(loadingHeader.find('[data-testid="fiatBalance"]').exists()).toBe(false);
    expect(loadingHeader.find('[data-testid="fiatBalanceLoading"]').exists()).toBe(true);

    // Kusama answers first, with nothing: still not an empty wallet.
    const kusamaAnswered = structuredClone(groups);
    answerNetwork(kusamaAnswered, 'Kusama');
    accountsStore.setBalance({ details: kusamaAnswered });
    await nextTick();
    expect(list.find('[data-testid="portfolioLoading"]').exists()).toBe(true);
    expect(list.find('[data-testid="infoText"]').exists()).toBe(false);

    // Polkadot answers with the 12.5 DOT the user had in 3.0.5.
    const polkadotAnswered = structuredClone(kusamaAnswered);
    answer(polkadotAnswered, 'Polkadot', 'dot', '12.5');
    accountsStore.setBalance({ details: polkadotAnswered });
    await nextTick();

    expect(list.find('[data-testid="portfolioLoading"]').exists()).toBe(false);
    expect(list.find('.network-section[data-network="Polkadot"]').exists()).toBe(true);
    expect(list.get('[data-testid="portfolioChecking"]').text()).toBe(`portfolioPage.checkingNetworks:${substrateOnlyCount - 2}`);
    // 12.5 DOT at $5, now a real total (the fiat symbol comes from the fiat settings, not loaded here).
    expect(header().get('[data-testid="fiatBalance"]').text()).toMatch(/^\D*62\.50$/u);
    expect(portfolio.loadStatus.value.state).toBe('syncing');

    list.unmount();
    scope.stop();
  });

  it('after the wait, an empty wallet says so and still names the networks it is checking', async () => {
    const groups = await backgroundAfterUpgradeFrom305();
    const { list, scope } = await openPopup(groups);
    expect(list.find('[data-testid="portfolioLoading"]').exists()).toBe(true);

    await vi.advanceTimersByTimeAsync(PORTFOLIO_FIRST_LOAD_TIMEOUT_MS);

    expect(list.find('[data-testid="portfolioLoading"]').exists()).toBe(false);
    expect(list.get('[data-testid="infoText"]').text()).toContain('portfolioPage.noAssetsDetected');
    expect(list.get('[data-testid="portfolioChecking"]').text()).toBe(`portfolioPage.checkingNetworks:${substrateOnlyCount}`);

    list.unmount();
    scope.stop();
  });

  it('starts the wait again on a wallet switch', async () => {
    const groups = await backgroundAfterUpgradeFrom305();
    const { accountsStore, portfolio, list, scope } = await openPopup(groups);

    await vi.advanceTimersByTimeAsync(PORTFOLIO_FIRST_LOAD_TIMEOUT_MS);
    expect(portfolio.loadStatus.value.state).toBe('syncing');

    accountsStore.setSelectedWallet({ address: 'second-wallet', ethereumAddress: '', name: 'Second' } as AccountJson);
    accountsStore.setBalance({ details: getMockAssets(networkMap, WalletEcosystem.Substrate) });
    accountsStore.setIsBalanceLoading(false);
    await nextTick();

    expect(portfolio.loadStatus.value.state).toBe('loading');
    expect(list.find('[data-testid="portfolioLoading"]').exists()).toBe(true);

    list.unmount();
    scope.stop();
  });

  it('never shows the loading screen in Manage, which lists every asset whatever it holds', async () => {
    const groups = await backgroundAfterUpgradeFrom305();
    const { list, scope } = await openPopup(groups);

    await list.setProps({ showAssetsManagementForm: true });

    expect(list.find('[data-testid="portfolioLoading"]').exists()).toBe(false);
    expect(list.find('[data-testid="portfolioNetworkList"]').exists()).toBe(true);

    list.unmount();
    scope.stop();
  });
});
