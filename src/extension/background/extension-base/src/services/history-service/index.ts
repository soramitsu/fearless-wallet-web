import axios from 'axios';
import { formatEther, formatUnits } from 'ethers';
import { type RequestGetHistory } from '../../background/types/types';
import { normalizeHistoryServiceType, pickTonAssetHistory } from './utils';
import type State from '@extension-base/background/handlers/State';
import {
  type TonEventTokens,
  type TonEvent,
  type HistoryFetchRequest,
  type HistoryFetchResult,
  type HistoryFetchResponse,
  type SubqueryHistory,
  type HistoryResultItem,
  type GiantsquidHistoryItem,
  type HistoryElement,
  type SoraHistoryElement,
  type X1HistoryElement,
  type ZetaHistory,
  type EthereumHistoryResponse,
  type EthereumTokenHistoryData,
} from '@/interfaces';
import { TON_ID } from '@/consts/currencies';
import { SORA_VAL_ASSET_ID, SORA_XOR_ASSET_ID } from '@/consts/sora';
import { getJettonAssetId, isSameString } from '@/helpers';
import { SEC1 } from '@/consts/time';
import { FPNumber } from '@/lib/fpNumber';
import {
  computedGiantSquidRequest,
  computedSoraRequest,
  computedSubqueryRequest,
  computedSubsquidRequest,
} from '@/history/requests';
import { getEthereumExplorerApiKey } from '@/helpers/history';
import { isNativeEVMNetwork } from '@/extension/background/extension-base/src/background/handlers/utils';

const fetchSubqueryHistory = async (
  url: string,
  address: string,
  pageSize = 100,
  cursor: string | null = null
): Promise<SubqueryHistory> => {
  const res = await axios.post(url, { query: computedSubqueryRequest(cursor, pageSize, address) }).catch((e) => {
    console.info(e);

    return undefined;
  });

  if (res && res.data) return res.data?.historyElements;

  return { nodes: [], timestamp: Date.now(), pageInfo: { startCursor: '0', endCursor: '0' } };
};

const fetchGiantsquidHistory = async (url: string, address: string): Promise<GiantsquidHistoryItem[]> => {
  const { data } = await axios.post(url, { query: computedGiantSquidRequest(address) }).catch(() => {
    return {
      data: { transfers: [] },
    };
  });

  return data?.data?.transfers;
};

const fetchSubsquidHistory = async (url: string, address: string): Promise<HistoryElement[]> => {
  const { data } = await axios.post(url, { query: computedSubsquidRequest(address) }).catch(() => {
    return {
      data: { historyElements: [], timestamp: Date.now() },
    };
  });

  return data?.data?.historyElements;
};

const fetchEthereumHistory = async (
  url: string,
  address: string,
  contractAddress?: string
): Promise<HistoryElement[]> => {
  const abort = new AbortController();
  const signal = abort.signal;
  const apikey = getEthereumExplorerApiKey(url);
  const params: Record<string, unknown> = {
    module: 'account',
    action: contractAddress ? 'tokentx' : 'txlist',
    contractAddress: contractAddress,
    address,
    page: 1,
    offset: 300,
    sort: 'desc',
  };

  if (!url.includes('optimistic')) {
    params.apikey = apikey;
  }

  const res = await axios.get(url, {
    params,
    signal,
  });

  if (res.status !== 200) {
    abort.abort();

    return [];
  }

  const data = res.data as EthereumHistoryResponse<EthereumTokenHistoryData>;

  return data.result.map(({ timeStamp, value: amount, gasUsed: fee, gasPrice, from, to, hash }, index) => {
    const calcFee = new FPNumber(formatUnits(fee, 'gwei'))
      .mul(new FPNumber(formatUnits(gasPrice, 'gwei')))
      .toCodecString();

    return {
      address,
      id: String(index),
      timestamp: (+timeStamp * SEC1).toString(),
      success: true,
      blockHash: hash,
      transfer: {
        amount,
        fee: formatEther(calcFee),
        from,
        to,
      },
    };
  });
};

