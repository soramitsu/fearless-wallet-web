import { FPNumber } from '@sora-substrate/util';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type { MutableAction } from '@extension-base/services/action-capability-service';
import { createAssetKey, getCanonicalAssetId } from '@/portfolio/assetIdentity';
import { assertReviewedRecipient } from '@/cross-chain/recipient';
import {
  BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES,
  findBundledReviewedCrossChainRoute,
  matchesReviewedRouteCatalog,
  type CrossChainRouteProviderId,
  type ReviewedCrossChainExecution,
  type ReviewedCrossChainRouteDefinition,
} from '@/cross-chain/reviewedRoutes';

export type { CrossChainRouteProviderId } from '@/cross-chain/reviewedRoutes';

export interface ValidatedCrossChainRoute {
  routeId: string;
  providerId: CrossChainRouteProviderId;
  action: MutableAction;
  xcmAssetId: string;
  minimum: string | null;
  execution: Readonly<ReviewedCrossChainExecution>;
}

// Plain decimal digits with at most one dot. FPNumber would also accept 0x10, 1e3, 1,5 and 1.2.3 and read them as
// other numbers, and the background must not depend on the popup having filtered them out.
const DECIMAL_AMOUNT = /^\d+(\.\d*)?$/;

function validateAmount(
  amount: string | undefined,
  minimum: string | null,
  requireAmount: boolean,
  precision: number
): FPNumber | null {
  const value = amount?.trim();

  if (!value) {
    if (requireAmount) throw new Error('cross_chain_amount_required');

    return null;
  }

  if (!DECIMAL_AMOUNT.test(value)) throw new Error('cross_chain_amount_invalid');
  // More decimals than the asset has would be cut off silently when the amount is scaled to planck.
  if ((value.split('.')[1] ?? '').length > precision) throw new Error('cross_chain_amount_precision_exceeded');

  let parsed: FPNumber;
  try {
    parsed = new FPNumber(value);
  } catch {
    throw new Error('cross_chain_amount_invalid');
  }

  if (!parsed.isFinity() || !parsed.isGreaterThan(FPNumber.ZERO)) {
    throw new Error('cross_chain_amount_invalid');
  }
  if (minimum !== null && FPNumber.lt(parsed, new FPNumber(minimum))) {
    throw new Error('cross_chain_amount_below_reviewed_minimum');
  }

  return parsed;
}

export function validateReviewedCrossChainRequest({
  routeId,
  providerId,
  assetKey,
  assetId,
  origin,
  destination,
  tokenBalance,
  amount,
  to,
  requireAmount = false,
  reviewedRoutes = BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES,
}: {
  routeId?: string;
  providerId?: CrossChainRouteProviderId;
  assetKey?: string;
  assetId: string;
  origin: NetworkJson | undefined;
  destination: NetworkJson | undefined;
  tokenBalance: TokenGroup | undefined;
  amount?: string;
  /** Recipient account; mandatory whenever an amount is required, because that is a send or a priced quote. */
  to?: string;
  requireAmount?: boolean;
  reviewedRoutes?: readonly Readonly<ReviewedCrossChainRouteDefinition>[];
}): ValidatedCrossChainRoute {
  if (!routeId || !providerId || !assetKey) throw new Error('cross_chain_reviewed_route_required');
  if (!origin || !destination) throw new Error('cross_chain_network_unavailable');

  const route = findBundledReviewedCrossChainRoute(routeId, reviewedRoutes);
  if (!route) throw new Error('cross_chain_route_id_not_reviewed');
  if (!route.execution) throw new Error('cross_chain_execution_not_reviewed');
  if (providerId !== route.providerId) throw new Error('cross_chain_provider_mismatch');
  if (String(origin.chainId) !== route.originChainId || String(destination.chainId) !== route.destinationChainId) {
    throw new Error('cross_chain_route_network_mismatch');
  }
  if (!matchesReviewedRouteCatalog(route, origin, destination)) {
    throw new Error('cross_chain_route_catalog_drift');
  }
  if (assetId !== route.originAssetId) throw new Error('cross_chain_origin_asset_mismatch');

  const expectedAssetKey = createAssetKey({
    ecosystem: route.originEcosystem,
    chainId: route.originChainId,
    assetId: route.assetKeyAssetId,
  });
  if (assetKey !== expectedAssetKey) throw new Error('cross_chain_asset_key_mismatch');
  if (!tokenBalance) throw new Error('cross_chain_origin_balance_unavailable');

  const balances = tokenBalance.balances.filter(({ name }) => name.toLowerCase() === origin.name.toLowerCase());
  if (balances.length !== 1) throw new Error('cross_chain_origin_balance_unavailable');

  const balance = balances[0] as BalanceItem;
  if (String(balance.id) !== route.originAssetId) throw new Error('cross_chain_origin_asset_mismatch');

  const balanceAssetKey = createAssetKey({
    ecosystem: route.originEcosystem,
    chainId: route.originChainId,
    assetId: getCanonicalAssetId(balance),
  });
  if (balanceAssetKey !== expectedAssetKey) throw new Error('cross_chain_asset_key_mismatch');

  const parsedAmount = validateAmount(amount, route.minimum, requireAmount, route.precision);
  if (requireAmount && parsedAmount) {
    let transferable: FPNumber;
    try {
      transferable = new FPNumber(String(balance.transferable ?? ''));
    } catch {
      throw new Error('cross_chain_origin_balance_unavailable');
    }
    if (!transferable.isFinity() || !transferable.isGteZero()) {
      throw new Error('cross_chain_origin_balance_unavailable');
    }
    if (parsedAmount.gt(transferable)) throw new Error('cross_chain_origin_balance_insufficient');
  }
  if (requireAmount) assertReviewedRecipient(route.execution, to);

  return {
    routeId: route.id,
    providerId: route.providerId,
    action: route.action,
    xcmAssetId: route.originXcmAssetId,
    minimum: route.minimum,
    execution: route.execution,
  };
}
