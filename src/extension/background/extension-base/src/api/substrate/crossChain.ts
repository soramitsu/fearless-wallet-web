import { FPNumber } from '@sora-substrate/util';
import { signExtrinsic } from '@extension-base/api/substrate/shared/signExtrinsic';
import { getPrecisionValue } from '@extension-base/api/substrate';
import { BasicTxErrorCode, TransferErrorCode, type BasicTxResponse } from '@extension-base/background/types/types';
import { storage } from '@extension-base/stores/Storage';
import type { CrossChainProps, MakeCrossChainProps } from '@extension-base/api/substrate/types';
import type State from '@extension-base/background/handlers/State';
import type { KeyringPair } from '@subwallet/keyring/types';
import { getUtilityProps } from '@/extension/background/extension-base/src/background/handlers/utils';
import {
  createReviewedCrossChainExtrinsic,
  createReviewedExecutionFingerprint,
  resolveReviewedRuntimeCall,
  type ReviewedExecutionApi,
} from '@/cross-chain/reviewedExecution';
import { assertReviewedRuntimeAuthority } from '@/cross-chain/reviewedRuntimeAuthority';
import { assertOriginExecutes, type DryRunApi } from '@/cross-chain/originDryRun';
import { validateReviewedCrossChainRequest } from '@/cross-chain/requestValidation';
import { createCrossChainQuoteFingerprint } from '@/cross-chain/quoteFingerprint';
import { connectedSubstrateApi } from '@/cross-chain/runtimeConnection';
import {
  normalizeExtrinsicHash,
  sendAndTrackExtrinsic,
  type TrackableExtrinsic,
  type TrackedSendOutcome,
} from '@/cross-chain/trackedSend';
import {
  CrossChainPreviousSendUnresolvedError,
  CrossChainSendLedger,
  type CrossChainSendRecord,
  type CrossChainSendResolutionApi,
} from '@/cross-chain/sendLedger';

export type CrossChainQuote = {
  originFee: FPNumber;
  destinationFee: FPNumber;
  minimum: FPNumber;
  runtimeFingerprint: string;
  executionFingerprint: string;
  extrinsic: NonNullable<Awaited<ReturnType<typeof createReviewedCrossChainExtrinsic>>['extrinsic']>;
};

/** Cross-chain sends whose outcome is not known yet, kept in wallet storage across background restarts. */
export const crossChainSendLedger = new CrossChainSendLedger({
  load: async () => (await storage.get(['crossChainSendsInDoubt'])).crossChainSendsInDoubt,
  save: (records) => storage.set({ crossChainSendsInDoubt: records }),
});

function maximum(left: FPNumber, right: FPNumber): FPNumber {
  return left.gte(right) ? left : right;
}

export function assertCrossChainSignerCapability(pair: KeyringPair | null, isMobile: boolean): void {
  if (!pair) throw new Error('cross_chain_signable_account_required');

  const meta = pair.meta ?? {};
  if (isMobile) {
    if (meta.isMobile !== true) throw new Error('cross_chain_mobile_signer_mismatch');
  } else if (meta.isExternal || meta.isInjected || meta.isHardware || meta.isMobile) {
    throw new Error('cross_chain_signable_account_required');
  }
}

export async function refreshCrossChainOriginBalance(
  { from, originNet }: Pick<CrossChainProps, 'from' | 'originNet'>,
  state: State
): Promise<void> {
  const address = state.keyringService.getSubstrateAddress(from);
  const network = state.networkService.networkMap[originNet];
  if (!network) throw new Error('cross_chain_network_unavailable');

  const api = (await connectedSubstrateApi(state, network)) as { isReadyOrError: Promise<unknown> };
  await api.isReadyOrError;

  await state.balanceService.substrateBalanceService.fetchBalance({
    address,
    networks: [originNet],
  });
}

