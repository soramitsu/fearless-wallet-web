import { sendExtrinsic } from '@extension-base/api/substrate/shared/sendExtrinsic';
import { signExtrinsic } from '@extension-base/api/substrate/shared/signExtrinsic';
import { BasicTxErrorCode } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import type { ApiProps, BasicTxResponse, PrepareExternalRequest } from '@extension-base/background/types/types';

import type { SubmittableExtrinsic } from '@polkadot/api/types';
import type { HandleBasicTx } from '@extension-base/api/evm/transfer';

interface SignAndSendExtrinsicProps extends Partial<PrepareExternalRequest> {
  extrinsic: Nullable<SubmittableExtrinsic<'promise'>>;
  callback?: HandleBasicTx;
  txState?: BasicTxResponse;
  address: string;
  errorMessage: string;
  apiProps: ApiProps;
  isMobile: boolean;
}

export const signAndSendExtrinsic = async (
  { address, apiProps, callback, errorMessage, extrinsic, txState = {}, isMobile }: SignAndSendExtrinsicProps,
  state: State
) => {
  if (!extrinsic) {
    txState.status = false;

    callback?.(txState);

    return;
  }

  await signExtrinsic(
    {
      address,
      apiProps,
      extrinsic,
      isMobile,
    },
    state
  );

  try {
    await sendExtrinsic({
      apiProps,
      callback,
      extrinsic,
      txState,
    });
  } catch (e) {
    console.error(errorMessage, e);

    if ((e as Error).message.includes('Invalid Transaction: Inability to pay some fees , e.g. account balance too low'))
      txState.errors = [{ code: BasicTxErrorCode.BALANCE_TO_LOW, message: (e as Error).message }];
    else txState.errors = [{ code: BasicTxErrorCode.INVALID_PARAM, message: (e as Error).message }];

    txState.status = false;

    callback?.(txState);
  }
};
