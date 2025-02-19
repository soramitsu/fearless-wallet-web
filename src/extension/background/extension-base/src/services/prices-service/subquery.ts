export const computedSQPricingSora = (cursor: string = '', pageSize: number = 100) => `
  query SubqueryFiatPriceQuery(
    $after: Cursor  = "${cursor}"
    $first: Int = ${pageSize})
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
