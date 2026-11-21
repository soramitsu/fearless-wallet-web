import { flushPromises, mount } from '@vue/test-utils';
import { APIItemState } from '@extension-base/api/types/networks';
import BalanceService from '@extension-base/services/balance-service';
import { EVM_ADDRESS, SUBSTRATE_ADDRESS, networkMap305, readSnapshot } from '../fixtures/legacy-305/generate';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { buildPortfolioSections, buildPortfolioSummary } from '@/portfolio/assetIdentity';
import { buildTokenRows, splitZeroTokenRows } from '@/portfolio/tokenLens';
import { buildCanonicalGroupIndex } from '@/portfolio/tokenGroups';
import { mergeUniversalWalletRegistryNetworks } from '@/util/universalWalletRegistryNetworks';

const storageMock = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));

vi.mock('@extension-base/stores/Storage', () => ({ storage: storageMock }));
vi.mock('@/extension/messaging', () => ({ getHistory: vi.fn(), toggleFavoriteNetwork: vi.fn(), sendMessage: vi.fn() }));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));
vi.mock('@/stores/accounts', () => ({
  useAccountsStore: () => ({ fiatSymbol: '$', selectedNetwork: 'Ethereum', selectedWallet: { isTon: false } }),
}));
vi.mock('@/screens/accounts/AccountSettingsPopup.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/wallet&asset/BalanceDetailsPopup.vue', () => ({ default: { template: '<div />' } }));

import AssetInfo from '@/screens/wallet&asset/asset/AssetInfo.vue';

// The networks a 3.0.5 build had (the shipped chains/v13 registry), with the app-owned ones the runtime adds.
const networkMap = networkMap305(readSnapshot());
mergeUniversalWalletRegistryNetworks(networkMap, undefined);
const networks = Object.values(networkMap) as NetworkJson[];
const PRICES = { ethereum: 2000, tether: 1 };
const USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7';

// The background of a wallet on its first start after the update from 3.0.5, whose Ethereum RPC fails: 3.0.5 kept
// balances under `balances`, which this build does not read, so there is no `assetBalances` cache to fall back on.
async function upgradedFrom305WithFailingRpc() {
  let stored: Record<string, unknown> = { balances: { [SUBSTRATE_ADDRESS]: [{ symbol: 'eth', balance: '1.5' }] } };
  storageMock.get.mockImplementation(async () => structuredClone(stored));
  storageMock.set.mockImplementation(async (value: Record<string, unknown>) => {
    stored = { ...stored, ...structuredClone(value) };
  });

  const rpcDown = async () => {
    throw new Error('503 Service Unavailable');
  };
  const state = {
    keyringService: {
      getAllMainAccounts: () => [{ address: SUBSTRATE_ADDRESS }],
      getSubstrateAddress: () => SUBSTRATE_ADDRESS,
    },
    networkService: {
      networkMap,
      networkValues: networks,
      networksGithub: networks,
      authoritativeDiscoveryNetworks: networks,
      evmApiHandler: { failover: vi.fn() },
    },
    pricesService: {
      getPrice: (reply: (prices: { tokenPriceMap: Record<string, number>; tokenPriceChange: Record<string, number> }) => void) =>
        reply({ tokenPriceMap: PRICES, tokenPriceChange: {} }),
    },
    evmContractService: { getContract: async () => ({ balanceOf: rpcDown }) },
    timeoutService: { lazyNext: vi.fn() },
    getEvmApi: () => ({ api: { getBalance: rpcDown } }),
  } as unknown as State;
  const service = new BalanceService(state);
  (state as unknown as { balanceService: BalanceService }).balanceService = service;

  service.generateDefaultBalance(SUBSTRATE_ADDRESS, WalletEcosystem.Substrate);
  await service.hydrateBalanceStorage([SUBSTRATE_ADDRESS]);

  return { service, state };
}

const itemOf = (service: BalanceService, symbol: string) =>
  service.balanceMap[SUBSTRATE_ADDRESS].flatMap(({ balances }) => balances).find(
    ({ name, symbol: itemSymbol }) => name === 'ethereum' && itemSymbol === symbol
  )!;

