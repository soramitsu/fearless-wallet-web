// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { SubmittableExtrinsic } from '@polkadot/api/types';
import { EventRecord } from '@polkadot/types/interfaces';
import {
  ApiProps,
  BasicTxErrorCode,
  BasicTxResponse,
  ExternalRequestPromise,
  PrepareExternalRequest,
  SignerType,
} from '../../../background/types/types';
import { lockAccount } from '../../../utils/keyring';
import { HandleBasicTx } from '../../evm/transfer';
import { sendExtrinsic } from './sendExtrinsic';
import { signExtrinsic } from './signExtrinsic';

interface AbstractSignAndSendExtrinsicProps extends Partial<PrepareExternalRequest> {
  extrinsic: SubmittableExtrinsic<'promise'> | null;
  callback: HandleBasicTx;
  txState: BasicTxResponse;
  address: string;
  type: SignerType;
  errorMessage: string;
  apiProps: ApiProps;
  password?: string;
  updateResponseTxResult?: (response: BasicTxResponse, records: EventRecord[]) => void;
}

interface PasswordSignAndSendExtrinsicProps extends AbstractSignAndSendExtrinsicProps {
  type: SignerType.PASSWORD;
}

interface ExternalSignAndSendExtrinsicProps extends AbstractSignAndSendExtrinsicProps {
  id: string;
  setState: (promise: ExternalRequestPromise) => void;
  updateState: (promise: Partial<ExternalRequestPromise>) => void;
  type: SignerType.PASSWORD;
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
  updateResponseTxResult,
  updateState,
}: SignAndSendExtrinsicProps) => {
  if (extrinsic === null) {
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
      apiProps: apiProps,
      callback: callback,
      extrinsic: extrinsic,
      txState: txState,
      updateResponseTxResult: updateResponseTxResult,
      updateState: updateState,
    });

    if (type === SignerType.PASSWORD) lockAccount(address);
  } catch (e) {
    console.error(errorMessage, e);

    if (
      (e as Error).message.includes('Invalid Transaction: Inability to pay some fees , e.g. account balance too low')
    ) {
      txState.errors = [{ code: BasicTxErrorCode.BALANCE_TO_LOW, message: (e as Error).message }];
    } else {
      txState.errors = [{ code: BasicTxErrorCode.INVALID_PARAM, message: (e as Error).message }];
    }

    txState.txError = true;
    txState.status = false;
    callback(txState);
  }
};