const fetchX1History = async (url: string, address: string): Promise<HistoryElement[]> => {
  const prepUrl = `${url}&address=${address}`;
  const headers = { 'OK-ACCESS-KEY': process.env.VUE_APP_FL_WEB_X1_TESTNET_API_KEY };
  const res = await axios.get<X1HistoryElement>(prepUrl, { headers });
  const result: HistoryElement[] = [];

  res.data.data[0].transactionLists.forEach((el, index) => {
    result.push({
      address,
      id: String(index),
      timestamp: (new Date(+el.transactionTime).getTime() / 1000).toString(),
      success: el.state === 'success',
      blockHash: el.txId,
      transfer: {
        amount: el.amount,
        from: el.from,
        to: el.to,
        fee: el.txFee,
      },
    });
  });

  return result;
};

const fetchSoraHistory = async (url: string, address: string) => {
  const {
    data: { data },
  } = await axios.post<{ data: { historyElements: SoraHistoryElement[] } }>(url, {
    query: computedSoraRequest(address),
  });

  return data?.historyElements;
};

const fetchZetaHistory = async (url: string, address: string) => {
  const prepUrl = `${url}${address}/transactions`;
  const headers = { 'OK-ACCESS-KEY': process.env.VUE_APP_FL_WEB_X1_TESTNET_API_KEY };
  const res = await axios.get<ZetaHistory>(prepUrl, { headers });
  const result: HistoryElement[] = [];

  res.data.items.forEach((el, index) => {
    result.push({
      address,
      id: String(index),
      timestamp: (new Date(el.timestamp).getTime() / 1000).toString(), //to seconds
      success: el.status === 'ok',
      blockHash: el.hash,
      transfer: {
        amount: el.value,
        from: el.from.hash,
        to: el.to.hash,
        fee: el.fee.value,
      },
    });
  });

  return result;
};

const buildSubqueryHistoryFromNodes = (nodes: HistoryElement[]): SubqueryHistory => ({
  nodes,
  pageInfo: { endCursor: '', startCursor: '' },
  timestamp: Date.now(),
});

const formatGiantsquidHistory = (history: GiantsquidHistoryItem[]): SubqueryHistory => {
  const nodes: HistoryElement[] = history.map(({ id, transfer }) => {
    const { amount, from, success, timestamp, to } = transfer;

    return {
      id,
      timestamp: (new Date(timestamp).getTime() / 1000).toString(),
      address: '',
      success,
      transfer: {
        amount,
        from: from.id,
        to: to.id,
        fee: '0',
      },
    };
  });

  return buildSubqueryHistoryFromNodes(nodes);
};

const formatTonHistory = (history: TonEvent[]): SubqueryHistory =>
  buildSubqueryHistoryFromNodes(history as unknown as HistoryElement[]);

const formatSoraHistory = (history: SoraHistoryElement[]): SubqueryHistory => {
  const nodes = history.map((item) => ({
    ...item,
    success: item.execution.success,
    timestamp: item.timestamp.toString(),
  })) as unknown as HistoryElement[];

  return buildSubqueryHistoryFromNodes(nodes);
};

const formatGenericHistory = (history: HistoryElement[]): SubqueryHistory => buildSubqueryHistoryFromNodes(history);

// Сейчас здесь парсится только история для тон сети, тк она достается из ноды
// Вся остальная история парсится на клиенте
// TODO возможно стоит перенести парсинг всей истории в SW
export class HistoryService {
  constructor(private state: State) {}

