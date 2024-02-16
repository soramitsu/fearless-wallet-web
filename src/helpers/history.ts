import { FPNumber } from '@sora-substrate/util';
import type {
  HistoryElement,
  GiantsquidHistoryItem,
  SubqueryHistory,
  HistoryServiceType,
  NetworkName,
  SoraHistoryElement,
} from '@/interfaces';
import type { TokenGroup } from '@extension-base/background/types/types';
import { TransactionType } from '@/interfaces';
import { firstCharToUp, isSora } from '@/helpers';
import { useStore } from '@/store';
import { type NetworkJson } from '@/extension/background/extension-base/src/types';

function getType(historyElement: HistoryElement, networkName?: NetworkName): TransactionType {
  if (isSora(networkName ?? '')) return TransactionType.sora;

  const { reward, transfer } = historyElement;

  if (transfer) return TransactionType.transfer;

  return reward ? TransactionType.reward : TransactionType.extrinsic;
}

function getSignTransfer(historyElement: HistoryElement, address: string, networkName: NetworkName) {
  const type = getType(historyElement, networkName);

  if (type === TransactionType.sora) {
    const element = historyElement as SoraHistoryElement;

    return element.method === 'rewarded' ? '+' : '-';
  }

  if (type === TransactionType.transfer) {
    const { transfer } = historyElement;
    const from = transfer?.from ?? '';

    return from.toLowerCase() !== address.toLowerCase() ? '+' : '-';
  }

  return '';
}

function getTypeFormatted(historyElement: HistoryElement, address: string, networkName: NetworkName) {
  const type = getType(historyElement, networkName);

  if (type === TransactionType.sora) {
    const element = historyElement as SoraHistoryElement;

    return element.module;
  }

  const signTransfer = getSignTransfer(historyElement, address, networkName);

  if (type === TransactionType.transfer) {
    return signTransfer === '+' ? 'incomingTransfer' : 'outgoingTransfer';
  }

  if (type === TransactionType.extrinsic) {
    const { call } = historyElement.extrinsic!;

    return `${firstCharToUp(call)}${call === 'transfer' ? ' fee' : ''}`;
  }

  // reward
  return firstCharToUp(type);
}

function getHumanFeeValue(value: string, networkName: NetworkName) {
  const store = useStore();
  const tokenBalances: TokenGroup[] = store.getters.getBalances;
  const network: NetworkJson = store.getters.getNetwork(networkName);
  const asset = network.assets.find((asset) => asset.isUtility);
  const token = tokenBalances.find(({ symbol }) => symbol === asset?.symbol);
  const balance = token?.balances.find(({ id }) => id === asset?.id);
  const precision = balance?.precision ?? 0;

  return FPNumber.fromCodecValue(value, precision).toNumber();
}

function getHumanValue(value: string | number, assetId: string, networkName: NetworkName) {
  const store = useStore();
  const tokenBalances: TokenGroup[] = store.getters.getBalances;
  const { balances } = tokenBalances.find(({ groupId }) => groupId === assetId)!;
  const { precision } = balances.find(({ name }) => name.toLowerCase() === networkName.toLowerCase())!;

  return +FPNumber.fromCodecValue(value, precision);
}

function getHumanTransferFee(historyElement: HistoryElement, networkName: NetworkName) {
  const store = useStore();
  const network: NetworkJson = store.getters.getNetwork(networkName);
  const historyType = network.externalApi?.history?.type;
  const type = getType(historyElement, networkName);

  if (type === TransactionType.sora) {
    const element = historyElement as SoraHistoryElement;
    const { networkFee } = element;

    return getHumanFeeValue(networkFee, networkName);
  }

  const { transfer, extrinsic } = historyElement;

  if (type === TransactionType.transfer) {
    const { fee } = transfer!;

    if (historyType === 'oklink') return +fee;

    return getHumanFeeValue(fee, networkName);
  }

  if (type === TransactionType.extrinsic) {
    const { fee } = extrinsic!;

    return getHumanFeeValue(fee, networkName);
  }

  return 0;
}

