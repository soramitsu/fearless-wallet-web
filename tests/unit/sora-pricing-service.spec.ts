import axios from 'axios';
import { SoraPricingService } from '@extension-base/services/prices-service/SoraPricingService';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const XOR_ASSET_ID = '0x0200000000000000000000000000000000000000000000000000000000000000';
const CONFIGURED_PRICING_URL = 'https://configured-pricing.example/graphql';

type PriceRow = {
  id: string;
  priceChangeDay?: number;
  priceUSD: string;
};

const axiosGet = vi.mocked(axios.get);
const axiosPost = vi.mocked(axios.post);

function configuredPriceResponse(rows: PriceRow[]) {
  const edges = rows.map((node) => ({ node }));

  return {
    status: 200,
    data: {
      data: {
        data: {
          edges,
          pageInfo: { hasNextPage: false },
        },
      },
    },
  };
}

function piPriceResponse(rows: PriceRow[]) {
  return {
    status: 200,
    data: {
      data: {
        assets: { nodes: rows },
      },
    },
  };
}

function soraMetricsResponse(price: unknown, change24h: unknown = 0) {
  return {
    status: 200,
    data: {
      data: [
        {
          assetId: XOR_ASSET_ID,
          change24h,
          price,
          symbol: 'XOR',
        },
      ],
    },
  };
}

function soraMainnet(withPriceProvider = true): NetworkJson {
  return {
    assets: [
      {
        currencyId: XOR_ASSET_ID,
        priceId: 'sora',
        priceProvider: withPriceProvider
          ? {
              id: XOR_ASSET_ID,
              type: 'sorasubquery',
            }
          : undefined,
        symbol: 'xor',
      },
    ],
    externalApi: {
      pricing: {
        type: 'sora',
        url: CONFIGURED_PRICING_URL,
      },
    },
    name: 'SORA Mainnet',
  } as unknown as NetworkJson;
}

function createState({
  fiatSymbol = 'usd',
  cachedFiat = fiatSymbol,
  cachedTokenPriceChange = {},
  cachedTokenPriceMap = {},
  networks = [soraMainnet()],
}: {
  cachedFiat?: string;
  cachedTokenPriceChange?: Record<string, number>;
  cachedTokenPriceMap?: Record<string, number>;
  fiatSymbol?: string;
  networks?: NetworkJson[];
} = {}): State {
  return {
    networkService: {
      networkValues: networks,
    },
    pricesService: {
      fiatSymbol,
      prices: {
        json: {
          fiat: cachedFiat,
          tokenPriceChange: cachedTokenPriceChange,
          tokenPriceMap: cachedTokenPriceMap,
        },
        timestamp: 1,
      },
    },
  } as unknown as State;
}

function mockGraphqlSources(configuredRows: PriceRow[], piRows: PriceRow[] = []) {
  axiosPost.mockImplementation(async (url) => {
    const requestUrl = String(url);

    if (requestUrl === CONFIGURED_PRICING_URL) return configuredPriceResponse(configuredRows) as never;
    if (requestUrl.includes('pi.soramitsu.io')) return piPriceResponse(piRows) as never;

    throw new Error(`Unexpected GraphQL URL: ${requestUrl}`);
  });
}

function piWasCalled(): boolean {
  return axiosPost.mock.calls.some(([url]) => String(url).includes('pi.soramitsu.io'));
}

