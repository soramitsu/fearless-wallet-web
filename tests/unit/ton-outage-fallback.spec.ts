import { APIItemState } from '@extension-base/api/types/networks';
import { HistoryService } from '@extension-base/services/history-service';
import { TonBalance } from '@extension-base/services/ton-balance/TonBalance';
import type State from '@extension-base/background/handlers/State';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { TON_ID } from '@/consts/currencies';

const ADDRESS = 'ton-wallet-address';
const NETWORK_KEY = 'ton mainnet';
const NETWORK_NAME = 'TON Mainnet';
const WALLET_CONTRACT_ADDRESS = {
  toString: () => 'EQWalletContract',
};

const tonNetwork = {
  active: true,
  addressPrefix: 0,
  assets: [
    {
      color: '#0088cc',
      icon: 'ton',
      id: TON_ID,
      isNative: true,
      isUtility: true,
      name: 'Toncoin',
      precision: 9,
      providers: [],
      staking: '',
      symbol: 'TON',
      tonType: 'ton',
      type: 'ton',
    },
  ],
  chain: NETWORK_NAME,
  chainId: 'ton:mainnet',
  currentProvider: 'ti',
  customNodes: [],
  disabled: false,
  ecosystem: 'ton',
  favorite: [],
  genesisHash: 'ton:mainnet',
  icon: 'ton',
  key: NETWORK_NAME,
  name: NETWORK_NAME,
  nodes: [{ name: 'TI', url: 'https://ti.soramitsu.io' }],
  providers: {},
  ss58Format: 0,
  types: { name: NETWORK_NAME, url: '' },
} as unknown as NetworkJson;

const nativeGroup = (balance: string): TokenGroup =>
  ({
    balances: [
      {
        free: balance,
        icon: 'ton',
        id: TON_ID,
        isNative: true,
        isUtility: true,
        mainNetwork: NETWORK_NAME,
        name: NETWORK_KEY,
        precision: 9,
        relayChain: NETWORK_NAME.toLowerCase(),
        state: APIItemState.READY,
        symbol: 'TON',
        total: balance,
        transferable: balance,
        type: 'ton',
      },
    ],
    groupId: TON_ID,
    icon: 'ton',
    mainNetwork: NETWORK_NAME,
    priceId: 'TON',
    providers: [],
    relayChain: NETWORK_NAME,
    symbol: 'TON',
    tokenName: 'Toncoin',
  }) as unknown as TokenGroup;

const jettonGroup = (balance: string): TokenGroup =>
  ({
    balances: [
      {
        assetIcon: 'https://example.com/usdc.png',
        free: balance,
        icon: 'ton',
        id: 'jetton-usdc',
        mainNetwork: NETWORK_NAME,
        name: NETWORK_KEY,
        precision: 6,
        relayChain: NETWORK_NAME.toLowerCase(),
        state: APIItemState.READY,
        symbol: 'usdc',
        total: balance,
        transferable: balance,
        type: 'jetton',
      },
    ],
    groupId: 'jetton-usdc',
    icon: 'https://example.com/usdc.png',
    mainNetwork: NETWORK_NAME,
    priceId: 'usdc',
    providers: [],
    relayChain: NETWORK_NAME,
    symbol: 'usdc',
    tokenName: 'USD Coin',
  }) as unknown as TokenGroup;

const createTonState = (balanceMap: Record<string, TokenGroup[]> = {}) => {
  const getAccountBalance = vi.fn();
  const getJettonBalances = vi.fn();
  const setBalanceItem = vi.fn();
  const updateBalanceStore = vi.fn();
  const state = {
    balanceService: {
      balanceMap,
      setBalanceItem,
      updateBalanceStore,
    },
    getTonApiMap: {
      [NETWORK_KEY]: {
        api: {
          getAccountBalance,
          getJettonBalances,
        },
      },
    },
    keyringService: {
      getAllMainAccounts: vi.fn(() => [{ address: ADDRESS }]),
      getSubstrateAddress: vi.fn((address: string) => address),
      tonKeyring: {
        accountSubject: {
          value: {
            [ADDRESS]: {
              walletContract: {
                address: WALLET_CONTRACT_ADDRESS,
              },
            },
          },
        },
      },
    },
    networkService: {
      networksGithub: [tonNetwork],
    },
    pricesService: {
      fiatSymbol: 'USD',
      setPriceValue: vi.fn(),
      tonPricingService: { tonParseRates: vi.fn() },
    },
  } as unknown as State;

  return { getAccountBalance, getJettonBalances, setBalanceItem, state, updateBalanceStore };
};

const createHistoryState = () => {
  const getHistory = vi.fn();
  const state = {
    currentAccount: { address: ADDRESS },
    getTonApiMap: {
      [NETWORK_KEY]: {
        api: {
          getHistory,
        },
      },
    },
    keyringService: {
      tonKeyring: {
        accountSubject: {
          value: {
            [ADDRESS]: {
              walletContract: {
                address: WALLET_CONTRACT_ADDRESS,
              },
            },
          },
        },
        getUserFriendlyAddress: vi.fn((address: { toString: () => string }) => `friendly:${address.toString()}`),
      },
    },
  } as unknown as State;

  return { getHistory, state };
};

