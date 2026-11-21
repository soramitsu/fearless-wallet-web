import { APIItemState } from '@extension-base/api/types/networks';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import { EVM_ADDRESS, networkMap305, readSnapshot, SUBSTRATE_ADDRESS } from '../../fixtures/legacy-305/generate';
import type { AccountJson, TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { useAccountsStore } from '@/stores/accounts';
import { useNetworksStore } from '@/stores/networks';

/** The production networks of the reviewed 3.0.5 registry snapshot, as the wallet screens load them. */
export const homeNetworks = Object.values(networkMap305(readSnapshot())).map((network) => ({ ...network, favorite: [] })) as NetworkJson[];

export const HOME_PRICES = { polkadot: 5, kusama: 20, ethereum: 2000, tether: 1, 'usd-coin': 1 };

export const createLocalStorageStub = () => {
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

/** Every asset of the registry at zero, ready, then the holdings given as [network, symbol, total, transferable]. */
export function homeBalances(holdings: Array<[network: string, symbol: string, total: string, transferable?: string]>): TokenGroup[] {
  const groups = getMockAssets(Object.fromEntries(homeNetworks.map((network) => [network.name, network])), WalletEcosystem.Substrate);

  groups.forEach(({ balances }) => balances.forEach((item) => Object.assign(item, { state: APIItemState.READY })));
  holdings.forEach(([network, symbol, total, transferable = total]) => {
    const items = groups.flatMap(({ balances }) => balances).filter((item) => item.name === network.toLowerCase() && item.symbol === symbol);
    if (!items.length) throw new Error(`No ${symbol} on ${network}`);
    items.forEach((item) => Object.assign(item, { total, transferable }));
  });

  return groups;
}

/** One substrate wallet with an EVM account, selected, holding `groups` at the fixture prices. */
export function openHomeWallet(groups: TokenGroup[], { hideZero = false, priceChanges = {} as Record<string, number> } = {}) {
  const accountsStore = useAccountsStore();
  const networksStore = useNetworksStore();
  const wallet = { address: SUBSTRATE_ADDRESS, ethereumAddress: EVM_ADDRESS, name: 'Main', walletEcosystem: WalletEcosystem.Substrate } as AccountJson;

  networksStore.allNetworks = homeNetworks;
  networksStore.setPrices({ tokenPriceMap: HOME_PRICES, tokenPriceChange: priceChanges });
  // Amounts in US dollars, as the popup shows them by default.
  networksStore.$patch({ fiats: [{ id: 'usd', symbol: '$' }] as never });
  accountsStore.$patch({ selectedFiat: 'usd' });
  accountsStore.setAccounts({ accounts: [wallet] } as never);
  accountsStore.setSelectedWallet(wallet);
  accountsStore.setBalance({ details: groups });
  accountsStore.setIsBalanceLoading(false);
  if (hideZero) accountsStore.updatePortfolioView({ hideZero: true });

  return { accountsStore, networksStore };
}
