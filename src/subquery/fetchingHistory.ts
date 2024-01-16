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
  X1HistoryElement,
  ZetaHistory,
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

export async function fetchX1History(url: string, address: string): Promise<HistoryElement[]> {
  const prepUrl = `${url}&address=${address}`;
  const headers = {
    'OK-ACCESS-KEY': process.env.VUE_APP_FL_WEB_X1_TESTNET_API_KEY,
  };
  const res = await axios.get<X1HistoryElement>(prepUrl, { headers });
  const result: HistoryElement[] = [];

  res.data.data[0].transactionLists.forEach((el, index) => {
    result.push({
      address,
      id: String(index),
      timestamp: (new Date(+el.transactionTime).getTime() / 1000).toString(),
      transfer: {
        amount: el.amount,
        from: el.from,
        hash: el.txId,
        success: el.state === 'success',
        to: el.to,
        fee: el.txFee,
      },
    });
  });

  return result;
}

async function fetchSoraHistory(url: string, address: string) {
  const {
    data: { data },
  } = await axios.post<{ data: { historyElements: SoraHistoryElement[] } }>(url, {
    query: computedSoraRequest(address),
  });

  return data?.historyElements;
}

async function fetchZetaHistory(url: string, address: string) {
  const prepUrl = `${url}${address}/transactions`;
  const headers = {
    'OK-ACCESS-KEY': process.env.VUE_APP_FL_WEB_X1_TESTNET_API_KEY,
  };
  const res = await axios.get<ZetaHistory>(prepUrl, { headers });
  const result: HistoryElement[] = [];

  res.data.items.forEach((el, index) => {
    result.push({
      address,
      id: String(index),
      timestamp: (new Date(el.timestamp).getTime() / 1000).toString(), //to seconds
      transfer: {
        amount: el.value,
        from: el.from.hash,
        hash: el.hash,
        success: el.status === 'ok',
        to: el.to.hash,
        fee: el.fee.value,
      },
    });
  });

  return result;
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
    if (type === 'oklink') return fetchX1History(url, address);
    if (type === 'zeta') return fetchZetaHistory(url, address);

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
