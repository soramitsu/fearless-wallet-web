import type { ReviewedCrossChainExecution } from '@/cross-chain/reviewedRoutes';

/** The part of a Result codec that the dry-run check reads. */
type DryRunOutcome = {
  isOk: boolean;
  asOk: { executionResult: { isOk: boolean } };
};

export type DryRunApi = {
  call?: {
    dryRunApi?: {
      dryRunCall?: (origin: unknown, call: unknown, resultXcmsVersion: number) => Promise<DryRunOutcome>;
    };
  };
};

// Version of the forwarded messages in the dry-run result. The check does not read them, and 4 is accepted by every
// runtime that has the API, so an older origin runtime is not turned away over a version it does not offer.
const RESULT_XCMS_VERSION = 4;

/**
 * Executes the extrinsic against the origin runtime's current state without submitting it, and refuses the quote when
 * the dispatch fails.
 *
 * The reviewed-runtime check only compares pallet, call and argument names, which did not change when the Asset Hub
 * Migration made relay reserve transfers fail with Filtered / InvalidAssetUnknownReserve. Running the call is the only
 * check that notices a change in what a call does. It applies to relay-native XCM, whose origins (the relay chains) all
 * expose the dry-run API; bridge origins such as SORA do not, and keep their own authority checks.
 *
 * It does not simulate the destination side, so a destination minimum still has to be enforced by the reviewed floor.
 */
export async function assertOriginExecutes(
  execution: Readonly<ReviewedCrossChainExecution>,
  api: DryRunApi,
  extrinsic: { method: unknown },
  signer: string
): Promise<void> {
  if (execution.kind !== 'relay-native-xcm-v3') return;

  const dryRunApi = api.call?.dryRunApi;
  if (typeof dryRunApi?.dryRunCall !== 'function') throw new Error('cross_chain_dry_run_unavailable');

  let outcome: DryRunOutcome;
  try {
    // Called on its holder, as polkadot-js runtime-call helpers are.
    outcome = await dryRunApi.dryRunCall({ system: { Signed: signer } }, extrinsic.method, RESULT_XCMS_VERSION);
  } catch {
    throw new Error('cross_chain_dry_run_unavailable');
  }

  if (!outcome.isOk || !outcome.asOk.executionResult.isOk) throw new Error('cross_chain_dry_run_failed');
}
