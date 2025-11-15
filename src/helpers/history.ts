import type { NetworkJson } from '@extension-base/types';
import type { HistoryElement, NetworkName } from '@/interfaces';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { BalanceItem } from '@extension-base/api/evm/types';
import { isSoraHistoryElement, isTonEvent, TransactionType } from '@/interfaces';
import { FPNumber } from '@/lib/fpNumber';
import { firstCharToUp, isSora, isTonNetwork, findTokenBalanceByNetwork } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

export enum TransferType {
  Outgoing = 'outgoing',
  Incoming = 'incoming',
}

function getType(historyElement: HistoryElement, networkName?: NetworkName): TransactionType {
  if (isSora(networkName ?? '')) return TransactionType.sora;

  if (isTonNetwork(networkName ?? '')) return TransactionType.ton;

  const { transfer } = historyElement;

  if (transfer) return TransactionType.transfer;

  return TransactionType.reward;
}

function getSignTransfer(historyElement: HistoryElement, address: string, networkName: NetworkName) {
  const type = getType(historyElement, networkName);

  if (type === TransactionType.sora) {
    if (isSoraHistoryElement(historyElement)) {
      return historyElement.method === 'rewarded' ? '+' : '-';
    }

    return '-';
  }

  if (type === TransactionType.ton) {
    if (isTonEvent(historyElement)) {
      return historyElement.isOutEvent ? '-' : '+';
    }

    return '';
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

  if (type === TransactionType.ton) {
    if (isTonEvent(historyElement)) {
      return historyElement.isOutEvent ? TransferType.Outgoing : TransferType.Incoming;
    }

    return TransferType.Outgoing;
  }

  if (type === TransactionType.sora) {
    if (isSoraHistoryElement(historyElement)) {
      return historyElement.module;
    }

    return TransferType.Outgoing;
  }

  const signTransfer = getSignTransfer(historyElement, address, networkName);

  if (type === TransactionType.transfer) {
    return signTransfer === '+' ? TransferType.Incoming : TransferType.Outgoing;
  }

  // reward
  return firstCharToUp(type);
}

function getHumanFeeValue(value: string, networkName: NetworkName) {
  const accountsStore = useAccountsStore();
  const networksStore = useNetworksStore();
  const tokenBalances = accountsStore.balances;
  const network: NetworkJson = networksStore.getNetwork(networkName);
  const asset = network.assets.find((asset) => asset.isUtility);
  const token = tokenBalances.find((tokenGroup: TokenGroup) =>
    tokenGroup.balances.some((balanceItem: BalanceItem) => balanceItem.id === asset?.id)
  );
  const balance = findTokenBalanceByNetwork(token, networkName);
  const precision = balance?.precision ?? 0;

  return FPNumber.fromCodecValue(value, precision).toNumber();
}

function getHumanValue(value: string | number, assetId: string, networkName: NetworkName) {
  const accountsStore = useAccountsStore();
  const tokenBalances = accountsStore.balances;
  const token = tokenBalances.find((tokenGroup: TokenGroup) => tokenGroup.groupId === assetId);
  const balance = findTokenBalanceByNetwork(token, networkName);

  if (!balance) return 0;

  const { precision } = balance;

  return +FPNumber.fromCodecValue(value, precision);
}

function getHumanTransferFee(historyElement: HistoryElement, networkName: NetworkName) {
  const networksStore = useNetworksStore();
  const network: NetworkJson = networksStore.getNetwork(networkName);
  const historyType = network.externalApi?.history?.type;
  const type = getType(historyElement, networkName);

  if (type === TransactionType.sora) {
    if (!isSoraHistoryElement(historyElement)) return 0;

    return getHumanFeeValue(historyElement.networkFee, networkName);
  }

  if (type === TransactionType.ton) {
    if (!isTonEvent(historyElement)) return 0;

    return getHumanFeeValue(historyElement.networkFee, networkName);
  }

  const { transfer } = historyElement;

  if (type === TransactionType.transfer) {
    const { fee } = transfer!;

    if (fee === null) return 0;

    if (historyType === 'oklink' || historyType === 'etherscan') return +fee;

    return getHumanFeeValue(fee, networkName);
  }

  return 0;
}

function getHistoryValue(
  historyElement: HistoryElement,
  assetId: string,
  networkName: NetworkName,
  address: string,
  _withFee = false
) {
  const networksStore = useNetworksStore();
  const network: NetworkJson = networksStore.getNetwork(networkName);
  const historyType = network.externalApi?.history?.type;
  const signTransfer = getSignTransfer(historyElement, address, networkName);
  const type = getType(historyElement, networkName);
  const withFee = _withFee && signTransfer === '-';

  if (historyType === 'oklink') {
    const amount = historyElement.transfer?.amount ?? 0;
    const fee = historyElement.transfer?.fee ?? 0;

    if (withFee) return { signTransfer, value: +amount + +fee };

    return { signTransfer, value: +amount };
  }

  if (type === TransactionType.sora && isSoraHistoryElement(historyElement)) {
    const dataValue =
      historyElement.data?.value ??
      historyElement.data?.amount ??
      historyElement.data?.baseAssetAmount ??
      historyElement.data?.maxAdditional ??
      0;

    const targetValue = +(historyElement.data?.targetAssetAmount ?? 0);

    const fee = getHumanTransferFee(historyElement, networkName);

    const result = withFee && historyElement.method !== 'rewarded' ? +dataValue + fee : +dataValue;

    return { signTransfer, value: result, targetValue };
  }

  if (type === TransactionType.ton && isTonEvent(historyElement)) {
    const amount = historyElement.amount ?? historyElement.amountIn ?? 0;

    const value = getHumanValue(amount, assetId, networkName);

    return { signTransfer, value: value };
  }

  const { transfer, reward } = historyElement;

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

  return { signTransfer: '', value: 0 };
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
};
