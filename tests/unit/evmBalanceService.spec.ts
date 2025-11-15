import { NETWORK_STATUS } from '@extension-base/api/types/networks';
jest.mock('ethers', () => ({
  ethers: {},
}));
import type State from '@/extension/background/extension-base/src/background/handlers/State';
import EvmBalanceService from '@/extension/background/extension-base/src/services/balance-service/EvmBalanceService';
import BalanceLookupRegistry from '@/extension/background/extension-base/src/services/balance-service/BalanceLookupRegistry';
import { WalletEcosystem } from '@/interfaces';

const mockNetwork = {
  name: 'Ethereum',
  networkStatus: NETWORK_STATUS.CONNECTED,
  assets: [
    {
      id: 'eth',
      symbol: 'ETH',
      precision: 18,
      isUtility: true,
    },
  ],
};

const createService = () => {
  const registry = new BalanceLookupRegistry();
  const state = {
    isReady: () => true,
    currentAccount: { ethereumAddress: '0xabc' },
    balanceService: {
      lookupRegistry: registry,
      setBalanceItem: jest.fn(),
    },
    getEvmApi: jest.fn(() => ({ api: {} })),
    networkService: {
      activeNetworkByEcosystem: {
        evm: [mockNetwork],
        evmList: ['ethereum'],
        substrate: [],
        substrateList: [],
        ton: [],
        tonList: [],
      },
      networkMap: {
        Ethereum: {
          ...mockNetwork,
          assets: [
            {
              id: 'eth',
              symbol: 'ETH',
              precision: 18,
              isUtility: true,
            },
          ],
        },
      },
      evmApiHandler: { refreshEvmApi: jest.fn() },
    },
    keyringService: {
      getSubstrateAddress: jest.fn(() => 'substrate-address'),
    },
    evmContractService: {
      getContract: jest.fn(),
    },
  } as unknown as State;

  const service = new EvmBalanceService(state);

  return {
    service,
    registry,
  };
};

describe('EvmBalanceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throttles repeated balance fetches', async () => {
    const { service, registry } = createService();
    const fetchSpy = jest.spyOn(service, 'fetchEvmAssetBalance').mockResolvedValue('1.23');

    const networks = ['ethereum'];
    const address = '0xabc';

    const firstResult = await service.fetchBalance({ networks, ethereumAddress: address });

    expect(firstResult).toEqual([{ balance: '1.23', assetId: 'eth', network: 'Ethereum' }]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    expect(
      registry.shouldThrottleFetch({
        ecosystem: WalletEcosystem.Evm,
        network: 'Ethereum',
        address,
        ttl: 30_000,
      })
    ).toBe(true);

    const secondResult = await service.fetchBalance({ networks, ethereumAddress: address });

    expect(secondResult).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('respects the force flag when throttled', async () => {
    const { service } = createService();
    const fetchSpy = jest.spyOn(service, 'fetchEvmAssetBalance').mockResolvedValue('4.56');
    const networks = ['ethereum'];
    const address = '0xabc';

    await service.fetchBalance({ networks, ethereumAddress: address });
    await service.fetchBalance({ networks, ethereumAddress: address, force: true });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('matches networks case-insensitively', async () => {
    const { service } = createService();
    const fetchSpy = jest.spyOn(service, 'fetchEvmAssetBalance').mockResolvedValue('7.89');

    const result = await service.fetchBalance({ networks: ['ETHEREUM'], ethereumAddress: '0xabc' });

    expect(result).toEqual([{ balance: '7.89', assetId: 'eth', network: 'Ethereum' }]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
