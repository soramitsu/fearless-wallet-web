import type { Address } from '@ton/core';
import { APIItemState } from '@/extension/background/extension-base/src/api/types/networks';
import { TonBalance } from '@/extension/background/extension-base/src/services/ton-balance/TonBalance';
import type State from '@/extension/background/extension-base/src/background/handlers/State';
import type { SoraUtilModule } from '@/extension/background/extension-base/src/services/utils/sora';

jest.mock('@/extension/background/extension-base/src/services/utils/sora', () => ({
  getSoraUtil: jest.fn(),
  getSoraUtilOrThrow: jest.fn(),
}));

jest.mock('@/utils/perpsExoticTelemetry', () => ({
  telemetry: {
    record: jest.fn(),
  },
}));

import { getSoraUtil, getSoraUtilOrThrow } from '@/extension/background/extension-base/src/services/utils/sora';
import { telemetry } from '@/utils/perpsExoticTelemetry';

const mockedGetSoraUtil = getSoraUtil as jest.MockedFunction<typeof getSoraUtil>;
const mockedGetSoraUtilOrThrow = getSoraUtilOrThrow as unknown as jest.MockedFunction<typeof getSoraUtilOrThrow>;
const mockedTelemetryRecord = telemetry.record as jest.MockedFunction<typeof telemetry.record>;

describe('TonBalance', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    mockedGetSoraUtil.mockResolvedValue({} as unknown as SoraUtilModule);
    mockedGetSoraUtilOrThrow.mockReturnValue({
      FPNumber: {
        fromCodecValue: jest.fn(() => ({
          toString: () => '0',
        })),
      },
    } as never);

    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('publishes utility and jetton balances via balance service', async () => {
    const address = 'ton-address';
    const setBalanceItem = jest.fn();
    const tonBalance = new TonBalance({
      networkService: {
        networksGithub: [
          {
            name: 'TON',
            icon: 'ton.svg',
            assets: [{ precision: 9, symbol: 'TON', id: 'ton-asset' }],
          },
        ],
      },
      balanceService: {
        setBalanceItem,
      },
    } as unknown as State);

    const fetchUtilitySpy = jest.spyOn(tonBalance, 'fetchUtilityAsset').mockResolvedValue('123.456');
    const jettonWalletAddress = {
      toString: () => 'wallet-1',
    } as unknown as Address;

    const fetchJettonsSpy = jest.spyOn(tonBalance, 'fetchJettonsAsset').mockResolvedValue([
      {
        balance: '5.0',
        image: 'jetton.png',
        name: 'STON',
        precision: 9,
        symbol: 'ston',
        assetId: 'ston-id',
        walletAddress: jettonWalletAddress,
      },
    ]);

    const result = await tonBalance.fetchBalance(address, ['TON']);

    expect(fetchUtilitySpy).toHaveBeenCalledWith(address, 'TON', 9);
    expect(fetchJettonsSpy).toHaveBeenCalledWith(address, 'TON');

    expect(setBalanceItem).toHaveBeenNthCalledWith(
      1,
      'TON',
      expect.objectContaining({
        id: 'ton-asset',
        networkName: 'TON',
        precision: 9,
        relayChain: 'ton',
        state: APIItemState.READY,
        symbol: 'TON',
        total: '123.456',
        transferable: '123.456',
      }),
      address
    );

    expect(setBalanceItem).toHaveBeenNthCalledWith(
      2,
      'TON',
      expect.objectContaining({
        assetIcon: 'jetton.png',
        id: 'ston-id',
        networkName: 'TON',
        state: APIItemState.READY,
        symbol: 'ston',
        tokenName: 'STON',
        total: '5.0',
        transferable: '5.0',
        walletAddress: jettonWalletAddress,
      }),
      address
    );

    expect(result).toEqual([
      { assetId: 'ton-asset', balance: '123.456', network: 'TON' },
      { assetId: 'ston-id', balance: '5.0', network: 'TON' },
    ]);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('returns zero balance when utility asset lookup fails', async () => {
    const address = 'ton-address';
    const getAccount = jest.fn().mockRejectedValue(new Error('api down'));
    const fpFromCodecValue = jest.fn(() => ({
      toString: () => '999',
    }));

    mockedGetSoraUtilOrThrow.mockReturnValue({
      FPNumber: {
        fromCodecValue: fpFromCodecValue,
      },
    } as never);

    const tonBalance = new TonBalance({
      getTonApiMap: {
        TON: {
          api: {
            accounts: {
              getAccount,
            },
          },
        },
      },
      keyringService: {
        tonKeyring: {
          accountSubject: {
            value: {
              [address]: { walletContract: { address: 'wallet-addr' } },
            },
          },
        },
      },
    } as unknown as State);

    const result = await tonBalance.fetchUtilityAsset(address, 'TON', 9);

    expect(mockedGetSoraUtil).toHaveBeenCalled();
    expect(getAccount).toHaveBeenCalledWith('wallet-addr');
    expect(result).toBe('0');
    expect(fpFromCodecValue).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith('[TON][fetchUtilityAsset] Error', expect.any(Error));
  });

  it('swallows jetton errors and keeps price cache untouched', async () => {
    const address = 'ton-address';
    const getAccountJettonsBalances = jest.fn().mockRejectedValue(new Error('ton indexer offline'));
    const setPriceValue = jest.fn();

    const tonBalance = new TonBalance({
      getTonApiMap: {
        TON: {
          api: {
            accounts: {
              getAccountJettonsBalances,
            },
          },
        },
      },
      keyringService: {
        tonKeyring: {
          accountSubject: {
            value: {
              [address]: { walletContract: { address: 'wallet-addr' } },
            },
          },
        },
      },
      pricesService: {
        fiatSymbol: 'usd',
        setPriceValue,
        tonPricingService: {
          tonParseRates: jest.fn(),
        },
      },
    } as unknown as State);

    const result = await tonBalance.fetchJettonsAsset(address, 'TON');

    expect(mockedGetSoraUtil).toHaveBeenCalled();
    expect(getAccountJettonsBalances).toHaveBeenCalledWith('wallet-addr', {
      currencies: ['usd'],
    });
    expect(result).toEqual([]);
    expect(setPriceValue).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith('[TON][fetchJettonsAsset] Error', expect.any(Error));
  });

  it('records telemetry when Sora loader fails to bootstrap', async () => {
    mockedGetSoraUtil.mockRejectedValue(new Error('sora import failed'));

    const tonBalance = new TonBalance({} as unknown as State);

    const result = await tonBalance.fetchUtilityAsset('addr', 'TON', 9);

    expect(result).toBe('0');
    expect(mockedTelemetryRecord).toHaveBeenCalledWith('ton.balance.sora_loader.error', {
      context: 'utility',
      message: 'sora import failed',
    });
  });
});
