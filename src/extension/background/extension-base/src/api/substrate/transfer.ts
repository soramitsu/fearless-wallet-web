import { FPNumber } from '@sora-substrate/util';
import { state } from '@extension-base/background/handlers';
import { signAndSendExtrinsic } from '@extension-base/api/substrate/shared/signAndSendExtrinsic';
import { createExtrinsicTransfer } from '@extension-base/api/substrate/utils';
import { getUtilityProps, getSubstrateAddress } from '@extension-base/background/utils/utils';
import {
  BasicTxResponse,
  TransferErrorCode,
  SignerType,
  TokenBalance,
} from '@/extension/background/extension-base/src/background/types/types';
import { NetworkName } from '@/interfaces';

export async function estimateFee(
  networkKey: string,
  to: string,
  value: string | undefined,
  tokenBalance: TokenBalance
): Promise<number> {
  const apiProps = state.getSubstrateApiMap[networkKey];
  const api = apiProps.api;

  if (!api) return 0;

  await api.isReadyOrError;

  const extrinsic = createExtrinsicTransfer({
    amount: value,
    tokenBalance,
    to,
    networkKey,
  });

  if (!extrinsic) return 0;

  const { precision: utilityPrecision } = getUtilityProps(networkKey);

  try {
    const paymentInfo = await extrinsic.paymentInfo(to);
    const partialFee = paymentInfo ? +paymentInfo.partialFee : 0;
    const result = FPNumber.fromCodecValue(partialFee, utilityPrecision);

    return result.toNumber();
  } catch {
    return 0;
  }
}

export function getUnsupportedResponse(): BasicTxResponse {
  return {
    status: false,
    errors: [
      {
        code: TransferErrorCode.UNSUPPORTED,
        message: 'The transaction of current network is unsupported',
      },
    ],
  };
}

export interface MakeTransferProps {
  networkKey: NetworkName;
  to: string;
  from: string;
  amount: string;
  password: string | undefined;
  assetId: string;
  isSavePass?: boolean;
  callback: (data: BasicTxResponse) => void;
  isMobile: boolean;
}

export async function makeTransfer({
  from,
  networkKey,
  to,
  assetId,
  isSavePass,
  password,
  amount,
  callback,
  isMobile,
}: MakeTransferProps): Promise<void> {
  const txState: BasicTxResponse = {};
  const apiProps = state.getSubstrateApiMap[networkKey];

  await apiProps.api?.isReady;

  const address = getSubstrateAddress(from);
  const tokenBalance = state.balanceMap[address].find(({ assetId: _assetId }) => _assetId === assetId)!;

  const extrinsic = createExtrinsicTransfer({
    amount,
    tokenBalance,
    to,
    networkKey,
  });

  await signAndSendExtrinsic({
    type: isMobile ? SignerType.MOBILE : SignerType.PASSWORD,
    apiProps,
    callback,
    extrinsic,
    txState,
    password,
    isSavePass,
    address: from,
    errorMessage: 'error transfer',
  });
}
