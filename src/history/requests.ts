function graphqlString(value: string): string {
  if (typeof value !== 'string' || value.length > 1024) throw new Error('invalid_history_query_value');
  return JSON.stringify(value);
}

function historyPageSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) throw new Error('invalid_history_page_size');
  return value;
}

export const computedSubqueryRequest = (cursor: string | null, pageSize: number, address: string): string =>
  `{
    historyElements(
      after: ${cursor === null ? 'null' : graphqlString(cursor)},
      first: ${historyPageSize(pageSize)},
      orderBy: TIMESTAMP_DESC,
      filter: {
        address: {
          equalTo: ${graphqlString(address)}
        }
      }
    ) {
      pageInfo {
        startCursor
        endCursor
      },
      nodes {
        id
        timestamp
        address
        reward
        extrinsic
        transfer
      }
    }
  }`;

export const computedGiantSquidRequest = (address: string): string =>
  `{
    transfers(
      orderBy: id_DESC
      where: {
        account: {
          id_eq: ${graphqlString(address)}
        }
      }
    ) {
      id
      direction
      transfer {
        id
        amount
        blockNumber
        extrinsicHash
        timestamp
        success
        from {
          id
        }
        to {
          id
        }
      }
    }
  }`;

export const computedSubsquidRequest = (address: string): string =>
  `{
    historyElements(
      orderBy: timestamp_DESC
      where: {
        address_eq: ${graphqlString(address)}
      }
    ) {
      timestamp
      type
      success
      name
      module
      method
      id
      extrinsicIdx
      extrinsicHash
      entityType
      blockHeight
      blockHash
      address
      transfer {
        amount
        fee
        from
        to
      }
      reward {
        amount
        era
        stash
        validator
      }
    }
  }`;

export const computedSoraRequest = (address: string) =>
  `{
    historyElements(
      orderBy: timestamp_DESC
      where: {
        address_eq: ${graphqlString(address)}
      }
    ) {
      timestamp
      id
      address
      blockHash
      blockHeight
      updatedAtBlock
      networkFee
      module
      method
      dataTo
      dataFrom
      data
      execution {
        success
      }
    }
  }`;
