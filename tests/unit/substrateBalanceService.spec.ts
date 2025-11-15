jest.mock('@extension-base/api/substrate', () => ({
  getAssetOptions: jest.fn(),
}));

jest.mock('@extension-base/services/utils/sora', () => ({
  getSoraUtil: jest.fn(() => Promise.resolve({ FPNumber: { fromCodecValue: jest.fn() } })),
  getSoraUtilOrThrow: jest.fn(() => ({ FPNumber: { fromCodecValue: jest.fn() } })),
}));

jest.mock('@/util/balances', () => ({
  formatBalance: jest.fn(() => ({
    frozen: '0',
    reserved: '0',
    locked: '0',
    total: '0',
    transferable: '123',
  })),
}));

import type State from '@/extension/background/extension-base/src/background/handlers/State';
import SubstrateBalanceService from '@/extension/background/extension-base/src/services/balance-service/SubstrateBalanceService';
import BalanceLookupRegistry from '@/extension/background/extension-base/src/services/balance-service/BalanceLookupRegistry';

const createService = () => {
  const registry = new BalanceLookupRegistry();
  const accountQuery = jest.fn(() => Promise.resolve({ data: {} }));

  const state = {
    balanceService: {
      lookupRegistry: registry,
      setBalanceItem: jest.fn(),
    },
    getSubstrateApiMap: {
      polkadot: {
        api: {
          query: {
            system: {
              account: accountQuery,
            },
          },
        },
      },
    },
    networkService: {
      networksGithub: [
        {
          name: 'Polkadot',
          parentId: 'polkadot',
          assets: [
            {
              precision: 10,
              symbol: 'DOT',
              id: 'dot',
              type: 'normal',
            },
          ],
        },
      ],
      assetsMap: {},
      networkMap: {},
    },
    keyringService: {
      getSubstrateAddress: jest.fn((value: string) => value),
    },
  } as unknown as State;

  const service = new SubstrateBalanceService(state);

  return {
    service,
    accountQuery,
  };
};

describe('SubstrateBalanceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throttles repeated balance fetches unless forced', async () => {
    const { service, accountQuery } = createService();

    const firstResult = await service.fetchBalance({
      address: 'addr-1',
      ethereumAddress: '0xabc',
      networks: ['Polkadot'],
    });

    expect(firstResult).toEqual([{ balance: '123', network: 'Polkadot', assetId: 'dot' }]);
    expect(accountQuery).toHaveBeenCalledTimes(1);

    const throttled = await service.fetchBalance({
      address: 'addr-1',
      ethereumAddress: '0xabc',
      networks: ['Polkadot'],
    });

    expect(throttled).toEqual([]);
    expect(accountQuery).toHaveBeenCalledTimes(1);

    await service.fetchBalance({
      address: 'addr-1',
      ethereumAddress: '0xabc',
      networks: ['Polkadot'],
      force: true,
    });

    expect(accountQuery).toHaveBeenCalledTimes(2);
  });
});
