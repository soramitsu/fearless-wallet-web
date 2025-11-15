jest.mock('@extension-base/stores/Storage', () => ({
  storage: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

(global as unknown as { chrome: unknown }).chrome = {
  runtime: {
    connect: jest.fn(() => ({
      onDisconnect: { addListener: jest.fn() },
      onMessage: { addListener: jest.fn() },
    })),
  },
};
jest.mock('ethers', () => ({}));
jest.mock('@extension-base/services/balance-service/SubstrateBalanceService', () =>
  jest.fn().mockImplementation(() => ({}))
);
jest.mock('@extension-base/services/balance-service/EvmBalanceService', () => jest.fn().mockImplementation(() => ({})));
jest.mock('@extension-base/services/ton-balance/TonBalance', () => ({
  TonBalance: jest.fn().mockImplementation(() => ({})),
}));

import type { BalanceItem } from '@/extension/background/extension-base/src/api/evm/types';
import BalanceService from '@/extension/background/extension-base/src/services/balance-service/index';
import type State from '@/extension/background/extension-base/src/background/handlers/State';
import { APIItemState } from '@/extension/background/extension-base/src/api/types/networks';
import { storage } from '@extension-base/stores/Storage';
import type { RelayChainName } from '@/interfaces';

const storageGet = storage.get as jest.MockedFunction<typeof storage.get>;
const storageSet = storage.set as jest.MockedFunction<typeof storage.set>;
const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('BalanceService storage scheduling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storageGet.mockResolvedValue({ balances: {} } as never);
    storageSet.mockResolvedValue();
  });

  const createService = () => {
    const callbacks: Record<string, () => void> = {};
    const lazyNext = jest.fn((key: string, cb: () => void) => {
      callbacks[key] = cb;
    });

    const state = {
      timeoutService: { lazyNext },
      keyringService: {
        getAllMainAccounts: () => [{ address: 'addr-1' }],
        getSubstrateAddress: (addr: string) => addr,
      },
      networkService: {
        networkMap: {},
        networksGithub: [],
      },
      pricesService: {
        getPrice: jest.fn(),
      },
    } as unknown as State;

    const service = new BalanceService(state);
    service.balanceMap['addr-1'] = [
      {
        groupId: 'asset-1',
        symbol: 'TON',
        relayChain: 'ton' as RelayChainName,
        mainNetwork: 'TON',
        tokenName: 'TON',
        icon: 'ton.svg',
        providers: [],
        priceId: 'TON',
        balances: [
          {
            id: 'asset-1',
            symbol: 'TON',
            networkName: 'TON',
            state: APIItemState.READY,
            type: 'utility' as BalanceItem['type'],
            icon: 'ton.svg',
            precision: 9,
            mainNetwork: 'TON',
            chain: 'TON',
          } as BalanceItem,
        ],
      },
    ];

    jest.spyOn(service, 'publishBalance').mockResolvedValue();

    return { service, callbacks, lazyNext };
  };

  it('batches storage updates and flushes on the next tick', async () => {
    const { service, callbacks, lazyNext } = createService();
    const updatedBalance = {
      id: 'asset-1',
      symbol: 'TON',
      networkName: 'TON',
      state: APIItemState.READY,
      type: 'utility' as BalanceItem['type'],
      icon: 'ton.svg',
      precision: 9,
      mainNetwork: 'TON',
      total: '10',
      transferable: '10',
      chain: 'TON',
    } as BalanceItem;

    service['queueStorageUpdate']('addr-1', updatedBalance, 'TON');
    service['queueStorageUpdate']('addr-1', { ...updatedBalance, symbol: 'STON', id: 'asset-2' }, 'TON');
    service['scheduleBalanceSync']();

    expect(lazyNext).toHaveBeenCalledWith('balance:sync', expect.any(Function), 500);

    await callbacks['balance:sync']();
    await flushAsync();

    expect(storageGet).toHaveBeenCalledTimes(1);
    expect(storageSet).toHaveBeenCalledWith({
      balances: {
        'addr-1': {
          TON: {
            TON: expect.objectContaining({ symbol: 'TON', chain: 'TON' }),
          },
          STON: {
            TON: expect.objectContaining({ symbol: 'STON', chain: 'TON' }),
          },
        },
      },
    });
    expect(service['pendingStorageUpdates']).toEqual({});
  });

  it('requeues updates when persistence fails', async () => {
    const { service, callbacks, lazyNext } = createService();
    const updatedBalance = {
      id: 'asset-1',
      symbol: 'TON',
      networkName: 'TON',
      state: APIItemState.READY,
      type: 'utility' as BalanceItem['type'],
      icon: 'ton.svg',
      precision: 9,
      mainNetwork: 'TON',
    } as BalanceItem;

    service['queueStorageUpdate']('addr-1', updatedBalance, 'TON');
    service['scheduleBalanceSync']();

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = new Error('storage offline');
    storageSet.mockRejectedValueOnce(error);

    await callbacks['balance:sync']();
    await flushAsync();

    expect(warnSpy).toHaveBeenCalledWith('[BalanceService] Failed to sync balances', error);
    expect(service['pendingStorageUpdates']).not.toEqual({});
    expect(lazyNext).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });
});
