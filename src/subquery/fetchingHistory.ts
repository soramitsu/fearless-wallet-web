import axios from 'axios';
import { ethers } from 'ethers';
import type {
  SubqueryHistory,
  GiantsquidHistoryItem,
  HistoryElement,
  HistoryServiceType,
  NetworkName,
  EthereumHistoryResponse,
  EthereumTokenHistoryData,
  EthereumHistoryData,
} from '@/interfaces';
import BaseApi from '@/util/BaseApi';
import { getEthereumApiKey } from '@/helpers/history';

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

async function fetchEthereumTokenHistory(
  url: string,
  address: string,
  contractAddress: string
): Promise<HistoryElement[]> {
  const abort = new AbortController();
  const signal = abort.signal;
  const apikey = getEthereumApiKey(url);
  const res = await axios.get<EthereumHistoryResponse<EthereumTokenHistoryData>>(url, {
    params: {
      module: 'account',
      action: 'tokentx',
      contractAddress: `0x${contractAddress}`,
      page: 1,
      offset: 50,
      sort: 'desc',
      apikey,
    },
    signal,
  });

  if (res.status !== 200) {
    abort.abort();

    return [];
  }

  const decimal = +res.data.result[0].tokenDecimal;

  return res.data.result.map(({ timeStamp, value, gasPrice, gasUsed, from, to, hash }, index) => ({
    address,
    id: String(index),
    timestamp: (+timeStamp * 1000).toString(),
    transfer: {
      amount: ethers.formatUnits(value, decimal),
      hash,
      eventIdx: 0,
      fee: (+gasPrice * +gasUsed).toString(),
      from: from,
      success: true,
      to,
    },
  }));
}

async function fetchEthereumHistory(url: string, address: string): Promise<HistoryElement[]> {
  const abort = new AbortController();
  const signal = abort.signal;
  const apikey = getEthereumApiKey(url);
  const res = await axios.get<EthereumHistoryResponse<EthereumHistoryData>>(url, {
    params: {
      module: 'account',
      action: 'txlist',
      address,
      page: 1,
      offset: 50,
      sort: 'desc',
      apikey,
    },
    signal,
  });

  if (res.status !== 200) {
    abort.abort();

    return [];
  }

  return res.data.result.map(({ timeStamp, value, gasPrice, gasUsed, from, isError, to, hash }, index) => ({
    address,
    id: String(index),
    timestamp: (+timeStamp * 1000).toString(),
    transfer: {
      amount: value,
      hash,
      eventIdx: 0,
      fee: (+gasPrice * +gasUsed).toString(),
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
  assetId: string,
  isUtility: boolean
) {
  try {
    if (type === 'etherscan' && isUtility) return fetchEthereumHistory(url, address);

    if (type === 'etherscan') return fetchEthereumTokenHistory(url, address, assetId);

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