describe('TON outage fallback behavior', () => {
  it('zeros a cached Jetton only after a successful complete response omits it', async () => {
    const { getAccountBalance, getJettonBalances, state, updateBalanceStore } = createTonState({
      [ADDRESS]: [nativeGroup('1'), jettonGroup('7.25')],
    });
    getAccountBalance.mockResolvedValue({ balance: 1_000_000_000n, hasActivity: true });
    getJettonBalances.mockResolvedValue({ holdings: [], complete: true });
    const service = new TonBalance(state);

    await service.fetchBalance(ADDRESS, [NETWORK_KEY]);

    expect(state.balanceService.balanceMap[ADDRESS][1].balances[0]).toMatchObject({
      id: 'jetton-usdc',
      state: APIItemState.READY,
      total: '0',
      transferable: '0',
    });
    expect(updateBalanceStore).toHaveBeenCalledWith(
      NETWORK_NAME,
      expect.objectContaining({ id: 'jetton-usdc', state: APIItemState.READY, total: '0' }),
      ADDRESS
    );
  });

  it('keeps a cached Jetton that TI does not list, because TI lists only the jettons it indexes', async () => {
    const { getAccountBalance, getJettonBalances, setBalanceItem, state, updateBalanceStore } = createTonState({
      [ADDRESS]: [nativeGroup('1'), jettonGroup('7.25')],
    });
    getAccountBalance.mockResolvedValue({ balance: 1_000_000_000n, hasActivity: true });
    getJettonBalances.mockResolvedValue({ holdings: [], complete: false });
    const service = new TonBalance(state);

    await service.fetchBalance(ADDRESS, [NETWORK_KEY]);

    expect(state.balanceService.balanceMap[ADDRESS][1].balances[0]).toMatchObject({ id: 'jetton-usdc', total: '7.25' });
    expect(updateBalanceStore).not.toHaveBeenCalled();
    // The network's coverage says the list was partial.
    expect(setBalanceItem).toHaveBeenCalledWith(
      NETWORK_NAME,
      expect.objectContaining({ id: TON_ID, state: APIItemState.READY, total: '1', scanCoverage: 'limited' }),
      ADDRESS
    );
  });

  it('keeps the previous native and jetton balances, marked as failed, when no provider answers', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { getAccountBalance, getJettonBalances, setBalanceItem, state } = createTonState({
      [ADDRESS]: [nativeGroup('42.5'), jettonGroup('7.25')],
    });
    getAccountBalance.mockRejectedValue(new Error('ton_provider_unavailable'));
    getJettonBalances.mockRejectedValue(new Error('ton_provider_unavailable'));
    const service = new TonBalance(state);

    await expect(service.fetchBalance(ADDRESS, [NETWORK_KEY])).resolves.toEqual([
      { assetId: TON_ID, balance: '42.5', network: NETWORK_NAME },
      { assetId: 'jetton-usdc', balance: '7.25', network: NETWORK_NAME },
    ]);

    expect(setBalanceItem).toHaveBeenCalledWith(
      NETWORK_NAME,
      expect.objectContaining({
        id: TON_ID,
        state: APIItemState.ERROR,
        total: '42.5',
        transferable: '42.5',
      }),
      ADDRESS
    );
    expect(setBalanceItem).toHaveBeenCalledWith(
      NETWORK_NAME,
      expect.objectContaining({
        id: 'jetton-usdc',
        state: APIItemState.ERROR,
        total: '7.25',
        transferable: '7.25',
      }),
      ADDRESS
    );

    warn.mockRestore();
  });

  it('marks TON as failed with no amount, never zero, when no provider answers and nothing was loaded before', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { getAccountBalance, getJettonBalances, setBalanceItem, state } = createTonState();
    getAccountBalance.mockRejectedValue(new Error('ton_provider_unavailable'));
    getJettonBalances.mockRejectedValue(new Error('ton_provider_unavailable'));
    const service = new TonBalance(state);

    await expect(service.fetchBalance(ADDRESS, [NETWORK_KEY])).resolves.toEqual([]);

    expect(setBalanceItem).toHaveBeenCalledOnce();
    const [, item] = setBalanceItem.mock.calls[0];
    expect(item).toMatchObject({ id: TON_ID, state: APIItemState.ERROR });
    expect(item.total).toBeUndefined();
    expect(item.transferable).toBeUndefined();

    warn.mockRestore();
  });

  it('fails the balance when the network has no TON provider at all', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { setBalanceItem, state } = createTonState();
    (state as unknown as { getTonApiMap: Record<string, unknown> }).getTonApiMap = {};

    await expect(new TonBalance(state).fetchBalance(ADDRESS, [NETWORK_KEY])).resolves.toEqual([]);
    expect(setBalanceItem.mock.calls[0][1]).toMatchObject({ id: TON_ID, state: APIItemState.ERROR, total: undefined });

    warn.mockRestore();
  });

  it('returns cached history on outage without exposing cached objects to mutation', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { getHistory, state } = createHistoryState();
    const service = new HistoryService(state);
    getHistory.mockResolvedValueOnce([
      {
        actions: [
          {
            type: 'ton-transfer',
            success: true,
            amount: '1000000000',
            comment: 'first',
            recipient: { toString: () => 'EQRecipient' },
            sender: WALLET_CONTRACT_ADDRESS,
          },
        ],
        eventId: 'event-1',
        fee: '12500',
        timestamp: 1_710_000_000,
      },
    ]);

    const first = await service.fetchTonAssetsHistory({ address: ADDRESS, network: NETWORK_KEY });
    first[TON_ID][0].amount = 'mutated-by-caller';
    getHistory.mockRejectedValueOnce(new Error('ti unavailable'));

    await expect(service.fetchTonAssetsHistory({ address: ADDRESS, network: NETWORK_KEY })).resolves.toEqual({
      [TON_ID]: [
        expect.objectContaining({
          amount: '1000000000',
          eventId: 'event-1',
          from: 'friendly:EQWalletContract',
          isOutEvent: true,
          method: 'transfer',
          networkFee: '12500',
          success: true,
          symbol: 'ton',
          to: 'friendly:EQRecipient',
        }),
      ],
    });
    expect(getHistory).toHaveBeenCalledWith(WALLET_CONTRACT_ADDRESS, 100);

    warn.mockRestore();
  });
});
