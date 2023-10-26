import { BasicTxResponse, ApiProps } from '@extension-base/background/types/types';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import type { ExternalRequestPromise } from '@extension-base/background/types/types';
import type { HandleBasicTx } from '@extension-base/api/evm/transfer';
import type { EventRecord } from '@polkadot/types/interfaces';

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
      txState.status = true;

      callback(txState);
      unsubscribe();
    } else if (result.isError) {
      txState.status = false;

      callback(txState);
    }
  });
};
