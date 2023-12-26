import axios from 'axios';
import { FPNumber } from '@sora-substrate/util';
import { formatEther, formatUnits } from 'ethers';
import type {
  SubqueryHistory,
  GiantsquidHistoryItem,
  HistoryElement,
  HistoryServiceType,
  NetworkName,
  EthereumHistoryResponse,
  EthereumTokenHistoryData,
  SoraHistoryElement,
} from '@/interfaces';
import BaseApi from '@/util/BaseApi';
import { getEthereumExplorerApiKey } from '@/helpers/history';
import { SEC1 } from '@/consts/time';
import {
  computedGiantSquidRequest,
  computedSoraRequest,
  computedSubqueryRequest,
  computedSubsquidRequest,
} from '@/subquery/utils';

async function fetchSubqueryHistory(
  url: string,
  address: string,
  pageSize = 100,
  cursor: string | null = null
): Promise<SubqueryHistory> {
  const res = await axios
    .post(url, { query: computedSubqueryRequest(cursor, pageSize, address) })
    .catch((e) => console.info(e));

  if (res && res.data) return res.data?.historyElements;

  return { nodes: [], timestamp: Date.now(), pageInfo: { startCursor: '0', endCursor: '0' } };
}

async function fetchGiantsquidHistory(url: string, address: string): Promise<GiantsquidHistoryItem[]> {
  const {
    data: { data },
  } = await axios.post(url, { query: computedGiantSquidRequest(address) }).catch(() => {
    return {
      data: { transfers: [] },
    };
  });

  return data?.transfers;
}

async function fetchSubsquidHistory(url: string, address: string): Promise<HistoryElement[]> {
  const {
    data: { data },
  } = await axios.post(url, { query: computedSubsquidRequest(address) }).catch(() => {
    return {
      data: { historyElements: [], timestamp: Date.now() },
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

  return res.data.result.map(({ timeStamp, value: amount, gasUsed: fee, gasPrice, from, to, hash }, index) => {
    const calcFee = new FPNumber(formatUnits(fee, 'gwei'))
      .mul(new FPNumber(formatUnits(gasPrice, 'gwei')))
      .bnToString();

    return {
      address,
      id: String(index),
      timestamp: (+timeStamp * SEC1).toString(),
      transfer: {
        amount,
        hash,
        fee: formatEther(calcFee),
        from,
        to,
        eventIdx: 0,
        success: true,
      },
    };
  });
}

async function fetchSoraHistory(url: string, address: string) {
  const {
    data: { data },
  } = await axios.post<{ data: { historyElements: SoraHistoryElement[] } }>(url, {
    query: computedSoraRequest(address),
  });

  return data?.historyElements;
}

export async function fetchHistory(
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

    return [];
  } catch {
    console.info(`%c failed to load history for [[${networkName}]]-[[${address}]] `, 'background:orange;color:#fff');

    return [];
  }
}
