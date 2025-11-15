import axios from 'axios';
import { SoraPricingService } from '@/extension/background/extension-base/src/services/prices-service/SoraPricingService';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SoraPricingService', () => {
  const buildState = () => ({
    pricesService: { fiatSymbol: 'usd' },
    networkService: {
      networkValues: [
        {
          name: 'Sora Mainnet',
          externalApi: { pricing: { url: 'https://sora-pricing' } },
          assets: [
            { symbol: 'XOR', priceProvider: { id: 'xor-price' } },
            { symbol: 'VAL', priceProvider: { id: 'val-price' } },
            { symbol: 'PSWAP', priceProvider: undefined },
          ],
        },
      ],
    },
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('throws when the pricing endpoint rejects', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('network down'));

    const service = new SoraPricingService(buildState() as unknown as any);

    await expect(service.fetchSoraExplorerPricing()).rejects.toThrow('Failed to fetch SORA pricing data: network down');
  });

  it('returns prices only for assets with available data', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        data: {
          data: {
            edges: [{ node: { id: 'xor-price', priceUSD: '3.14' } }, { node: { id: 'val-price', priceUSD: '' } }],
            pageInfo: { hasNextPage: false },
          },
        },
      },
    } as unknown as never);

    const service = new SoraPricingService(buildState() as unknown as any);

    const result = await service.fetchSoraExplorerPricing();

    expect(result.tokenPriceMap).toEqual({ XOR: 3.14 });
  });
});
