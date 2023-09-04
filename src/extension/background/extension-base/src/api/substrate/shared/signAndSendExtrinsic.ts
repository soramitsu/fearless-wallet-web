// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { sendExtrinsic } from '@extension-base/api/substrate/shared/sendExtrinsic';
import { signExtrinsic } from '@extension-base/api/substrate/shared/signExtrinsic';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import type { EventRecord } from '@polkadot/types/interfaces';
import type { HandleBasicTx } from '@extension-base/api/evm/transfer';
import type {
  ApiProps,
  BasicTxResponse,
  PrepareExternalRequest,
  SignerType,
} from '@/extension/background/extension-base/src/background/types';
import { BasicTxErrorCode } from '@/extension/background/extension-base/src/background/types';
interface AbstractSignAndSendExtrinsicProps extends Partial<PrepareExternalRequest> {
  extrinsic: Nullable<SubmittableExtrinsic<'promise'>>;
  callback: HandleBasicTx;
  txState: BasicTxResponse;
  address: string;
  type: SignerType;
  errorMessage: string;
  apiProps: ApiProps;
  isSavePass?: boolean;
  password?: string;
  updateResponseTxResult?: (response: BasicTxResponse, records: EventRecord[]) => void;
}

interface PasswordSignAndSendExtrinsicProps extends AbstractSignAndSendExtrinsicProps {
  type: SignerType.PASSWORD;
}

interface ExternalSignAndSendExtrinsicProps extends AbstractSignAndSendExtrinsicProps {
  type: SignerType.MOBILE;
}

type SignAndSendExtrinsicProps = ExternalSignAndSendExtrinsicProps | PasswordSignAndSendExtrinsicProps;

export const signAndSendExtrinsic = async ({
  address,
  apiProps,
  callback,
  errorMessage,
  extrinsic,
  password,
  txState,
  type,
}: SignAndSendExtrinsicProps) => {
  if (!extrinsic) {
    txState.txError = true;
    txState.status = false;

    callback(txState);

    return;
  }

  try {
    const passwordError = await signExtrinsic({
      address,
      apiProps,
      callback,
      extrinsic,
      password,
      type,
    });

    if (passwordError) {
      txState.passwordError = passwordError;

      callback(txState);

      return;
    }
  } catch (e: unknown) {
    if (e) {
      console.error(errorMessage, e);
      txState.errors = [{ code: BasicTxErrorCode.KEYRING_ERROR, message: (e as Error).message }];
      txState.txError = true;
      txState.status = false;
      callback(txState);
    }

    return;
  }

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

    txState.txError = true;
    txState.status = false;

    callback(txState);
  }
};