function getHistoryValue(
  historyElement: HistoryElement,
  assetId: string,
  networkName: NetworkName,
  address: string,
  withFee = false
) {
  const store = useStore();
  const network: NetworkJson = store.getters.getNetwork(networkName);
  const historyType = network.externalApi?.history?.type;
  const signTransfer = getSignTransfer(historyElement, address, networkName);
  const type = getType(historyElement, networkName);

  if (historyType === 'oklink') {
    const amount = historyElement.transfer?.amount ? historyElement.transfer.amount : 0;
    const fee = historyElement.transfer?.fee ? historyElement.transfer.fee : 0;

    if (withFee) return { signTransfer, value: +amount + +fee };

    return { signTransfer, value: +amount };
  }

  if (type === TransactionType.sora) {
    const element = historyElement as SoraHistoryElement;

    const dataValue =
      element.data?.value ?? element.data?.amount ?? element.data?.baseAssetAmount ?? element.data?.maxAdditional ?? 0;

    const targetValue = +(element.data?.targetAssetAmount ?? 0);

    // fee в индексере с учетом decimals
    const fee = getHumanTransferFee(historyElement, networkName);

    const result = withFee && element.method !== 'rewarded' ? +dataValue + fee : +dataValue;

    return { signTransfer, value: result, targetValue };
  }

  const { transfer, reward, extrinsic } = historyElement;

  if (type === TransactionType.transfer && transfer) {
    const value = getHumanValue(transfer.amount, assetId, networkName);
    const fee = getHumanTransferFee(historyElement, networkName);
    const result = withFee ? value + fee : value;

    return { signTransfer, value: result };
  }

  if (type === TransactionType.reward && reward) {
    const value = getHumanValue(reward.amount, assetId, networkName);

    return { signTransfer: '+', value };
  }

  // extrinsic
  const { fee } = extrinsic!;
  const value = getHumanValue(fee, assetId, networkName);

  return { signTransfer: '-', value };
}

// temporary function, remove after complete transition to subsquid
function getFormattedHistory(
  history: GiantsquidHistoryItem[] | SubqueryHistory | HistoryElement[],
  serviceType: HistoryServiceType
): SubqueryHistory {
  if (serviceType === 'giantsquid') {
    const nodes: HistoryElement[] = (history as GiantsquidHistoryItem[]).map(({ id, transfer }) => {
      const { amount, from, success, timestamp, to, extrinsicHash } = transfer;

      return {
        id,
        timestamp: (new Date(timestamp).getTime() / 1000).toString(),
        address: '',
        transfer: {
          amount,
          success,
          hash: extrinsicHash,
          from: from.id,
          to: to.id,
          eventIdx: -1,
          fee: '0',
        },
      };
    });

    return { nodes, pageInfo: { endCursor: '', startCursor: '' }, timestamp: Date.now() };
  }

  if (serviceType === 'subsquid' || serviceType === 'etherscan') {
    const nodes: HistoryElement[] = (history as HistoryElement[]).map((historyElement) => {
      return {
        ...historyElement,
        timestamp: (+historyElement.timestamp / 1000).toString(),
      };
    });

    return { nodes, pageInfo: { endCursor: '', startCursor: '' }, timestamp: Date.now() };
  }

  if (serviceType === 'sora' || serviceType === 'oklink' || serviceType === 'zeta') {
    const nodes: HistoryElement[] = (history as SoraHistoryElement[]).map((historyElement) => {
      return {
        ...historyElement,
        timestamp: historyElement.timestamp.toString(),
      };
    });

    return { nodes, pageInfo: { endCursor: '', startCursor: '' }, timestamp: Date.now() };
  }

  return history as SubqueryHistory;
}

function getEthereumExplorerApiKey(url: string): string | undefined {
  const keys = [
    { name: 'etherscan', key: process.env.FL_WEB_ETHERSCAN_API_KEY },
    { name: 'bscscan', key: process.env.FL_WEB_BSCSCAN_API_KEY },
    { name: 'polygon', key: process.env.FL_WEB_POLYGONSCAN_API_KEY },
    { name: 'arbiscan', key: process.env.FL_WEB_ARBISCAN_API_KEY },
    { name: 'snowtrace', key: process.env.FL_WEB_SNOWTRACE_API_KEY },
    { name: 'zkevm.polygonscan', key: process.env.FL_WEB_ZKEVM_POLYGONSCAN_API_KEY },
    { name: 'moonriver.moonscan', key: process.env.FL_BLAST_API_MOONRIVER_KEY },
    { name: 'moonbeam.moonscan', key: process.env.FL_BLAST_API_MOONBEAM_KEY },
  ];

  return keys.find(({ name }) => url.includes(name))?.key;
}

export {
  getType,
  getTypeFormatted,
  getEthereumExplorerApiKey,
  getHumanTransferFee,
  getHistoryValue,
  getHumanFeeValue,
  getSignTransfer,
  getFormattedHistory,
};
