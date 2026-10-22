import axios from 'axios';
import { computedSQPricingSora } from './subquery';
import type { BasePriceJson } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import { isSoraMainnet } from '@/helpers';

interface Edges {
  node: {
    id: string;
    priceUSD: string;
  };
}

interface XorPrice {
  change24h?: number;
  price: number;
}

interface SoraMetricsToken {
  assetId?: string;
  change24h?: number | string;
  price?: number | string;
  symbol?: string;
}

interface SoraMetricsTokensResponse {
  data?: SoraMetricsToken[];
  tokens?: SoraMetricsToken[];
}

interface PiXorPriceQuery {
  data?: {
    assets?: {
      nodes?: Array<{
        id?: string;
        priceChangeDay?: number | string;
        priceUSD?: number | string;
      }>;
    };
  };
}

interface SubqueryFiatPriceQuery {
  data: {
    data: {
      edges: Edges[];
      pageInfo: {
        hasNextPage?: boolean;
      };
    };
  };
}

type PageInfoParams = SubqueryFiatPriceQuery['data']['data']['pageInfo'] & {
  endCursor?: string;
};

const XOR_ASSET_ID = '0x0200000000000000000000000000000000000000000000000000000000000000';
// Substrate registry balances use `sora`, SORA assets use `xor`, and Iroha-discovered balances use `XOR`.
const XOR_PRICE_KEYS = ['sora', 'xor', 'XOR'] as const;
// `sora` is also a CoinGecko ID, so only reuse cache keys written by the SORA/Iroha pricing path.
const XOR_CACHE_KEYS = ['xor', 'XOR'] as const;
const SORA_METRICS_XOR_URL = 'https://sorametrics.org/tokens?symbols=XOR&limit=1&sparkline=false';
const PI_PRICING_URL = 'https://pi.soramitsu.io/graphql';
const PRICE_REQUEST_TIMEOUT_MS = 10_000;

const PI_XOR_PRICE_QUERY = `
  query XorUsd($id: String!) {
    assets(first: 1, filter: { id: { equalTo: $id } }) {
      nodes {
        id
        priceUSD
        priceChangeDay
      }
    }
  }
`;

function positiveNumber(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;

  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;

  return Number.isFinite(number) ? number : undefined;
}

export class SoraPricingService {
  constructor(private state: State) {}

  async fetchSQSora(pricingUrl: string, pageInfoParams?: PageInfoParams): Promise<Edges[]> {
    if (this.state.pricesService.fiatSymbol !== 'usd') return [];

    try {
      const {
        data: {
          data: {
            data: { edges, pageInfo },
          },
        },
      } = await axios.post<SubqueryFiatPriceQuery>(
        `${pricingUrl}`,
        {
          operationName: 'SubqueryFiatPriceQuery',
          query: computedSQPricingSora(pageInfoParams?.endCursor),
        },
        { timeout: PRICE_REQUEST_TIMEOUT_MS }
      );

      if (pageInfo?.hasNextPage) {
        const subRequest = await this.fetchSQSora(pricingUrl, pageInfo);

        return [...edges, ...subRequest];
      }

      return edges;
    } catch {
      return [];
    }
  }

  private async fetchSoraMetricsXorPrice(): Promise<XorPrice | undefined> {
    try {
      const { data } = await axios.get<SoraMetricsTokensResponse | SoraMetricsToken[]>(SORA_METRICS_XOR_URL, {
        timeout: PRICE_REQUEST_TIMEOUT_MS,
      });
      const tokens = Array.isArray(data) ? data : (data.data ?? data.tokens ?? []);
      const xor = tokens.find(
        ({ assetId, symbol }) => assetId?.toLowerCase() === XOR_ASSET_ID || symbol?.toUpperCase() === 'XOR'
      );
      const price = positiveNumber(xor?.price);

      if (price === undefined) return undefined;

      return {
        change24h: finiteNumber(xor?.change24h),
        price,
      };
    } catch {
      return undefined;
    }
  }

  private async fetchPiXorPrice(): Promise<XorPrice | undefined> {
    try {
      const { data } = await axios.post<PiXorPriceQuery>(
        PI_PRICING_URL,
        {
          operationName: 'XorUsd',
          query: PI_XOR_PRICE_QUERY,
          variables: { id: XOR_ASSET_ID },
        },
        { timeout: PRICE_REQUEST_TIMEOUT_MS }
      );
      const xor = data.data?.assets?.nodes?.find(({ id }) => id?.toLowerCase() === XOR_ASSET_ID);
      const price = positiveNumber(xor?.priceUSD);

      if (price === undefined) return undefined;

      return {
        change24h: finiteNumber(xor?.priceChangeDay),
        price,
      };
    } catch {
      return undefined;
    }
  }

  private getCachedXorPrice(): XorPrice | undefined {
    const cached = this.state.pricesService.prices.json;

    if (cached.fiat?.toLowerCase() !== 'usd') return undefined;

    for (const key of XOR_CACHE_KEYS) {
      const price = positiveNumber(cached.tokenPriceMap[key]);

      if (price !== undefined) {
        return {
          change24h: finiteNumber(cached.tokenPriceChange[key]),
          price,
        };
      }
    }

    return undefined;
  }

  private setXorPrice(result: BasePriceJson, xor: XorPrice) {
    for (const key of XOR_PRICE_KEYS) {
      result.tokenPriceMap[key] = xor.price;

      if (xor.change24h !== undefined) result.tokenPriceChange[key] = xor.change24h;
    }
  }

  async fetchSoraExplorerPricing(): Promise<BasePriceJson> {
    const result: BasePriceJson = {
      tokenPriceMap: {},
      tokenPriceChange: {},
    };

    if (this.state.pricesService.fiatSymbol !== 'usd') return result;

    const soraMainnet = this.state.networkService.networkValues.find(({ name }) => isSoraMainnet(name));
    const assets = soraMainnet?.assets ?? [];
    const pricingUrl = soraMainnet?.externalApi?.pricing?.url;
    const soraPrices = pricingUrl ? await this.fetchSQSora(pricingUrl) : [];

    for (const { priceProvider, symbol } of assets) {
      if (!priceProvider?.id) continue;

      const soraPrice = soraPrices.find(({ node }) => node.id === priceProvider.id);
      const price = positiveNumber(soraPrice?.node?.priceUSD);

      if (price === undefined) continue;

      result.tokenPriceMap[symbol] = price;
    }

    const xorAsset = assets.find(
      ({ priceProvider, symbol }) => priceProvider?.id.toLowerCase() === XOR_ASSET_ID || symbol.toUpperCase() === 'XOR'
    );
    const configuredXorPrice = xorAsset ? positiveNumber(result.tokenPriceMap[xorAsset.symbol]) : undefined;
    let xor = configuredXorPrice === undefined ? undefined : { price: configuredXorPrice };

    // Both fallbacks return USD per current chain-display unit (labelled "1M XOR" by SoraMetrics); do not rescale it.
    xor ??= await this.fetchSoraMetricsXorPrice();
    xor ??= await this.fetchPiXorPrice();
    xor ??= this.getCachedXorPrice();

    if (xor) this.setXorPrice(result, xor);

    return result;
  }
}
