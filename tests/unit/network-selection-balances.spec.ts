import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { APIItemState, NETWORK_STATUS } from '@extension-base/api/types/networks';
import type { NetworkJson } from '@extension-base/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import { getSummaryTransferableBalance } from '@/helpers/common';
import { networksIsPending } from '@/helpers/shimmers';
import { getSummaryTransferableBalanceFilteredByActiveNetworks, filterBalanceItemsByNetwork, defaultSortingCurrencies } from '@/helpers/currencies';

const state = vi.hoisted(() => ({ networks: [] as NetworkJson[], address: 'alice' }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ selectedWallet: { address: state.address } }) }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({
  networks: state.networks,
  getNetwork: (name: string) => state.networks.find((network) => network.name.toLowerCase() === name.toLowerCase()),
}) }));

const token = {
  balances: [
    { name: 'Polkadot', transferable: '2', state: APIItemState.READY },
    { name: 'Ethereum', transferable: '7', state: APIItemState.READY },
    { name: 'Kusama', transferable: '11', state: APIItemState.READY },
    { name: 'Removed', transferable: '13', state: APIItemState.READY },
    { name: 'Pending', transferable: '17', state: APIItemState.PENDING },
  ],
} as TokenGroup;

beforeEach(() => {
  state.address = 'alice';
  state.networks = [
    { name: 'Polkadot', active: true, rank: 0, favorite: ['alice'], networkStatus: NETWORK_STATUS.CONNECTED },
    { name: 'Ethereum', active: true, favorite: ['bob'], networkStatus: NETWORK_STATUS.CONNECTING },
    { name: 'Kusama', active: false, favorite: ['alice'], networkStatus: NETWORK_STATUS.CONNECTING },
    { name: 'Pending', active: true, rank: 1, favorite: [], networkStatus: NETWORK_STATUS.CONNECTED },
  ] as NetworkJson[];
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe('network-group balances and loading state', () => {
  it('counts only group members, with favorites scoped to the wallet', () => {
    expect(getSummaryTransferableBalance(token, 'POPULAR', state.networks, 'alice')).toBe(2);
    expect(getSummaryTransferableBalance(token, 'favorites', state.networks, 'alice')).toBe(13);
    expect(getSummaryTransferableBalance(token, 'favorites', state.networks, 'bob')).toBe(7);
    expect(getSummaryTransferableBalance(token, 'favorites', state.networks)).toBe(0);
    expect(getSummaryTransferableBalance(token, 'all')).toBe(33);
    expect(getSummaryTransferableBalance(token, 'eThErEuM')).toBe('7');
  });

  it('filters active totals and tolerates removed networks', () => {
    expect(getSummaryTransferableBalanceFilteredByActiveNetworks(token, 'popular')).toBe(2);
    expect(getSummaryTransferableBalanceFilteredByActiveNetworks(token, 'favorites')).toBe(2);
    expect(getSummaryTransferableBalanceFilteredByActiveNetworks(token)).toBe(9);
    expect(filterBalanceItemsByNetwork(token.balances[3], 'popular')).toBe(false);
    state.address = 'bob';
    expect(getSummaryTransferableBalanceFilteredByActiveNetworks(token, 'favorites')).toBe(7);
  });

  it('ignores connecting networks outside the selected group and inactive favorites', () => {
    expect(networksIsPending(state.networks, 'popular', 'alice')).toBe(false);
    expect(networksIsPending(state.networks, 'favorites', 'alice')).toBe(false);
    expect(networksIsPending(state.networks, 'favorites', 'bob')).toBe(true);
    expect(networksIsPending(state.networks, 'all', 'alice')).toBe(true);
    expect(networksIsPending(state.networks, 'Ethereum', 'alice')).toBe(true);
    expect(networksIsPending(state.networks, 'Polkadot', 'alice')).toBe(false);
  });

  it('sorts currencies by the selected group rather than unrelated balances', () => {
    const currency = (symbol: string, polkadot: string, ethereum: string) => ({
      symbol, priceId: symbol,
      balances: [
        { name: 'Polkadot', state: APIItemState.READY, total: polkadot, transferable: polkadot },
        { name: 'Ethereum', state: APIItemState.READY, total: ethereum, transferable: ethereum },
      ],
    }) as TokenGroup;
    const currencies = [currency('a', '2', '7'), currency('b', '4', '1')];
    const prices = { tokenPriceMap: { a: 1, b: 1 }, tokenPriceChange: {} } as Parameters<typeof defaultSortingCurrencies>[1];
    expect(defaultSortingCurrencies(currencies, prices, 'all').map(({ symbol }) => symbol)).toEqual(['a', 'b']);
    expect(defaultSortingCurrencies(currencies, prices, 'popular').map(({ symbol }) => symbol)).toEqual(['b', 'a']);
  });

  it('keeps the offline indicator for grouped networks', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(networksIsPending(state.networks, 'popular', 'alice')).toBe(true);
  });
});
