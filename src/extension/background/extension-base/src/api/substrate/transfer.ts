import { FPNumber } from '@sora-substrate/util';
import { signAndSendExtrinsic } from '@extension-base/api/substrate/shared/signAndSendExtrinsic';
import { createExtrinsicTransfer } from '@extension-base/api/substrate/utils';
import { getUtilityProps, getSubstrateAddress } from '@extension-base/background/utils/utils';
import { BasicTxResponse, TransferErrorCode, SignerType, TokenBalance } from '@extension-base/background/types/types';
import State from '@extension-base/background/handlers/State';
import { NetworkName } from '@/interfaces';

export async function estimateFee(
  networkKey: string,
  to: string,
  value: string | undefined,
  tokenBalance: TokenBalance,
  state: State
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
    api,
    assetsMap: state.assetsMap,
  });

  if (!extrinsic) return 0;

  const { precision: utilityPrecision } = getUtilityProps(networkKey, state);

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

export interface MakeTransferParams {
  networkKey: NetworkName;
  to: string;
  from: string;
  amount: string;
  password: string;
  assetId: string;
  isSavePass?: boolean;
  callback: (data: BasicTxResponse) => void;
  isMobile: boolean;
  state: State;
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
  state,
}: MakeTransferParams): Promise<void> {
  const txState: BasicTxResponse = {};
  const apiProps = state.getSubstrateApiMap[networkKey];
  const api = apiProps.api;

  if (!api) return;

  await api?.isReady;

  const address = getSubstrateAddress(from, state);
  const tokenBalance = state.balanceMap[address].find(({ assetId: _assetId }) => _assetId === assetId)!;

  const extrinsic = createExtrinsicTransfer({
    amount,
    tokenBalance,
    to,
    networkKey,
    api,
    assetsMap: state.assetsMap,
  });

  await signAndSendExtrinsic(
    {
      type: isMobile ? SignerType.MOBILE : SignerType.PASSWORD,
      apiProps,
      callback,
      extrinsic,
      txState,
      password,
      isSavePass,
      address: from,
      errorMessage: 'error transfer',
    },
    state
  );
}
