import EvmBalanceService from '@extension-base/services/balance-service/EvmBalanceService';
import type State from '@extension-base/background/handlers/State';

describe('EvmBalanceService', () => {
  it('skips a network whose EVM provider could not be initialized', async () => {
    const getEvmApi = vi.fn(() => undefined);
    const state = {
      currentAccount: { ethereumAddress: '0x1111111111111111111111111111111111111111' },
      getEvmApi,
      isReady: () => true,
      networkService: {
        networkValues: [
          {
            assets: [],
            ecosystem: 'ethereum',
            name: 'Ethereum',
          },
        ],
      },
    } as unknown as State;

    const service = new EvmBalanceService(state);

    await expect(service.fetchBalance({ networks: ['ethereum'] })).resolves.toEqual([]);
    expect(getEvmApi).toHaveBeenCalledWith('Ethereum');
  });
});
