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
  const getAccount = vi.fn();
  const getAccountJettonsBalances = vi.fn();
  const setBalanceItem = vi.fn();
  const state = {
    balanceService: {
      balanceMap,
      setBalanceItem,
    },
    getTonApiMap: {
      [NETWORK_KEY]: {
        api: {
          accounts: {
            getAccount,
            getAccountJettonsBalances,
          },
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
  } as unknown as State;

  return { getAccount, getAccountJettonsBalances, setBalanceItem, state };
};

const createHistoryState = () => {
  const getAccountEvents = vi.fn();
  const state = {
    currentAccount: { address: ADDRESS },
    getTonApiMap: {
      [NETWORK_KEY]: {
        api: {
          accounts: {
            getAccountEvents,
          },
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

  return { getAccountEvents, state };
};

describe('TON outage fallback behavior', () => {
  it('keeps the previous native and jetton balances when TI is unavailable', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { getAccount, getAccountJettonsBalances, setBalanceItem, state } = createTonState({
      [ADDRESS]: [nativeGroup('42.5'), jettonGroup('7.25')],
    });
    getAccount.mockRejectedValue(new Error('ti unavailable'));
    getAccountJettonsBalances.mockRejectedValue(new Error('ti unavailable'));
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

  it('marks TON as errored with zero only when there is no cached balance', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { getAccount, getAccountJettonsBalances, setBalanceItem, state } = createTonState();
    getAccount.mockRejectedValue(new Error('ti unavailable'));
    getAccountJettonsBalances.mockRejectedValue(new Error('ti unavailable'));
    const service = new TonBalance(state);

    await expect(service.fetchBalance(ADDRESS, [NETWORK_KEY])).resolves.toEqual([
      { assetId: TON_ID, balance: '0', network: NETWORK_NAME },
    ]);

    expect(setBalanceItem).toHaveBeenCalledWith(
      NETWORK_NAME,
      expect.objectContaining({
        id: TON_ID,
        state: APIItemState.ERROR,
        total: '0',
        transferable: '0',
      }),
      ADDRESS
    );

    warn.mockRestore();
  });

  it('returns cached history on outage without exposing cached objects to mutation', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { getAccountEvents, state } = createHistoryState();
    const service = new HistoryService(state);
    getAccountEvents.mockResolvedValueOnce({
      events: [
        {
          actions: [
            {
              status: 'ok',
              type: 'TonTransfer',
              TonTransfer: {
                amount: { toString: () => '1000000000' },
                comment: 'first',
                recipient: { address: { toString: () => 'EQRecipient' } },
                sender: { address: WALLET_CONTRACT_ADDRESS },
              },
            },
          ],
          eventId: 'event-1',
          extra: { toString: () => '12500' },
          timestamp: 1_710_000_000,
        },
      ],
    });

    const first = await service.fetchTonAssetsHistory({ address: ADDRESS, network: NETWORK_KEY });
    first[TON_ID][0].amount = 'mutated-by-caller';
    getAccountEvents.mockRejectedValueOnce(new Error('ti unavailable'));

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

    warn.mockRestore();
  });
});
