// Copyright 2019-2022 @subwallet/extension-koni-base authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { SubmittableExtrinsic } from '@polkadot/api/types';
import { EventRecord } from '@polkadot/types/interfaces';
import {
  BasicTxResponse,
  ExternalRequestPromise,
  ApiProps,
  BasicTxErrorCode,
  ExternalRequestPromiseStatus,
} from '../../../background/types/types';
import { HandleBasicTx } from '../../evm/transfer';

interface SendExtrinsicProps {
  extrinsic: SubmittableExtrinsic<'promise'>;
  callback: HandleBasicTx;
  txState: BasicTxResponse;
  updateState?: (promise: Partial<ExternalRequestPromise>) => void;
  updateResponseTxResult?: (response: BasicTxResponse, records: EventRecord[]) => void;
  apiProps: ApiProps;
}

export const sendExtrinsic = async ({
  apiProps,
  callback,
  extrinsic,
  txState,
  updateResponseTxResult,
  updateState,
}: SendExtrinsicProps) => {
  const unsubscribe = await extrinsic.send((result) => {
    if (!result || !result.status) return;

    if (result.status.isInBlock || result.status.isFinalized) {
      txState.isFinalized = result.status.isFinalized;

      if (result.status.isBroadcast) updateResponseTxResult && updateResponseTxResult(txState, result.events);

      result.events
        .filter(({ event: { section } }) => section === 'system')
        .forEach(
          ({
            event: {
              method,
              data: [error],
            },
          }): void => {
            txState.extrinsicHash = extrinsic.hash.toHex();

            if (method === 'ExtrinsicFailed') {
              txState.status = false;

              txState.txError = true;

              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              if (error.isModule) {
                const api = apiProps.api;

                try {
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  const decoded = api.registry.findMetaError(error.asModule);
                  const { docs, method, section } = decoded;

                  const errorMessage = docs.join(' ');

                  console.info(`${section}.${method}: ${errorMessage}`);

                  txState.errors?.push({
                    code: BasicTxErrorCode.UNKNOWN_ERROR,
                    message: errorMessage,
                  });
                } catch (e) {
                  const errorMessage = error.toString();

                  txState.errors?.push({
                    code: BasicTxErrorCode.UNKNOWN_ERROR,
                    message: errorMessage,
                  });
                }
              } else {
                // Other, CannotLookup, BadOrigin, no extra info
                const errorMessage = error.toString();

                txState.errors?.push({
                  code: BasicTxErrorCode.UNKNOWN_ERROR,
                  message: errorMessage,
                });
              }

              callback(txState);
              updateState && updateState({ status: ExternalRequestPromiseStatus.FAILED });
            } else if (method === 'ExtrinsicSuccess') {
              txState.status = true;
              callback(txState);
              updateState && updateState({ status: ExternalRequestPromiseStatus.COMPLETED });
            }
          }
        );
    } else if (result.isError) {
      txState.txError = true;
      txState.status = false;
      callback(txState);
    }

    if (result.isInBlock) unsubscribe();
  });
};
