import axios from 'axios';
import type {
  SubqueryHistory,
  GiantsquidHistoryItem,
  HistoryElement,
  HistoryServiceType,
  NetworkName,
  EthereumHistoryResponse,
  EthereumTokenHistoryData,
} from '@/interfaces';
import BaseApi from '@/util/BaseApi';
import { getEthereumExplorerApiKey } from '@/helpers/history';
import { SEC1 } from '@/consts/time';

async function fetchSubqueryHistory(
  url: string,
  address: string,
  pageSize = 100,
  cursor: string | null = null
): Promise<SubqueryHistory> {
  const res = await axios
    .post(url, {
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
    })
    .catch((e) => console.info(e));

  if (res && res.data) return res.data?.historyElements;

  return { nodes: [], pageInfo: { startCursor: '0', endCursor: '0' } };
}

async function fetchGiantsquidHistory(url: string, address: string): Promise<GiantsquidHistoryItem[]> {
  const {
    data: { data },
  } = await axios
    .post(url, {
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
    })
    .catch(() => {
      return {
        data: { transfers: [] },
      };
    });

  return data?.transfers;
}

async function fetchSubsquidHistory(url: string, address: string): Promise<HistoryElement[]> {
  const {
    data: { data },
  } = await axios
    .post(url, {
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
    })
    .catch(() => {
      return {
        data: { historyElements: [] },
      };
    });

  return data?.historyElements;
}

async function fetchEthereumHistory(url: string, address: string, contractAddress?: string): Promise<HistoryElement[]> {
  const abort = new AbortController();
  const signal = abort.signal;
  const apikey = getEthereumExplorerApiKey(url);

  const res = await axios.get<EthereumHistoryResponse<EthereumTokenHistoryData>>(url, {
    params: {
      module: 'account',
      action: contractAddress ? 'tokentx' : 'txlist',
      contractAddress: contractAddress,
      address,
      page: 1,
      offset: 300,
      sort: 'desc',
      apikey,
    },
    signal,
  });

  if (res.status !== 200) {
    abort.abort();

    return [];
  }

  return res.data.result.map(({ timeStamp, value, gasUsed, from, to, hash }, index) => ({
    address,
    id: String(index),
    timestamp: (+timeStamp * SEC1).toString(),
    transfer: {
      amount: value,
      hash,
      eventIdx: 0,
      fee: gasUsed,
      from: from,
      success: true,
      to,
    },
  }));
}

async function fetchSoraHistory(url: string, address: string) {
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
      }`,
  });

  return data?.historyElements;
}

async function fetchHistory(
  url: string,
  address: string,
  type: HistoryServiceType,
  networkName: NetworkName,
  assetId: string,
  isUtility: boolean
) {
  try {
    if (type === 'sora') return fetchSoraHistory(url, address);

    if (type === 'etherscan') {
      const contractAddress = isUtility ? undefined : assetId;

      return fetchEthereumHistory(url, address, contractAddress);
    }

    if (type === 'subquery') return fetchSubqueryHistory(url, address);

    if (type === 'subsquid') return fetchSubsquidHistory(url, address);

    if (type === 'giantsquid') {
      const formattedAddress = BaseApi.isEthereumNetwork(networkName) ? address.toLowerCase() : address;

      return fetchGiantsquidHistory(url, formattedAddress);
    }
  } catch {
    console.info(`%c failed to load history for [[${networkName}]]-[[${address}]] `, 'background:orange;color:#fff');
  }
}

export { fetchHistory };
