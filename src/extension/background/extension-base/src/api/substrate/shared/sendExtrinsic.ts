// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { SubmittableExtrinsic } from '@polkadot/api/types';
import { EventRecord } from '@polkadot/types/interfaces';

import { BasicTxResponse, ExternalRequestPromise, ApiProps } from '../../../background/types/types';
import { HandleBasicTx } from '../../evm/transfer';

interface SendExtrinsicProps {
  extrinsic: SubmittableExtrinsic<'promise'>;
  callback: HandleBasicTx;
  txState: BasicTxResponse;
  isSavePass?: boolean;
  updateState?: (promise: Partial<ExternalRequestPromise>) => void;
  updateResponseTxResult?: (response: BasicTxResponse, records: EventRecord[]) => void;
  apiProps: ApiProps;
}

export const sendExtrinsic = async ({ callback, extrinsic, txState }: SendExtrinsicProps) => {
  const unsubscribe = await extrinsic.send((result) => {
    if (!result || !result.status) return;

    if (result.status.isBroadcast) {
      txState.isFinalized = true;
      txState.status = true;

      callback(txState);
    } else if (result.isError) {
      txState.txError = true;
      txState.status = false;

      callback(txState);
    }

    if (result.status.isBroadcast) unsubscribe();
  });
};
