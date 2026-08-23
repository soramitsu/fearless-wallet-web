import { FPNumber } from '@sora-substrate/util';
import { BasicTxErrorCode } from '@extension-base/background/types/types';
import type { BasicTxError, RequestSwap, TokenGroup } from '@extension-base/background/types/types';
import { SORA_NETWORK_NAME, SORA_XOR_ASSET_ID } from '@/consts/sora';

type RuntimeAccountAsset = {
  address: string;
  decimals: number;
  balance: { transferable: string };
};

const decimal = (value: unknown): FPNumber | null => {
  try {
    const amount = new FPNumber(String(value ?? ''));
    return amount.isFinity() && amount.isGteZero() ? amount : null;
  } catch {
    return null;
  }
};

const soraBalance = (groups: TokenGroup[], groupId: string) =>
  groups
    .find((group) => group.groupId === groupId)
    ?.balances.find(({ name }) => name.toLowerCase() === SORA_NETWORK_NAME);

export function validatePolkaswapExecution({
  balances,
  networkFee,
  request,
}: {
  balances: TokenGroup[];
  networkFee: string;
  request: RequestSwap;
}): BasicTxError | null {
  if (request.network.toLowerCase() !== SORA_NETWORK_NAME || request.assetAId === request.assetBId) {
    return { code: BasicTxErrorCode.INVALID_PARAM, message: 'Select two exact SORA assets.' };
  }

  const source = soraBalance(balances, request.assetAId);
  const destination = soraBalance(balances, request.assetBId);
  if (!source || !destination) {
    return { code: BasicTxErrorCode.INVALID_PARAM, message: 'The selected SORA asset is no longer available.' };
  }

  const sourceAmount = decimal(request.amountA);
  const sourceAvailable = decimal(source.transferable);
  const fee = decimal(networkFee);
  if (!sourceAmount?.isGreaterThan(FPNumber.ZERO) || !sourceAvailable || !fee?.isGreaterThan(FPNumber.ZERO)) {
    return { code: BasicTxErrorCode.INVALID_PARAM, message: 'Refresh the SORA quote and current network fee.' };
  }

  const xor = balances
    .flatMap(({ balances: groupBalances }) => groupBalances)
    .find(
      ({ id, name }) =>
        id.toLowerCase() === SORA_XOR_ASSET_ID.toLowerCase() && name.toLowerCase() === SORA_NETWORK_NAME
    );
  const xorAvailable = decimal(xor?.transferable);
  if (!xorAvailable || xorAvailable.lt(fee)) {
    return { code: BasicTxErrorCode.BALANCE_TO_LOW, message: 'Add enough XOR to pay the current SORA network fee.' };
  }

  const sourceRequired = source.id.toLowerCase() === SORA_XOR_ASSET_ID.toLowerCase()
    ? sourceAmount.add(fee)
    : sourceAmount;
  if (sourceAvailable.lt(sourceRequired)) {
    return { code: BasicTxErrorCode.BALANCE_TO_LOW, message: 'The selected SORA asset balance is insufficient.' };
  }

  return null;
}

export function validateAuthoritativePolkaswapExecution({
  source,
  destination,
  xor,
  sourceAddress,
  destinationAddress,
  sourceAmount,
  networkFee,
}: {
  source: RuntimeAccountAsset;
  destination: RuntimeAccountAsset;
  xor: RuntimeAccountAsset;
  sourceAddress: string;
  destinationAddress: string;
  sourceAmount: string;
  networkFee: string;
}): BasicTxError | null {
  if (
    !sourceAddress ||
    !destinationAddress ||
    sourceAddress.toLowerCase() === destinationAddress.toLowerCase() ||
    source.address.toLowerCase() !== sourceAddress.toLowerCase() ||
    destination.address.toLowerCase() !== destinationAddress.toLowerCase() ||
    xor.address.toLowerCase() !== SORA_XOR_ASSET_ID.toLowerCase()
  ) {
    return { code: BasicTxErrorCode.INVALID_PARAM, message: 'The selected SORA asset identity changed.' };
  }

  try {
    const amount = decimal(sourceAmount);
    const fee = decimal(networkFee);
    const sourceAvailable = FPNumber.fromCodecValue(source.balance.transferable, source.decimals);
    const xorAvailable = FPNumber.fromCodecValue(xor.balance.transferable, xor.decimals);

    if (
      !amount?.isGreaterThan(FPNumber.ZERO) ||
      !fee?.isGreaterThan(FPNumber.ZERO) ||
      !sourceAvailable.isFinity() ||
      !sourceAvailable.isGteZero() ||
      !xorAvailable.isFinity() ||
      !xorAvailable.isGteZero()
    ) {
      return { code: BasicTxErrorCode.INVALID_PARAM, message: 'Refresh the SORA quote and current network fee.' };
    }
    if (xorAvailable.lt(fee)) {
      return { code: BasicTxErrorCode.BALANCE_TO_LOW, message: 'Add enough XOR to pay the current SORA network fee.' };
    }

    const required = sourceAddress.toLowerCase() === SORA_XOR_ASSET_ID.toLowerCase()
      ? amount.add(fee)
      : amount;
    if (sourceAvailable.lt(required)) {
      return { code: BasicTxErrorCode.BALANCE_TO_LOW, message: 'The selected SORA asset balance is insufficient.' };
    }

    return null;
  } catch {
    return { code: BasicTxErrorCode.INVALID_PARAM, message: 'Refresh the authoritative SORA balances.' };
  }
}
