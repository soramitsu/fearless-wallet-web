import axios from 'axios';
import type {
  SubqueryHistory,
  GiantsquidHistoryItem,
  HistoryElement,
  HistoryServiceType,
  NetworkName,
  EthereumHistoryResponse,
} from '@/interfaces';
import BaseApi from '@/util/BaseApi';

async function fetchSubqueryHistory(
  url: string,
  address: string,
  pageSize = 100,
  cursor: string | null = null
): Promise<SubqueryHistory> {
  const {
    data: { data },
  } = await axios.post(url, {
    query: `{
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
    }`,
  });

  return data?.historyElements;
}

async function fetchGiantsquidHistory(url: string, address: string): Promise<GiantsquidHistoryItem[]> {
  const {
    data: { data },
  } = await axios.post(url, {
    query: `{
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
    }`,
  });

  return data?.transfers;
}

async function fetchSubsquidHistory(url: string, address: string): Promise<HistoryElement[]> {
  const {
    data: { data },
  } = await axios.post(url, {
    query: `{
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
    }`,
  });

  return data?.historyElements;
}

async function fetchEthereumHistory(url: string, address: string, precision?: number): Promise<HistoryElement[]> {
  const abort = new AbortController();
  const signal = abort.signal;
  const res = await axios.get<EthereumHistoryResponse>(url, {
    params: {
      module: 'account',
      action: 'txlist',
      address,
      page: 1,
      offset: 50,
      sort: 'asc',
      apikey: process.env.ETHERSCAN_API_KEY,
    },
    signal,
  });

  if (res.status !== 200) {
    abort.abort();

    return [];
  }

  return res.data.result.map(({ timeStamp, value, gasUsed, from, isError, to }, index) => ({
    address,
    id: String(index),
    timestamp: timeStamp,
    transfer: {
      amount: value,
      eventIdx: 0,
      fee: gasUsed,
      from: from,
      success: isError === '0',
      to,
    },
  }));
}

async function fetchHistory(
  url: string,
  address: string,
  type: HistoryServiceType,
  networkName: NetworkName,
  precision?: number
) {
  try {
    if (type === 'ethereum') return fetchEthereumHistory(url, address, precision);

    if (type === 'subquery') return fetchSubqueryHistory(url, address);
    else if (type === 'subsquid') return fetchSubsquidHistory(url, address);
    else if (type === 'giantsquid') {
      const formattedAddress = BaseApi.isEthereumNetwork(networkName) ? address.toLowerCase() : address;

      return fetchGiantsquidHistory(url, formattedAddress);
    }
  } catch {
    console.info(`%c failed to load history for [[${networkName}]]-[[${address}]] `, 'background:orange;color:#fff');
  }
}

export { fetchHistory };
