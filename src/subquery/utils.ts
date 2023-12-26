export const computedSubqueryRequest = (cursor: string | null, pageSize: number, address: string): string => `{
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
    orderBy: id_DESC
    where: {
      address_eq: "${address}"
    }
  ) {
    timestamp
    id
    extrinsicIdx
    extrinsicHash
    blockNumber
    address
    transfer {
      amount
      eventIdx
      fee
      from
      success
      to
    }
    reward {
      amount
      era
      eventIdx
      isReward
      stash
      validator
    }
    extrinsic {
      call
      fee
      hash
      module
      success
    }
  }
}`;