describe('SoraPricingService XOR source fallback', () => {
  beforeEach(() => {
    axiosGet.mockReset();
    axiosPost.mockReset();
  });

  it('keeps a valid configured-provider price and does not call either fallback', async () => {
    mockGraphqlSources([
      {
        id: XOR_ASSET_ID,
        priceChangeDay: 1.25,
        priceUSD: '4.25',
      },
    ]);

    const result = await new SoraPricingService(createState()).fetchSoraExplorerPricing();

    expect(result.tokenPriceMap).toMatchObject({
      sora: 4.25,
      xor: 4.25,
      XOR: 4.25,
    });
    expect(axiosGet).not.toHaveBeenCalled();
    expect(piWasCalled()).toBe(false);
  });

  it('uses SoraMetrics when the configured provider has no price and publishes every XOR alias', async () => {
    mockGraphqlSources([]);
    axiosGet.mockResolvedValue(soraMetricsResponse(5.75, -6.5) as never);

    const result = await new SoraPricingService(createState()).fetchSoraExplorerPricing();

    expect(result.tokenPriceMap).toMatchObject({
      sora: 5.75,
      xor: 5.75,
      XOR: 5.75,
    });
    expect(result.tokenPriceChange).toMatchObject({
      sora: -6.5,
      xor: -6.5,
      XOR: -6.5,
    });
    expect(axiosGet).toHaveBeenCalledWith(expect.stringContaining('sorametrics.org'), { timeout: 10_000 });
    expect(piWasCalled()).toBe(false);
  });

  it.each([
    {
      label: 'returns an invalid price',
      setupSoraMetrics: () => axiosGet.mockResolvedValue(soraMetricsResponse(0, 99) as never),
    },
    {
      label: 'fails',
      setupSoraMetrics: () => axiosGet.mockRejectedValue(new Error('sorametrics unavailable')),
    },
  ])('uses PI when SoraMetrics $label', async ({ setupSoraMetrics }) => {
    mockGraphqlSources([], [
      {
        id: XOR_ASSET_ID,
        priceChangeDay: 2.75,
        priceUSD: '5.5',
      },
    ]);
    setupSoraMetrics();

    const result = await new SoraPricingService(createState()).fetchSoraExplorerPricing();

    expect(result.tokenPriceMap).toMatchObject({
      sora: 5.5,
      xor: 5.5,
      XOR: 5.5,
    });
    expect(result.tokenPriceChange).toMatchObject({
      sora: 2.75,
      xor: 2.75,
      XOR: 2.75,
    });
    expect(piWasCalled()).toBe(true);
    expect(axiosPost).toHaveBeenCalledWith(
      'https://pi.soramitsu.io/graphql',
      {
        operationName: 'XorUsd',
        query: expect.stringContaining('priceChangeDay'),
        variables: { id: XOR_ASSET_ID },
      },
      { timeout: 10_000 }
    );
  });

  it('retains a positive cached XOR price when every fresh source is invalid', async () => {
    mockGraphqlSources(
      [{ id: XOR_ASSET_ID, priceChangeDay: 40, priceUSD: '0' }],
      [{ id: XOR_ASSET_ID, priceChangeDay: 50, priceUSD: '-2' }]
    );
    axiosGet.mockResolvedValue(soraMetricsResponse(Number.NaN, 60) as never);
    const state = createState({
      cachedTokenPriceChange: { XOR: 1.5 },
      cachedTokenPriceMap: { XOR: 7.25 },
    });

    const result = await new SoraPricingService(state).fetchSoraExplorerPricing();

    expect(result.tokenPriceMap.XOR).toBe(7.25);
    expect(result.tokenPriceChange.XOR).toBe(1.5);
    expect(Object.values(result.tokenPriceMap).every((price) => Number.isFinite(price) && price > 0)).toBe(true);
    expect(axiosGet).toHaveBeenCalled();
    expect(piWasCalled()).toBe(true);
  });

  it('does not reuse a cached non-USD value as an XOR/USD price', async () => {
    mockGraphqlSources([], []);
    axiosGet.mockResolvedValue(soraMetricsResponse(0) as never);
    const state = createState({
      cachedFiat: 'eur',
      cachedTokenPriceMap: { xor: 7.25 },
    });

    const result = await new SoraPricingService(state).fetchSoraExplorerPricing();

    expect(result.tokenPriceMap).toEqual({});
  });

  it('never publishes invalid or nonpositive values when no valid price exists', async () => {
    mockGraphqlSources(
      [{ id: XOR_ASSET_ID, priceChangeDay: 1, priceUSD: 'not-a-number' }],
      [{ id: XOR_ASSET_ID, priceChangeDay: 3, priceUSD: '-1' }]
    );
    axiosGet.mockResolvedValue(soraMetricsResponse(0, 2) as never);

    const result = await new SoraPricingService(createState()).fetchSoraExplorerPricing();

    expect(result.tokenPriceMap.sora).toBeUndefined();
    expect(result.tokenPriceMap.xor).toBeUndefined();
    expect(result.tokenPriceMap.XOR).toBeUndefined();
    expect(Object.values(result.tokenPriceMap).every((price) => Number.isFinite(price) && price > 0)).toBe(true);
    expect(result.tokenPriceChange.sora).toBeUndefined();
    expect(result.tokenPriceChange.xor).toBeUndefined();
    expect(result.tokenPriceChange.XOR).toBeUndefined();
  });

  it('does not call any USD price source for a non-USD fiat selection', async () => {
    const result = await new SoraPricingService(createState({ fiatSymbol: 'eur' })).fetchSoraExplorerPricing();

    expect(result).toEqual({
      tokenPriceChange: {},
      tokenPriceMap: {},
    });
    expect(axiosGet).not.toHaveBeenCalled();
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it('does not throw when the SORA network or an asset priceProvider is missing', async () => {
    axiosGet.mockRejectedValue(new Error('sorametrics unavailable'));
    axiosPost.mockImplementation(async (url) => {
      if (String(url).includes('pi.soramitsu.io')) return piPriceResponse([]) as never;

      return configuredPriceResponse([]) as never;
    });

    await expect(
      new SoraPricingService(createState({ networks: [] })).fetchSoraExplorerPricing()
    ).resolves.toMatchObject({ tokenPriceChange: {}, tokenPriceMap: {} });
    await expect(
      new SoraPricingService(createState({ networks: [soraMainnet(false)] })).fetchSoraExplorerPricing()
    ).resolves.toMatchObject({ tokenPriceChange: {}, tokenPriceMap: {} });
  });
});
