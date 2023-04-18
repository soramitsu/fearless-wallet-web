import { format, isToday, isThisYear, secondsToMilliseconds } from 'date-fns';
import { FPNumber } from '@sora-substrate/util';
import type {
  HistoryElement,
  AssetJson,
  GiantsquidHistoryItem,
  SubqueryHistory,
  HistoryServiceType,
} from '@/interfaces';
import { TransactionType, TransferType } from '@/interfaces';
import { firstCharToUp } from '@/helpers/common';
import { formattedNumber } from '@/helpers/numbers';
import { NetworksController } from '@/controllers';

function cut(value: string, length = 7) {
  const endNumber = length + 1;

  return `${value.slice(0, length)}...${value.slice(-endNumber)}`;
}

function getType(historyElement: HistoryElement): TransactionType {
  const { reward, transfer } = historyElement;

  return transfer !== null
    ? TransactionType.transfer
    : reward !== null
    ? TransactionType.reward
    : TransactionType.extrinsic;
}

function getSignTransfer(historyElement: HistoryElement) {
  const { id } = historyElement;
  const type = getType(historyElement);

  if (type === TransactionType.transfer) {
    const splitId = id.split('-');
    const typeTransaction = splitId[splitId.length - 1];

    return typeTransaction === 'to' ? '+' : '-';
  }

  return '';
}

function getTypeFormatted(historyElement: HistoryElement) {
  const type = getType(historyElement);
  const signTransfer = getSignTransfer(historyElement);

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

function getFormattedDate({ timestamp }: HistoryElement) {
  const date = new Date(secondsToMilliseconds(+timestamp));

  if (isToday(date)) {
    return format(date, 'HH:mm');
  }

  if (isThisYear(date)) {
    return format(date, 'dd MMMM HH:mm');
  }

  return format(date, 'dd MMMM yyyy HH:mm');
}

function getHumanValue(value: string, assetId: string) {
  const assetsJson: AssetJson[] = NetworksController.getAssetsJson();
  const assetJson = assetsJson.find(({ id }) => id === assetId)!;
  const precision = assetJson?.precision ?? 0;

  return +FPNumber.fromCodecValue(value, precision);
}

function getHistoryValue(historyElement: HistoryElement, assetId: string) {
  const { transfer, reward, extrinsic } = historyElement;
  const type = getType(historyElement);
  const signTransfer = getSignTransfer(historyElement);

  if (type === TransactionType.transfer) {
    const { amount } = transfer!;
    const value = getHumanValue(amount, assetId);

    return { signTransfer, value };
  }

  if (type === TransactionType.reward) {
    const { amount } = reward!;
    const value = getHumanValue(amount, assetId);

    return { signTransfer: '+', value };
  }

  // extrinsic
  const { fee } = extrinsic!;
  const value = getHumanValue(fee, assetId);

  return { signTransfer: '-', value };
}

function getHumanTransferFee(historyElement: HistoryElement, assetId: string) {
  const { transfer, extrinsic } = historyElement;
  const type = getType(historyElement);

  if (type === TransactionType.transfer) {
    const { fee } = transfer!;
    const value = getHumanValue(fee, assetId);
    const formattedValue = formattedNumber(value, { decimalsValue: 4 });

    return `${formattedValue !== '0' ? '-' : ''}${formattedValue}`;
  }

  if (type === TransactionType.extrinsic) {
    const { fee } = extrinsic!;
    const value = getHumanValue(fee, assetId);
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
      const { amount, from, success, timestamp, to } = transfer;

      return {
        id,
        timestamp: (new Date(timestamp).getTime() / 1000).toString(),
        address: '',
        extrinsic: null,
        reward: null,
        transfer: {
          amount,
          success,
          from: from.id,
          to: to.id,
          eventIdx: -1,
          fee: '0',
        },
      };
    });

    return { nodes, pageInfo: { endCursor: '', startCursor: '' } };
  }

  if (serviceType === 'subsquid') {
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

export {
  cut,
  getType,
  getTypeFormatted,
  getHumanTransferFee,
  getHistoryValue,
  getFormattedDate,
  getHumanValue,
  getSignTransfer,
  getFormattedHistory,
};
