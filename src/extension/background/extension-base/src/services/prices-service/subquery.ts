export const SORA_PRICING_QUERY = `
  query SubqueryFiatPriceQuery(
    $after: Cursor
    $first: Int!)
    {
      data: assets(
          first: $first
          after: $after
          filter: {priceUSD: {greaterThan: "0" }}
      ) {
          pageInfo {
            ...PageInfoFragment
          }
          edges {
            node {
              id
              priceUSD
            }
          }
        }
      }
      fragment PageInfoFragment on PageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
    }`;