  async fetchHistoryForAsset(request: HistoryFetchRequest): Promise<HistoryFetchResponse | null> {
    const {
      network,
      endpoint: { type, url },
      address,
      asset,
    } = request;

    try {
      const normalizedType = normalizeHistoryServiceType(type);

      if (!normalizedType) return null;

      let result: HistoryFetchResult | null = null;

      switch (normalizedType) {
        case 'ton': {
          result = {
            serviceType: 'ton',
            history: pickTonAssetHistory(await this.fetchTonAssetsHistory({ address: address.raw, network }), asset.id),
          };
          break;
        }

        case 'sora': {
          result = {
            serviceType: 'sora',
            history: (await fetchSoraHistory(url, address.formatted)) ?? [],
          };
          break;
        }

        case 'oklink': {
          result = {
            serviceType: 'oklink',
            history: await fetchX1History(url, address.raw),
          };
          break;
        }

        case 'zeta': {
          result = {
            serviceType: 'zeta',
            history: await fetchZetaHistory(url, address.raw),
          };
          break;
        }

        case 'subquery': {
          result = {
            serviceType: 'subquery',
            history: await fetchSubqueryHistory(url, address.formatted),
          };
          break;
        }

        case 'subsquid': {
          result = {
            serviceType: 'subsquid',
            history: await fetchSubsquidHistory(url, address.formatted),
          };
          break;
        }

        case 'giantsquid': {
          const formattedAddress = isNativeEVMNetwork(network) ? address.raw.toLowerCase() : address.formatted;

          result = {
            serviceType: 'giantsquid',
            history: await fetchGiantsquidHistory(url, formattedAddress),
          };
          break;
        }

        case 'etherscan': {
          const contractAddress = asset.isUtility ? undefined : (asset.contractAddress ?? asset.id);

          result = {
            serviceType: 'etherscan',
            history: await fetchEthereumHistory(url, address.raw, contractAddress),
          };
          break;
        }

        default:
          return null;
      }

      if (!result) return null;

      return this.normalizeHistoryResponse(request, result);
    } catch (error) {
      console.info(
        `%c failed to load history for [[${network}]]-[[${address.raw}]] `,
        'background:orange;color:#fff',
        error
      );

      return null;
    }
  }

  private normalizeHistoryResponse(request: HistoryFetchRequest, result: HistoryFetchResult): HistoryFetchResponse {
    if (result.serviceType === 'sora') {
      return this.buildSoraHistoryItems(request.network, result.history);
    }

    const history = this.buildHistoryByService(result);

    const item: HistoryResultItem = {
      assetId: request.asset.id,
      serviceType: result.serviceType,
      history,
    };

    return [item];
  }

  private buildHistoryByService(result: HistoryFetchResult): SubqueryHistory {
    switch (result.serviceType) {
      case 'ton':
        return formatTonHistory(result.history);
      case 'giantsquid':
        return formatGiantsquidHistory(result.history);
      case 'sora':
        return formatSoraHistory(result.history);
      case 'subquery':
        return result.history;
      default:
        return formatGenericHistory(result.history as HistoryElement[]);
    }
  }

  private buildSoraHistoryItems(network: string, history: SoraHistoryElement[]): HistoryFetchResponse {
    const grouped = this.groupSoraHistoryByAsset(network, history);

    return grouped.map(({ assetId, entries }) => ({
      assetId,
      serviceType: 'sora',
      history: formatSoraHistory(entries),
    }));
  }

  private groupSoraHistoryByAsset(
    network: string,
    history: SoraHistoryElement[]
  ): Array<{ assetId: string; entries: SoraHistoryElement[] }> {
    if (!history.length) return [];

    let networkAssets: Array<{ id?: string; currencyId?: string }> = [];

    try {
      const networkJson = this.state.networkService.getNetworkJson(network);
      networkAssets = networkJson?.assets ?? [];
    } catch {
      networkAssets = [];
    }

    const grouped = history.reduce<Record<string, SoraHistoryElement[]>>((result, item) => {
      const baseAssetId = item.data?.baseAssetId ?? item.data?.assetId;
      const fallbackAssetId =
        networkAssets.find(({ currencyId }) => isSameString(currencyId, baseAssetId))?.id ?? SORA_XOR_ASSET_ID;
      const assetId = item.method === 'rewarded' ? SORA_VAL_ASSET_ID : fallbackAssetId;

      if (!result[assetId]) result[assetId] = [];

      result[assetId].push({
        ...item,
        success: item.execution.success,
      });

      return result;
    }, {});

    return Object.entries(grouped).map(([assetId, entries]) => ({
      assetId,
      entries,
    }));
  }

