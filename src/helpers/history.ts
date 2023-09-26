import { FPNumber } from '@sora-substrate/util';
import type {
  HistoryElement,
  GiantsquidHistoryItem,
  SubqueryHistory,
  HistoryServiceType,
  NetworkName,
} from '@/interfaces';
import type { TokenBalance } from '@extension-base/background/types/types';
import { TransactionType, TransferType } from '@/interfaces';
import { firstCharToUp } from '@/helpers';
import { formattedNumber } from '@/helpers/numbers';
import store from '@/store';

function getType(historyElement: HistoryElement): TransactionType {
  const { reward, transfer } = historyElement;

  if (transfer) return TransactionType.transfer;

  return reward ? TransactionType.reward : TransactionType.extrinsic;
}

function getSignTransfer(historyElement: HistoryElement, address: string) {
  const type = getType(historyElement);

  if (type === TransactionType.transfer) {
    const { transfer } = historyElement;
    const from = transfer?.from ?? '';

    return from.toLowerCase() !== address.toLowerCase() ? '+' : '-';
  }

  return '';
}

function getTypeFormatted(historyElement: HistoryElement, address: string) {
  const type = getType(historyElement);
  const signTransfer = getSignTransfer(historyElement, address);

  if (type === TransactionType.transfer) {
    return signTransfer === '+' ? TransferType.incoming : TransferType.outgoing;
  }

  if (type === TransactionType.extrinsic) {
    const { call } = historyElement.extrinsic!;

    return `${firstCharToUp(call)}${call === 'transfer' ? ' fee' : ''}`;
  }

  // reward
  return firstCharToUp(type);
}

function getHumanValue(value: string, assetId: string, networkName: NetworkName) {
  const tokenBalances: TokenBalance[] = store.getters.getBalances;
  const { balances } = tokenBalances.find(({ assetId: id }) => id === assetId)!;

  const { precision } = balances.find(({ name }) => name.toLowerCase() === networkName.toLowerCase())!;

  return +FPNumber.fromCodecValue(value, precision);
}

function getHistoryValue(historyElement: HistoryElement, assetId: string, networkName: NetworkName, address: string) {
  const { transfer, reward, extrinsic } = historyElement;
  const type = getType(historyElement);
  const signTransfer = getSignTransfer(historyElement, address);

  if (type === TransactionType.transfer && transfer) {
    const { amount } = transfer;
    const value = getHumanValue(amount, assetId, networkName);

    return { signTransfer, value };
  }

  if (type === TransactionType.reward && reward) {
    const { amount } = reward;
    const value = getHumanValue(amount, assetId, networkName);

    return { signTransfer: '+', value };
  }

  // extrinsic
  const { fee } = extrinsic!;
  const value = getHumanValue(fee, assetId, networkName);

  return { signTransfer: '-', value };
}

function getHumanTransferFee(historyElement: HistoryElement, assetId: string, networkName: NetworkName) {
  const { transfer, extrinsic } = historyElement;
  const type = getType(historyElement);

  if (type === TransactionType.transfer) {
    const { fee } = transfer!;
    const value = getHumanValue(fee, assetId, networkName);
    const formattedValue = formattedNumber(value, { decimalsValue: 4 });

    return `${formattedValue !== '0' ? '-' : ''}${formattedValue}`;
  }

  if (type === TransactionType.extrinsic) {
    const { fee } = extrinsic!;
    const value = getHumanValue(fee, assetId, networkName);
    const formattedValue = formattedNumber(value, { decimalsValue: 4 });

    return `${formattedValue !== '0' ? '-' : ''}${formattedValue}`;
  }

  return '';
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

    return { nodes, pageInfo: { endCursor: '', startCursor: '' } };
  }

  if (serviceType === 'subsquid' || serviceType === 'etherscan') {
    const nodes: HistoryElement[] = (history as HistoryElement[]).map((historyElement) => {
      return {
        ...historyElement,
        timestamp: (+historyElement.timestamp / 1000).toString(),
      };
    });

    return { nodes, pageInfo: { endCursor: '', startCursor: '' } };
  }

  return history as SubqueryHistory;
}

function getEthereumExplorerApiKey(url: string): string | undefined {
  const keys = [
    { name: 'etherscan', key: process.env.FL_WEB_ETHERSCAN_API_KEY },
    { name: 'bscscan', key: process.env.FL_WEB_BSCSCAN_API_KEY },
    { name: 'polygon', key: process.env.FL_WEB_POLYGONSCAN_API_KEY },
  ];

  return keys.find((el) => url.includes(el.name))?.key;
}

export {
  getType,
  getTypeFormatted,
  getEthereumExplorerApiKey,
  getHumanTransferFee,
  getHistoryValue,
  getSignTransfer,
  getFormattedHistory,
};