describe('Ethereum balances of a wallet updated from 3.0.5 whose RPC fails', () => {
  beforeEach(() => {
    storageMock.get.mockReset();
    storageMock.set.mockReset();
  });

  it('are failed with no amount, never a confirmed 0, in the background', async () => {
    const { service, state } = await upgradedFrom305WithFailingRpc();

    await service.evmBalanceService.fetchUtilityBalance('Ethereum', EVM_ADDRESS, state);
    await service.evmBalanceService.fetchTokenBalance(EVM_ADDRESS, 'Ethereum', USDT, state);

    for (const symbol of ['eth', 'usdt']) {
      const item = itemOf(service, symbol);
      expect(item.state).toBe(APIItemState.ERROR);
      expect([item.total, item.transferable, item.free]).toEqual([undefined, undefined, undefined]);
    }
  });

  it('say so in By token, the header and the wallet list instead of folding ETH under "no balance"', async () => {
    const { service, state } = await upgradedFrom305WithFailingRpc();

    await service.evmBalanceService.fetchUtilityBalance('Ethereum', EVM_ADDRESS, state);
    await service.evmBalanceService.fetchTokenBalance(EVM_ADDRESS, 'Ethereum', USDT, state);

    const input = {
      groups: service.balanceMap[SUBSTRATE_ADDRESS],
      networks,
      prices: PRICES,
      preferences: {},
      addressForNetwork: () => SUBSTRATE_ADDRESS,
    };
    const sections = buildPortfolioSections({ ...input, isDefaultVisibleAtZero: () => true });
    const ethereum = sections.find(({ name }) => name === 'Ethereum')!;

    expect(ethereum.assets.find(({ symbol }) => symbol === 'ETH')).toMatchObject({ balanceUnavailable: true, hasBalance: false });

    const rows = buildTokenRows({ sections, index: buildCanonicalGroupIndex({ networks }) });
    const ethRow = rows.find(({ symbol }) => symbol === 'ETH')!;
    expect(ethRow).toMatchObject({ balanceUnavailable: true, fiatValue: null });
    expect(splitZeroTokenRows(rows).funded).toContain(ethRow);

    expect(buildPortfolioSummary(input).unavailableCount).toBeGreaterThanOrEqual(2);
    const [walletList] = await service.getTotalBalances(null);
    expect(walletList.unavailableCount).toBeGreaterThanOrEqual(2);
  });

  it('keep the last confirmed amount, marked as failed, once the RPC answered before', async () => {
    const { service, state } = await upgradedFrom305WithFailingRpc();
    service.setBalanceItem(
      'Ethereum',
      { state: APIItemState.READY, symbol: 'eth', id: itemOf(service, 'eth').id, relayChain: 'ethereum', free: '1.5', transferable: '1.5', total: '1.5' },
      SUBSTRATE_ADDRESS
    );

    await service.evmBalanceService.fetchUtilityBalance('Ethereum', EVM_ADDRESS, state);

    expect(itemOf(service, 'eth')).toMatchObject({ state: APIItemState.ERROR, total: '1.5', transferable: '1.5' });
  });

  it('show the asset page as failed, not "0 ETH"', async () => {
    const { service, state } = await upgradedFrom305WithFailingRpc();
    await service.evmBalanceService.fetchUtilityBalance('Ethereum', EVM_ADDRESS, state);
    const currency = service.balanceMap[SUBSTRATE_ADDRESS].find(({ balances }) => balances.includes(itemOf(service, 'eth')));

    const wrapper = mount(AssetInfo, {
      props: { currency, price: { price: 2000, priceChange: 0 } },
      global: {
        mocks: {
          $t: (key: string) => key,
          $n: (value: number) => String(value),
          $route: { params: { selectedNetwork: 'Ethereum' } },
        },
        stubs: {
          Fragment: { template: '<div><slot /></div>' },
          ContentForm: { template: '<div><slot /></div>' },
          ExternalLogo: true,
          Icon: true,
          Shimmer: { template: '<i data-testid="shimmer" />' },
          BalanceDetailsPopup: true,
          AccountSettingsPopup: true,
        },
      },
    });
    await flushPromises();

    expect(wrapper.get('[data-testid="assetBalanceUnavailable"]').text()).toBe('portfolioPage.balanceStatus.failed');
    expect(wrapper.find('[data-testid="assetBalance"]').exists()).toBe(false);
    expect(wrapper.text()).not.toMatch(/\b0 ETH\b/);
    wrapper.unmount();
  });
});
