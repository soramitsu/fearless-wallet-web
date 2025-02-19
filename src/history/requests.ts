export const computedSubqueryRequest = (cursor: string | null, pageSize: number, address: string): string =>
  `{
    historyElements(
      after: ${cursor},
      first: ${pageSize},
      orderBy: TIMESTAMP_DESC,
      filter: {
        address: {
          equalTo: "${address}"
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
          id_eq: "${address}"
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
        address_eq: "${address}"
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
        address_eq: "${address}"
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