  // Итория транзакций парсится только для TON_MAINNET
  async fetchTonAssetsHistory({ address: _address, network }: RequestGetHistory): Promise<TonEventTokens> {
    const address = _address ?? this.state.currentAccount?.address;

    if (!address) return {};

    const api = this.state.getTonApiMap[network.toLowerCase()];

    const { walletContract } = this.state.keyringService.tonKeyring.accountSubject.value[address];
    const contactAddress = walletContract.address.toString();

    const history = await api.api.accounts.getAccountEvents(walletContract.address, { limit: 100 });

    const events = history.events.reduce<TonEventTokens>(
      (result, { actions, eventId, timestamp, extra }) => {
        actions.forEach((item) => {
          const { type, status } = item;

          if (type === 'TonTransfer') {
            const amount = item[type]?.amount.toString();
            const to = item[type]?.recipient?.address;
            const from = item[type]?.sender?.address;
            const comment = item[type]?.comment;

            const isOutEvent = isSameString(from?.toString(), contactAddress);

            result[TON_ID].push({
              amount,
              to: to ? this.state.keyringService.tonKeyring.getUserFriendlyAddress(to) : '',
              from: from ? this.state.keyringService.tonKeyring.getUserFriendlyAddress(from) : '',
              comment,
              eventId,
              timestamp,
              method: 'transfer',
              success: status === 'ok',
              symbol: 'ton',
              isOutEvent: isOutEvent,
              networkFee: extra.toString(),
            });

            return;
          }

          if (type === 'JettonTransfer') {
            const amount = item[type]?.amount.toString();
            const to = item[type]?.recipient?.address.toString();
            const from = item[type]?.sender?.address.toString();
            const comment = item[type]?.comment;
            const symbol = item[type]?.jetton.symbol.toLowerCase() ?? '';
            const name = item[type]?.jetton.name.toLowerCase() ?? '';
            const isOutEvent = isSameString(from, contactAddress);

            const groupId = getJettonAssetId(name, symbol);

            if (!result[groupId]) result[groupId] = [];

            result[groupId].push({
              amount,
              to,
              from,
              comment,
              eventId,
              timestamp,
              method: 'transfer',
              success: status === 'ok',
              symbol,
              isOutEvent,
              networkFee: extra.toString(),
            });

            return;
          }

          if (type === 'JettonSwap') {
            const amountIn = item[type]?.amountIn.toString();
            const amountOut = item[type]?.amountOut.toString();
            const dex = item[type]?.dex;
            const userWallet = item[type]?.userWallet.address.toString();
            const symbol = item[type]?.jettonMasterOut?.symbol.toLowerCase() ?? '';
            const name = item[type]?.jettonMasterOut?.name.toLowerCase() ?? '';
            const symbolIn = item[type]?.jettonMasterIn?.symbol.toLowerCase() ?? '';

            const groupId = getJettonAssetId(name, symbol);

            if (!result[groupId]) result[groupId] = [];

            result[groupId].push({
              amountIn,
              amountOut,
              dex,
              userWallet,
              eventId,
              timestamp,
              method: 'swap',
              symbol,
              symbolIn,
              isOutEvent: true,
              success: status === 'ok',
              networkFee: extra.toString(),
            });

            return;
          }

          return;
        });

        return result;
      },
      { [TON_ID]: [] }
    );

    return events;
  }
}
