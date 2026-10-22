import { FPNumber } from '@sora-substrate/util';
import { signAndSendExtrinsic } from '@extension-base/api/substrate/shared/signAndSendExtrinsic';
import { getPrecisionValue } from '@extension-base/api/substrate';
import type { CrossChainProps, MakeCrossChainProps } from '@extension-base/api/substrate/types';
import type State from '@extension-base/background/handlers/State';
import type { BasicTxResponse } from '@extension-base/background/types/types';
import type { KeyringPair } from '@subwallet/keyring/types';
import { getUtilityProps } from '@/extension/background/extension-base/src/background/handlers/utils';
import {
  createReviewedCrossChainExtrinsic,
  createReviewedExecutionFingerprint,
  resolveReviewedRuntimeCall,
  type ReviewedExecutionApi,
} from '@/cross-chain/reviewedExecution';
import { assertReviewedRuntimeAuthority } from '@/cross-chain/reviewedRuntimeAuthority';
import { validateReviewedCrossChainRequest } from '@/cross-chain/requestValidation';
import { createCrossChainQuoteFingerprint } from '@/cross-chain/quoteFingerprint';

export type CrossChainQuote = {
  originFee: FPNumber;
  destinationFee: FPNumber;
  minimum: FPNumber;
  runtimeFingerprint: string;
  executionFingerprint: string;
  extrinsic: NonNullable<Awaited<ReturnType<typeof createReviewedCrossChainExtrinsic>>['extrinsic']>;
};

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

  let api = state.getSubstrateApiMap[originNet.toLowerCase()]?.api;
  if (!api || api.isConnected === false) {
    state.networkService.substrateApiHandler.initApi(network);
    const deadline = Date.now() + 15_000;

    while (Date.now() < deadline) {
      api = state.getSubstrateApiMap[originNet.toLowerCase()]?.api;
      if (api && api.isConnected !== false) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (!api || api.isConnected === false) throw new Error('cross_chain_runtime_unavailable');
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

export async function makeCrossChain(props: MakeCrossChainProps, state: State): Promise<void> {
  const { from, isMobile, callback } = props;
  const txState: BasicTxResponse = {};

  await refreshCrossChainOriginBalance(props, state);
  const initial = assertReviewedRouteAndAccount(props, state);
  await initial.apiProps.api?.isReady;
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

  await signAndSendExtrinsic(
    {
      isMobile,
      apiProps: initial.apiProps,
      callback,
      extrinsic: finalQuote.extrinsic,
      txState,
      address: state.keyringService.getSubstrateAddress(from),
      errorMessage: 'CrossChain error',
      finalGuard: syncFinalGuard,
    },
    state
  );
}
