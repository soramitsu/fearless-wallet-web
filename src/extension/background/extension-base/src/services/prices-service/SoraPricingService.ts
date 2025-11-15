import axios from 'axios';
import { computedSQPricingSora } from './subquery';
import type { BasePriceJson, TokenPrice } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import { isSoraMainnet } from '@/helpers';

interface Edges {
  node: {
    id: string;
    priceUSD: string;
  };
}

interface SubqueryFiatPriceQuery {
  data: {
    data: {
      edges: Edges[];
      pageInfo: {
        hasNextPage?: boolean;
        endCursor?: string;
      };
    };
  };
}

type PageInfoParams = {
  endCursor?: string;
  hasNextPage?: boolean;
};

export class SoraPricingService {
  constructor(private state: State) {}

  async fetchSQSora(pricingUrl: string, pageInfoParams?: PageInfoParams): Promise<Edges[]> {
    if (!pricingUrl) throw new Error('Missing SORA pricing endpoint.');

    if (this.state.pricesService.fiatSymbol !== 'usd') return [];

    try {
      const {
        data: {
          data: {
            data: { edges, pageInfo },
          },
        },
      } = await axios.post<SubqueryFiatPriceQuery>(`${pricingUrl}`, {
        operationName: 'SubqueryFiatPriceQuery',
        query: computedSQPricingSora(pageInfoParams?.endCursor),
      });

      if (pageInfo?.hasNextPage) {
        const subRequest = await this.fetchSQSora(pricingUrl, pageInfo);

        return [...edges, ...subRequest];
      }

      return edges;
    } catch (error) {
      throw new Error(`Failed to fetch SORA pricing data: ${(error as Error).message}`);
    }
  }

  async fetchSoraExplorerPricing(): Promise<BasePriceJson> {
    const soraMainnet = this.state.networkService.networkValues.find(({ name }) => isSoraMainnet(name))!;
    const { externalApi, assets } = soraMainnet;
    const pricingUrl = externalApi?.pricing?.url ?? '';

    const soraPrices = await this.fetchSQSora(pricingUrl);

    const soraAssetsPrice = assets.reduce<TokenPrice>((result, { symbol, priceProvider }) => {
      if (!priceProvider?.id) return result;

      const id = priceProvider.id;

      const soraPrice = soraPrices.find(({ node }) => node.id === id);

      if (!soraPrice?.node?.priceUSD) return result;

      result[symbol] = +soraPrice.node.priceUSD;

      return result;
    }, {});

    return {
      tokenPriceMap: soraAssetsPrice,
      tokenPriceChange: {},
    };
  }
}
