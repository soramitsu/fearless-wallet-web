import { format, isToday, isThisYear, secondsToMilliseconds } from 'date-fns';
import type { HistoryNode, AssetJson } from '@/interfaces';
import { TransactionType, TransferType } from '@/interfaces';
import { firstCharToUp } from '@/helpers/common';
import { formattedNumber } from '@/helpers/numbers';
import { FPNumber } from '@/util/fp';
import NetworksController from '@/controllers/networksController';

export function cut(value: string, length = 7) {
  const endNumber = length + 1;

  return `${value.slice(0, length)}...${value.slice(-endNumber)}`;
}

export function getType(historyNode: HistoryNode): TransactionType {
  const { reward, transfer } = historyNode;

  return transfer !== null
    ? TransactionType.transfer
    : reward !== null
    ? TransactionType.reward
    : TransactionType.extrinsic;
}

export function getSignTransfer(historyNode: HistoryNode) {
  const { id } = historyNode;
  const type = getType(historyNode);

  if (type === TransactionType.transfer) {
    const splitId = id.split('-');
    const typeTransaction = splitId[splitId.length - 1];

    return typeTransaction === 'to' ? '+' : '-';
  }

  return '';
}

export function getTypeFormatted(historyNode: HistoryNode) {
  const type = getType(historyNode);
  const signTransfer = getSignTransfer(historyNode);

  if (type === TransactionType.transfer) {
    return signTransfer === '+' ? TransferType.incoming : TransferType.outgoing;
  }

  if (type === TransactionType.extrinsic) {
    const { call } = historyNode[type];

    return `${firstCharToUp(call)}${call === 'transfer' ? ' fee' : ''}`;
  }

  // reward
  return firstCharToUp(type);
}

export function getFormattedDate(historyNode: HistoryNode) {
  const date = new Date(secondsToMilliseconds(+historyNode.timestamp));

  if (isToday(date)) {
    return format(date, 'HH:mm');
  }

  if (isThisYear(date)) {
    return format(date, 'dd MMMM HH:mm');
  }

  return format(date, 'dd MMMM yyyy HH:mm');
}

export function getHumanValue(value: string, assetId: string) {
  const assetsJson: AssetJson[] = NetworksController.getAssetsJson();
  const assetJson = assetsJson.find(({ id }) => id === assetId)!;
  const precision = assetJson?.precision ?? 0;

  return +FPNumber.fromCodecValue(value, precision).toString();
}

export function getHistoryValue(historyNode: HistoryNode, assetId: string) {
  const { transfer, reward, extrinsic } = historyNode;
  const type = getType(historyNode);
  const signTransfer = getSignTransfer(historyNode);

  if (type === TransactionType.transfer) {
    const { amount } = transfer;
    const value = getHumanValue(amount, assetId);

    return `${signTransfer}${formattedNumber(value, 4, true, true)}`;
  }

  if (type === TransactionType.reward) {
    const { amount } = reward;
    const value = getHumanValue(amount, assetId);

    return `+${formattedNumber(value, 4, true, true)}`;
  }

  // extrinsic
  const { fee } = extrinsic;
  const value = getHumanValue(fee, assetId);

  return `-${formattedNumber(value, 4, true, true)}`;
}

export function getHumanTransferFee(historyNode: HistoryNode, assetId: string) {
  const { transfer, extrinsic } = historyNode;
  const type = getType(historyNode);

  if (type === TransactionType.transfer) {
    const { fee } = transfer;
    const value = getHumanValue(fee, assetId);

    return `-${formattedNumber(value, 4)}`;
  }

  if (type === TransactionType.extrinsic) {
    const { fee } = extrinsic;
    const value = getHumanValue(fee, assetId);

    return `-${formattedNumber(value, 4)}`;
  }

  return '';
}