function assertReviewedRouteAndAccount(props: MakeCrossChainProps, state: State) {
  const substrateAddress = state.keyringService.getSubstrateAddress(props.from);
  const selectedAddress = state.keyringService.getSubstrateAddress(state.getAccountAddress());
  const currentPair = state.keyringService.getPair(substrateAddress);
  const selectedPair = state.keyringService.getPair(selectedAddress);
  if (currentPair !== props.capturedPair || selectedPair !== props.capturedPair) {
    throw new Error('cross_chain_selected_account_changed');
  }
  assertCrossChainSignerCapability(currentPair, props.isMobile);

  const tokenBalance = state.balanceService.getTokenBalance(substrateAddress, props.assetId, props.relayChain);
  const validation = validateReviewedCrossChainRequest({
    routeId: props.routeId,
    providerId: props.routeProviderId,
    assetKey: props.assetKey,
    assetId: props.assetId,
    origin: state.networkService.networkMap[props.originNet],
    destination: state.networkService.networkMap[props.destinationNet],
    tokenBalance,
    amount: props.amount,
    to: props.to,
    requireAmount: true,
  });
  if (!state.actionCapabilityService.isActionEnabled(validation.action)) {
    throw new Error('cross_chain_provider_temporarily_disabled');
  }
  if (
    validation.xcmAssetId !== props.xcmAssetId ||
    JSON.stringify(validation.execution) !== JSON.stringify(props.execution) ||
    validation.minimum !== props.reviewedMinimum
  ) {
    throw new Error('cross_chain_route_fingerprint_changed');
  }

  const apiProps = state.getSubstrateApiMap[props.originNet.toLowerCase()];
  if (!apiProps?.api || apiProps.api.isConnected === false) throw new Error('cross_chain_runtime_unavailable');

  return { apiProps, tokenBalance, validation };
}

function parseExpected(value: string, error: string): FPNumber {
  // FPNumber reads an empty string as zero; a missing confirmation is not a confirmed zero fee.
  if (typeof value !== 'string' || !value.trim()) throw new Error(error);

  try {
    const parsed = new FPNumber(value);
    if (!parsed.isFinity() || !parsed.isGteZero()) throw new Error(error);

    return parsed;
  } catch {
    throw new Error(error);
  }
}

function assertConfirmedQuote(props: MakeCrossChainProps, quote: CrossChainQuote, state: State): void {
  const expectedOriginFee = parseExpected(props.expectedOriginFee, 'cross_chain_fee_confirmation_required');
  const expectedDestinationFee = parseExpected(
    props.expectedDestinationFee,
    'cross_chain_destination_fee_confirmation_required'
  );
  if (!quote.originFee.eq(expectedOriginFee)) throw new Error('cross_chain_fee_changed');
  if (!quote.destinationFee.eq(expectedDestinationFee)) throw new Error('cross_chain_destination_fee_changed');
  if (quote.executionFingerprint !== props.expectedExecutionFingerprint) {
    throw new Error('cross_chain_runtime_fingerprint_changed');
  }

  const amount = new FPNumber(props.amount);
  if (amount.lt(quote.minimum)) throw new Error('cross_chain_amount_below_runtime_minimum');

  const substrateAddress = state.keyringService.getSubstrateAddress(props.from);
  const utility = getUtilityProps(props.originNet, state);
  const utilityGroup = state.balanceService.getTokenBalance(substrateAddress, utility.id, props.relayChain);
  const rows = utilityGroup?.balances.filter(({ name }) => name.toLowerCase() === props.originNet.toLowerCase()) ?? [];
  if (rows.length !== 1) throw new Error('cross_chain_fee_balance_unavailable');

  const available = new FPNumber(rows[0].transferable ?? '');
  const required = utility.id === props.assetId ? amount.add(quote.originFee) : quote.originFee;
  if (!available.isFinity() || !available.isGteZero() || available.lt(required)) {
    throw new Error('cross_chain_fee_balance_insufficient');
  }
}

function assertRuntimeFingerprint(props: MakeCrossChainProps, quote: CrossChainQuote, api: ReviewedExecutionApi): void {
  const { descriptor } = resolveReviewedRuntimeCall(props.execution, api);
  const current = createReviewedExecutionFingerprint(props.execution, descriptor, api);

  if (current !== quote.runtimeFingerprint) throw new Error('cross_chain_runtime_fingerprint_changed');
}

