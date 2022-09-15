import { format, isToday, isThisYear, secondsToMilliseconds } from 'date-fns';
import type { HistoryNode } from '@/interfaces/history';
import type { AssetJson } from '@/store/networks/types';
import { TransactionType, TransferType } from '@/interfaces/history';
import { firstCharToUp } from '@/util/helpers';
import { formattedNumber } from '@/util/numbers';
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

export function getHash(historyNode: HistoryNode) {
  const type = getType(historyNode);

  if (type === TransactionType.transfer) {
    const { to } = historyNode[type];

    return cut(to);
  }

  if (type === TransactionType.reward) {
    const { validator } = historyNode[type];

    return cut(validator);
  }

  // extrinsic
  const { hash } = historyNode[type];

  return cut(hash);
}

export function getSignTransfer(historyNode: HistoryNode) {
  const type = getType(historyNode);

  if (type === TransactionType.transfer) {
    const splitId = historyNode.id.split('-');
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

export function getHumanValue(value: string, token: string) {
  const assets: AssetJson[] = NetworksController.getAssets();
  const tokenAssets = assets.find(({ id }) => id === token)!; // eslint-disable-line
  const precision = +tokenAssets?.precision ?? 0;

  return +FPNumber.fromCodecValue(value, precision).toString();
}

export function getHistoryValue(historyNode: HistoryNode, token: string) {
  const type = getType(historyNode);
  const signTransfer = getSignTransfer(historyNode);

  if (type === TransactionType.transfer) {
    const { amount } = historyNode[type];
    const value = getHumanValue(amount, token);

    return `${signTransfer}${formattedNumber(value, 4)}`;
  }

  if (type === TransactionType.reward) {
    const { amount } = historyNode[type];
    const value = getHumanValue(amount, token);

    return `+${formattedNumber(value, 4)}`;
  }

  // extrinsic
  const { fee } = historyNode[type];
  const value = getHumanValue(fee, token);

  return `-${formattedNumber(value, 4)}`;
}

export function getHumanTransferFee(historyNode: HistoryNode, token: string) {
  const type = getType(historyNode);

  if (type === TransactionType.transfer) {
    const { fee } = historyNode.transfer;
    const value = getHumanValue(fee, token);

    return `-${formattedNumber(value, 4)}`;
  }

  if (type === TransactionType.extrinsic) {
    const { fee } = historyNode.extrinsic;
    const value = getHumanValue(fee, token);

    return `-${formattedNumber(value, 4)}`;
  }

  return '';
}

export function getFromAddress(historyNode: HistoryNode) {
  const { from } = historyNode.transfer;

  return from;
}

export function getToAddress(historyNode: HistoryNode) {
  const { to } = historyNode.transfer;

  return to;
}

export function getModule(historyNode: HistoryNode) {
  const { module } = historyNode.extrinsic;

  return firstCharToUp(module);
}

export function getCall(historyNode: HistoryNode) {
  const { call } = historyNode.extrinsic;

  return firstCharToUp(call);
}
