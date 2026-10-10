import { APIItemState } from '@extension-base/api/types/networks';
import BalanceService from '@extension-base/services/balance-service';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import { networkMap305, readSnapshot } from '../fixtures/legacy-305/generate';
import type { TokenGroup } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { buildPortfolioSummary, createAssetKey } from '@/portfolio/assetIdentity';
import {
  createAuthoritativeDiscoveryRegistryNetworks,
  mergeUniversalWalletRegistryNetworks,
} from '@/util/universalWalletRegistryNetworks';

vi.mock('@extension-base/stores/Storage', () => ({ storage: { get: vi.fn(), set: vi.fn() } }));

const ADDRESS = 'universal-wallet';
const PRICES = { polkadot: 5, ethereum: 2000, btc: 60000, enjincoin: 0.1 };

const snapshot = readSnapshot();
// What the popup renders with: the production registry plus the bundled Bitcoin, Solana and Iroha networks.
const popupNetworkMap = { ...networkMap305(snapshot) };
mergeUniversalWalletRegistryNetworks(popupNetworkMap, undefined);
const popupNetworks = Object.values(popupNetworkMap) as NetworkJson[];
const canary = snapshot.find(({ name }) => name === 'Canary Matrixchain')!;

function walletBalances(): TokenGroup[] {
  const groups = [
    ...getMockAssets({ ...popupNetworkMap, [canary.name]: canary }, WalletEcosystem.Substrate),
    ...getMockAssets(popupNetworkMap, WalletEcosystem.Bitcoin),
  ];
  const fund = (networkName: string, symbol: string, amount: string) =>
    groups
      .flatMap(({ balances }) => balances)
      .filter((balance) => balance.name === networkName.toLowerCase() && balance.symbol.toLowerCase() === symbol)
      .forEach((balance) => Object.assign(balance, { state: APIItemState.READY, total: amount, transferable: amount }));

  fund('Polkadot', 'dot', '2');
  fund('Ethereum', 'eth', '1');
  fund('Bitcoin', 'btc', '0.1');
  fund('Canary Matrixchain', 'cenj', '1000');
  return groups;
}

function serviceWith(groups: TokenGroup[]) {
  const service = new BalanceService({
    pricesService: { getPrice: (callback: (prices: unknown) => void) => callback({ tokenPriceMap: PRICES, tokenPriceChange: {} }) },
    networkService: {
      networksGithub: snapshot,
      get authoritativeDiscoveryNetworks() {
        return createAuthoritativeDiscoveryRegistryNetworks(snapshot);
      },
      networkValues: [],
    },
  } as unknown as State);

  service.balanceMap[ADDRESS] = groups;
  return service;
}

const polkadot = popupNetworks.find(({ name }) => name === 'Polkadot')!;
const DOT_KEY = createAssetKey({ ecosystem: 'substrate', chainId: polkadot.chainId, assetId: polkadot.assets[0].id });

describe('wallet list totals', () => {
  it('match the portfolio header, Bitcoin included, testnets excluded', async () => {
    const groups = walletBalances();
    const header = buildPortfolioSummary({
      groups,
      networks: popupNetworks,
      prices: PRICES,
      addressForNetwork: () => ADDRESS,
    });
    const [listed] = await serviceWith(groups).getTotalBalances(null);

    expect(header.total).toBe('8010');
    expect(listed).toMatchObject({ address: ADDRESS, total: header.total, visibleTotal: header.total, hiddenValue: '0', hiddenCount: 0 });
  });

  it('include hidden assets in the wallet total and report them, while the visible part equals the header', async () => {
    const groups = walletBalances();
    const header = buildPortfolioSummary({
      groups,
      networks: popupNetworks,
      prices: PRICES,
      preferences: { [DOT_KEY]: 'hidden' },
      addressForNetwork: () => ADDRESS,
    });
    const [listed] = await serviceWith(groups).getTotalBalances({ hiddenKeysByAddress: { [ADDRESS]: [DOT_KEY] } });

    expect(header).toMatchObject({ total: '8000', hiddenValue: '10' });
    expect(listed).toMatchObject({ total: '8010', visibleTotal: header.total, hiddenValue: '10', hiddenCount: 1 });
  });

  it('ignores a malformed request instead of failing the wallet list', async () => {
    const groups = walletBalances();
    const service = serviceWith(groups);

    for (const request of [{ hiddenKeysByAddress: [DOT_KEY] }, { hiddenKeysByAddress: { [ADDRESS]: 'all' } }, { hiddenKeysByAddress: { [ADDRESS]: [7, DOT_KEY] } }]) {
      const [listed] = await service.getTotalBalances(request as never);
      expect(listed.total).toBe('8010');
    }
    const [mixed] = await service.getTotalBalances({ hiddenKeysByAddress: { [ADDRESS]: [7, DOT_KEY] } } as never);
    expect(mixed.hiddenValue).toBe('10');
  });
});