export async function estimateCrossChainQuote(props: CrossChainProps, state: State): Promise<CrossChainQuote> {
  const { execution, originNet, destinationNet, xcmAssetId } = props;
  const origin = state.networkService.networkMap[originNet];
  const destination = state.networkService.networkMap[destinationNet];
  if (!origin || !destination) throw new Error('cross_chain_network_unavailable');

  const { originApi, runtimeMinimum } = await assertReviewedRuntimeAuthority(execution, state);
  const precisionAmount = getPrecisionValue(props.amount, execution.assetPrecision);
  const substrateAddress = state.keyringService.getSubstrateAddress(props.from);
  const resolved = await createReviewedCrossChainExtrinsic({
    execution,
    originChainId: String(origin.chainId),
    destinationChainId: String(destination.chainId),
    xcmAssetId,
    to: props.to,
    precisionAmount,
    api: originApi,
  });
  if (!resolved.extrinsic) throw new Error('cross_chain_runtime_execution_drift');
  await assertOriginExecutes(execution, originApi as unknown as DryRunApi, resolved.extrinsic, substrateAddress);

  const paymentInfo = await resolved.extrinsic.paymentInfo(substrateAddress);
  const utility = getUtilityProps(originNet, state);
  const originFee = FPNumber.fromCodecValue(paymentInfo.partialFee.toString(), utility.precision);
  if (!originFee.isFinity() || !originFee.isGteZero()) throw new Error('cross_chain_fee_unavailable');

  const reviewedMinimum = new FPNumber(props.reviewedMinimum ?? '0');
  const minimum = maximum(reviewedMinimum, new FPNumber(runtimeMinimum));
  const amount = new FPNumber(props.amount);
  if (!minimum.isFinity() || !minimum.isGteZero()) throw new Error('cross_chain_runtime_minimum_unavailable');
  if (amount.lt(minimum)) throw new Error('cross_chain_amount_below_runtime_minimum');

  return {
    originFee,
    destinationFee: new FPNumber(execution.destinationFee),
    minimum,
    runtimeFingerprint: resolved.executionFingerprint,
    executionFingerprint: createCrossChainQuoteFingerprint({
      props,
      originChainId: String(origin.chainId),
      destinationChainId: String(destination.chainId),
      substrateAddress,
      precisionAmount,
      runtimeFingerprint: resolved.executionFingerprint,
    }),
    extrinsic: resolved.extrinsic,
  };
}

export async function estimateCrossChainFee(props: CrossChainProps, state: State): Promise<[FPNumber, FPNumber]> {
  const quote = await estimateCrossChainQuote(props, state);

  return [quote.originFee, quote.destinationFee];
}

/**
 * Refuses a send while an earlier send of the same route from the same account may still be included. A previous send
 * whose nonce was used is reported once, with its hash, and then forgotten: it is final, and the user must check it
 * before sending again.
 */
export async function assertNoUnresolvedCrossChainSend(
  { address, routeId }: { address: string; routeId: string },
  api: unknown,
  ledger: CrossChainSendLedger = crossChainSendLedger
): Promise<void> {
  const previous = await ledger.inspect(address, routeId, api as CrossChainSendResolutionApi);
  if (previous.state === 'none') return;
  if (previous.state === 'consumed') await ledger.clear(address, routeId, previous.record.hash);

  throw new CrossChainPreviousSendUnresolvedError(previous.record.hash);
}

/**
 * What the transfer form checks before it offers to send: no send of this account is running and no earlier send of
 * this route may still be included. A previous send that is already final is reported by the send itself.
 */
export async function assertCrossChainSendAvailable(
  { address, routeId }: { address: string; routeId: string },
  api: unknown,
  ledger: CrossChainSendLedger = crossChainSendLedger
): Promise<void> {
  if (ledger.isSending(address)) throw new Error('cross_chain_send_in_progress');

  const previous = await ledger.inspect(address, routeId, api as CrossChainSendResolutionApi);
  if (previous.state === 'pending') throw new Error('cross_chain_previous_send_unresolved');
}

type SignedExtrinsic = CrossChainQuote['extrinsic'];

async function sendRecordFor(
  props: MakeCrossChainProps,
  address: string,
  extrinsic: SignedExtrinsic,
  api: CrossChainSendResolutionApi
): Promise<CrossChainSendRecord> {
  let expiresAtBlock: number | null = null;

  if (extrinsic.era.isMortalEra) {
    try {
      // The signing header is at or before this head, so the extrinsic dies no later than one period after it.
      const head = (await api.rpc.chain.getHeader()).number.toNumber();
      expiresAtBlock = head + extrinsic.era.asMortalEra.period.toNumber();
    } catch {
      // Without a head the record is resolved by the nonce alone.
    }
  }

  return {
    address,
    routeId: props.routeId,
    originNet: props.originNet,
    nonce: extrinsic.nonce.toNumber(),
    hash: normalizeExtrinsicHash(extrinsic.hash.toHex()),
    expiresAtBlock,
    recordedAt: Date.now(),
  };
}

