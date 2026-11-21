import { TransferErrorCode, type BasicTxResponse, type ApiProps } from '@extension-base/background/types/types';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import type { HandleBasicTx } from '@extension-base/api/evm/transfer';
import { CROSS_CHAIN_EXTRINSIC_INVALID, sendAndTrackExtrinsic, type TrackableExtrinsic } from '@/cross-chain/trackedSend';

interface SendExtrinsicProps {
  extrinsic: SubmittableExtrinsic<'promise'>;
  callback?: HandleBasicTx;
  txState: BasicTxResponse;
  isSavePass?: boolean;
  apiProps: ApiProps;
}

/** Long enough for inclusion on a slow parachain; after it the send is reported unknown, never failed. */
export const SUBSTRATE_SEND_TIMEOUT_MS = 120_000;

/**
 * Answers once the outcome is known, as the cross-chain send does. A broadcast extrinsic can still fail at dispatch
 * (an amount below the existential deposit or the asset's minimum balance) with the fee charged, so success needs a
 * block without a dispatch error. What the node took may still be included: a lost subscription, a timeout or a pool
 * verdict is unknown, with the hash. Only an explicit refusal at submission throws, as before.
 */
export const sendExtrinsic = async ({ callback, extrinsic, txState }: SendExtrinsicProps) => {
  const outcome = await sendAndTrackExtrinsic(extrinsic as unknown as TrackableExtrinsic, {
    timeoutMs: SUBSTRATE_SEND_TIMEOUT_MS,
  });

  // The node refused it outright: nothing was sent.
  if (outcome.kind === 'failed' && !outcome.included && outcome.reason !== CROSS_CHAIN_EXTRINSIC_INVALID)
    throw new Error(outcome.reason);

  if (outcome.kind === 'included') txState.status = true;
  else if (outcome.kind === 'failed' && outcome.included) {
    txState.status = false;
    txState.errors = [{ code: TransferErrorCode.TRANSFER_ERROR, message: outcome.reason }];
  } else {
    // A pool Invalid proves nothing either (see CROSS_CHAIN_EXTRINSIC_INVALID), and unlike the cross-chain send nothing
    // here holds back a second send while the first may still land.
    txState.status = false;
    txState.outcome = 'unknown';
    txState.transactionHash = outcome.hash;
    txState.errors = [{ code: TransferErrorCode.TRANSFER_ERROR, message: outcome.reason }];
  }

  callback?.(txState);
};
