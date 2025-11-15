(global as unknown as { chrome: unknown }).chrome = {
  runtime: {
    connect: jest.fn(() => ({
      onDisconnect: { addListener: jest.fn() },
      onMessage: { addListener: jest.fn() },
      postMessage: jest.fn(),
    })),
  },
};

jest.mock('ethers', () => ({
  formatEther: jest.fn(),
  formatUnits: jest.fn(),
}));

import type { HistoryFetchRequest, HistoryFetchResult, HistoryFetchResponse } from '@/interfaces/history';
import type { TonEvent } from '@/interfaces';
import { SORA_VAL_ASSET_ID, SORA_XOR_ASSET_ID } from '@/consts/sora';
import { HistoryService } from '@/extension/background/extension-base/src/services/history-service';
import {
  normalizeHistoryServiceType,
  pickTonAssetHistory,
} from '@/extension/background/extension-base/src/services/history-service/utils';

describe('HistoryService helpers', () => {
  it('normalizes staking-prefixed service types', () => {
    expect(normalizeHistoryServiceType('subsquid')).toBe('subsquid');
    expect(normalizeHistoryServiceType('stakingSubsquid')).toBe('subsquid');
    expect(normalizeHistoryServiceType('stakingCustom')).toBeNull();
  });

  it('filters TON history entries per asset id', () => {
    const tonEvents: Record<string, TonEvent[]> = {
      XOR: [
        {
          method: 'transfer',
          networkFee: '0',
          symbol: 'XOR',
          isOutEvent: true,
          success: true,
        },
      ],
      DOT: [
        {
          method: 'transfer',
          networkFee: '0',
          symbol: 'DOT',
          isOutEvent: false,
          success: true,
        },
      ],
    };

    expect(pickTonAssetHistory(tonEvents, 'DOT')).toEqual(tonEvents.DOT);
    expect(pickTonAssetHistory(tonEvents, 'xor')).toEqual(tonEvents.XOR);
    expect(pickTonAssetHistory(tonEvents, 'FOO')).toEqual([]);
  });
});

const createHistoryService = () => {
  const state = {
    networkService: {
      getNetworkJson: jest.fn(() => ({
        assets: [
          { currencyId: 'XOR', id: SORA_XOR_ASSET_ID, symbol: 'XOR' },
          { currencyId: 'VAL', id: SORA_VAL_ASSET_ID, symbol: 'VAL' },
        ],
      })),
    },
  } as unknown as ConstructorParameters<typeof HistoryService>[0];

  return new HistoryService(state);
};

const invokeNormalize = (
  service: HistoryService,
  request: HistoryFetchRequest,
  result: HistoryFetchResult
): HistoryFetchResponse => {
  const normalizer = service as unknown as {
    normalizeHistoryResponse: (request: HistoryFetchRequest, result: HistoryFetchResult) => HistoryFetchResponse;
  };

  return normalizer.normalizeHistoryResponse(request, result);
};

describe('HistoryService normalizeHistoryResponse', () => {
  it('formats giantsquid payloads into subquery histories', () => {
    const service = createHistoryService();
    const request: HistoryFetchRequest = {
      network: 'Polkadot',
      endpoint: { type: 'giantsquid', url: 'https://giantsquid' },
      address: { raw: 'addr', formatted: 'addr' },
      asset: { id: 'dot', isUtility: true },
    };

    const result: HistoryFetchResult = {
      serviceType: 'giantsquid',
      history: [
        {
          id: '1',
          direction: 'To',
          transfer: {
            id: 'transfer-1',
            amount: '10',
            blockNumber: 1,
            extrinsicHash: '0x123',
            timestamp: '2024-01-01T00:00:00Z',
            success: true,
            from: { id: 'from' },
            to: { id: 'to' },
          },
        },
      ],
    };

    const [formatted] = invokeNormalize(service, request, result);

    expect(formatted.assetId).toBe('dot');
    expect(formatted.serviceType).toBe('giantsquid');
    expect(formatted.history.nodes).toEqual([
      {
        id: '1',
        timestamp: (new Date('2024-01-01T00:00:00Z').getTime() / 1000).toString(),
        address: '',
        success: true,
        transfer: { amount: '10', from: 'from', to: 'to', fee: '0' },
      },
    ]);
  });

  it('splits SORA payload into asset-specific histories', () => {
    const service = createHistoryService();
    const request: HistoryFetchRequest = {
      network: 'Sora',
      endpoint: { type: 'sora', url: 'https://sora-history' },
      address: { raw: 'addr', formatted: 'addr' },
      asset: { id: SORA_XOR_ASSET_ID, isUtility: true },
    };

    const result: HistoryFetchResult = {
      serviceType: 'sora',
      history: [
        {
          id: 'xor-history',
          timestamp: '1',
          blockHash: '0x01',
          blockHeight: '10',
          networkFee: '1',
          module: 'liquidityProxy',
          method: 'swap',
          data: { baseAssetId: 'XOR', targetAssetAmount: '5' },
          execution: { success: true },
          success: true,
          address: 'addr',
        },
        {
          id: 'rewarded-history',
          timestamp: '2',
          blockHash: '0x02',
          blockHeight: '11',
          networkFee: '0',
          module: 'staking',
          method: 'rewarded',
          data: { baseAssetId: 'VAL', value: '3' },
          execution: { success: true },
          success: true,
          address: 'addr',
        },
      ],
    };

    const formatted = invokeNormalize(service, request, result);

    const xorEntry = formatted.find(({ assetId }) => assetId === SORA_XOR_ASSET_ID);
    const valEntry = formatted.find(({ assetId }) => assetId === SORA_VAL_ASSET_ID);

    expect(xorEntry?.history.nodes).toHaveLength(1);
    expect(xorEntry?.history.nodes?.[0].success).toBe(true);
    expect(xorEntry?.assetId).toBe(SORA_XOR_ASSET_ID);
    expect(valEntry?.assetId).toBe(SORA_VAL_ASSET_ID);
    expect(valEntry?.history.nodes).toHaveLength(1);
    expect(valEntry?.history.nodes?.[0].success).toBe(true);
  });

  it('returns TON history as SubqueryHistory nodes', () => {
    const service = createHistoryService();
    const request: HistoryFetchRequest = {
      network: 'TON',
      endpoint: { type: 'ton', url: 'https://ton' },
      address: { raw: 'ton-addr', formatted: 'ton-addr' },
      asset: { id: 'TON', isUtility: true },
    };

    const result: HistoryFetchResult = {
      serviceType: 'ton',
      history: [
        {
          method: 'transfer',
          networkFee: '1',
          symbol: 'ton',
          isOutEvent: true,
          success: true,
        },
      ],
    };

    const [formatted] = invokeNormalize(service, request, result);

    expect(formatted.assetId).toBe('TON');
    expect(formatted.serviceType).toBe('ton');
    expect(formatted.history.nodes).toHaveLength(1);
    expect(formatted.history.nodes?.[0].success).toBe(true);
  });
});