export function crossChainSendResponse(outcome: TrackedSendOutcome): BasicTxResponse {
  if (outcome.kind === 'included') return { status: true, transactionHash: outcome.hash };

  if (outcome.kind === 'failed') {
    return {
      status: false,
      // Only an extrinsic that reached a block has a hash worth looking up.
      ...(outcome.included ? { transactionHash: outcome.hash } : {}),
      errors: [
        {
          code: outcome.reason.includes('Inability to pay some fees')
            ? BasicTxErrorCode.BALANCE_TO_LOW
            : TransferErrorCode.CROSSCHAIN_ERROR,
          message: outcome.reason,
        },
      ],
    };
  }

  return {
    status: false,
    outcome: 'unknown',
    transactionHash: outcome.hash,
    errors: [{ code: TransferErrorCode.CROSSCHAIN_ERROR, message: outcome.reason }],
  };
}

/**
 * Signs and sends one reviewed cross-chain transfer and resolves with its outcome, which is also passed to the
 * callback: included (with the hash), failed, or unknown (with the hash) when it may still be included. One send runs
 * per account at a time, and a route whose previous send is unresolved is refused.
 */
export async function makeCrossChain(
  props: MakeCrossChainProps,
  state: State,
  ledger: CrossChainSendLedger = crossChainSendLedger
): Promise<BasicTxResponse> {
  const address = state.keyringService.getSubstrateAddress(props.from);
  const release = ledger.beginSend(address);

  try {
    return await signAndTrackCrossChain(props, state, address, ledger);
  } finally {
    release();
  }
}

async function signAndTrackCrossChain(
  props: MakeCrossChainProps,
  state: State,
  address: string,
  ledger: CrossChainSendLedger
): Promise<BasicTxResponse> {
  const { isMobile, callback } = props;

  await refreshCrossChainOriginBalance(props, state);
  const initial = assertReviewedRouteAndAccount(props, state);
  await initial.apiProps.api?.isReady;
  await assertNoUnresolvedCrossChainSend({ address, routeId: props.routeId }, initial.apiProps.api, ledger);
  const initialQuote = await estimateCrossChainQuote(props, state);
  assertConfirmedQuote(props, initialQuote, state);
  let guardedQuote = initialQuote;

  const syncFinalGuard = () => {
    const current = assertReviewedRouteAndAccount(props, state);
    if (current.apiProps !== initial.apiProps) throw new Error('cross_chain_runtime_changed');
    assertConfirmedQuote(props, guardedQuote, state);
    assertRuntimeFingerprint(props, guardedQuote, current.apiProps.api as unknown as ReviewedExecutionApi);
  };

  syncFinalGuard();
  if (!isMobile && !state.keyringService.unlockPair(props.capturedPair)) {
    throw new Error('cross_chain_account_unlock_failed');
  }

  await refreshCrossChainOriginBalance(props, state);
  const current = assertReviewedRouteAndAccount(props, state);
  if (current.apiProps !== initial.apiProps) throw new Error('cross_chain_runtime_changed');
  const finalQuote = await estimateCrossChainQuote(props, state);
  assertConfirmedQuote(props, finalQuote, state);
  if (finalQuote.executionFingerprint !== initialQuote.executionFingerprint) {
    throw new Error('cross_chain_runtime_fingerprint_changed');
  }
  guardedQuote = finalQuote;
  syncFinalGuard();

  const { extrinsic } = finalQuote;
  await signExtrinsic({ address, apiProps: initial.apiProps, extrinsic, isMobile, finalGuard: syncFinalGuard }, state);

  // Written before the extrinsic leaves the wallet; without it the send does not happen.
  const record = await sendRecordFor(props, address, extrinsic, initial.apiProps.api as unknown as CrossChainSendResolutionApi);
  await ledger.record(record);

  const outcome = await sendAndTrackExtrinsic(extrinsic as unknown as TrackableExtrinsic);
  if (outcome.kind !== 'unknown') {
    await ledger.clear(address, props.routeId, record.hash).catch((error: unknown) => {
      // The record stays and is resolved from the chain on the next send of this route.
      console.warn('Unable to clear a resolved cross-chain send record', error);
    });
  }

  const response = crossChainSendResponse(outcome);
  callback?.(response);

  return response;
}
