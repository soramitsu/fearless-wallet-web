import type { MutableAction } from '@extension-base/services/action-capability-service';
import type { NetworkJson } from '@extension-base/types';
import {
  BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES,
  CROSS_CHAIN_ROUTE_PROVIDERS,
  getReviewedRouteProvider,
  matchesReviewedRouteCatalog,
  normalizeReviewedRouteEcosystem,
  type CrossChainRouteProviderId,
  type ReviewedCrossChainRouteDefinition,
} from '@/cross-chain/reviewedRoutes';
import { buildUnavailableCrossChainRoutes, type CrossChainOwnedAsset } from '@/cross-chain/routeRegistry';
import { parseHoldingKey, sameAssetId } from '@/portfolio/dashboard/holdingKey';
import { createAssetKey } from '@/portfolio/assetKey';

/**
 * What stands between a holding and a swap on Polkaswap (design spec 4.5):
 * - `ready`: it is on the swap venue, and swaps are on;
 * - `route`: a reviewed route brings it there in one to three moves, and those moves are on;
 * - `off`: it could get there (or is there), but release policy has the moves (or the swaps) switched off;
 * - `none`: no reviewed route;
 * - `unknown`: the app has not loaded what it needs to say, so nothing is claimed.
 */
export type ReadinessState = 'ready' | 'route' | 'off' | 'none' | 'unknown';

/** SORA mainnet's chain id, as the reviewed routes name it (src/cross-chain/reviewedRoutes.ts). */
export const SORA_CHAIN_ID = '7e4e32d0feafd4f9c9414b0be86373f9a1efa904809b683453a9af6856d38ad5';

/** The most moves the dashboard walks to reach SORA; a longer route is not offered. */
export const MAX_MOVES = 3;

export interface MoveHop {
  routeId: string;
  providerId: CrossChainRouteProviderId;
  providerName: string;
  protocol: string;
  originNetwork: string;
  originChainId: string;
  destinationNetwork: string;
  destinationChainId: string;
  symbol: string;
  minimum: string | null;
  destinationFee: string | null;
  /** Release policy lets this kind of move run. */
  enabled: boolean;
  /** The key the cross-chain screen knows the asset by on this hop's origin network. */
  assetKey: string;
}

export interface Readiness {
  state: ReadinessState;
  /** The moves that bring the holding to SORA, first move first. Empty unless `route` or `off` because of the moves. */
  hops: MoveHop[];
  /** Why `off` is off. */
  cause?: 'moves-off' | 'swaps-off';
  /** For `none`: the app's own registry knows this route and keeps it unavailable by design (Ethereum to SORA). */
  unavailable?: 'ethereum-to-sora';
  /** The same asset on SORA, when a reviewed route names it: where Receive on SORA points. A registry asset id. */
  soraAssetId?: string;
}

export interface ReadinessSubject {
  /** The holding's portfolio key. */
  key: string;
  networkName: string;
  symbol: string;
}

export interface ReadinessContext {
  networks: readonly NetworkJson[];
  /** Release policy (`extensionStore.features.actions`); `undefined` until it has loaded. */
  actions: Partial<Record<MutableAction, boolean>> | undefined;
  /** The swap venue's network name in this build (`SORA_NETWORK_NAME`). */
  soraNetworkName: string;
  reviewedRoutes?: readonly Readonly<ReviewedCrossChainRouteDefinition>[];
}

type Definition = Readonly<ReviewedCrossChainRouteDefinition>;

const providerOrder = new Map(CROSS_CHAIN_ROUTE_PROVIDERS.map(({ id }, index) => [id, index]));
const sameName = (left: string, right: string): boolean => left.trim().toLowerCase() === right.trim().toLowerCase();

/**
 * The evaluator of one registry and one release policy; build it once and ask it about every holding. It asks the
 * app's own bundled routes (`reviewedRoutes.ts`) and the live registry, as the cross-chain screen does, and never
 * assumes a route: a route counts only while the registry's catalogues still match it.
 */
export function createReadinessEvaluator(context: ReadinessContext): (subject: ReadinessSubject) => Readiness {
  const { actions, soraNetworkName, networks } = context;
  const routes = (context.reviewedRoutes ?? BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES).filter((route) => route.execution);
  const networkByChain = new Map(networks.map((network) => [String(network.chainId), network]));
  const usable = new Map<string, boolean>();

  const isUsable = (route: Definition): boolean => {
    const cached = usable.get(route.id);

    if (cached !== undefined) return cached;

    const origin = networkByChain.get(route.originChainId);
    const destination = networkByChain.get(route.destinationChainId);
    const result = Boolean(origin && destination && matchesReviewedRouteCatalog(route, origin, destination));

    usable.set(route.id, result);

    return result;
  };

  const toHop = (route: Definition): MoveHop => {
    const provider = getReviewedRouteProvider(route.providerId);

    return {
      routeId: route.id,
      providerId: route.providerId,
      providerName: provider.displayName,
      protocol: provider.protocol,
      originNetwork: networkByChain.get(route.originChainId)?.name ?? route.originChainId,
      originChainId: route.originChainId,
      destinationNetwork: networkByChain.get(route.destinationChainId)?.name ?? route.destinationChainId,
      destinationChainId: route.destinationChainId,
      symbol: route.symbol,
      minimum: route.minimum,
      destinationFee: route.execution?.destinationFee ?? null,
      enabled: actions?.[route.action] === true,
      assetKey: createAssetKey({
        ecosystem: route.originEcosystem,
        chainId: route.originChainId,
        assetId: route.assetKeyAssetId,
      }),
    };
  };

  /** Every reviewed way, in at most MAX_MOVES moves, for an asset to reach SORA. */
  const pathsToSora = (chainId: string, assetId: string, ecosystem: string, symbol: string): Definition[][] => {
    const paths: Definition[][] = [];
    const walk = (path: Definition[]): void => {
      const last = path[path.length - 1];

      if (last.destinationChainId === SORA_CHAIN_ID) {
        paths.push(path);

        return;
      }
      if (path.length >= MAX_MOVES) return;

      const visited = new Set([chainId, ...path.map(({ destinationChainId }) => destinationChainId)]);

      routes
        .filter(
          (next) =>
            next.originChainId === last.destinationChainId &&
            next.originXcmAssetId === last.destinationXcmAssetId &&
            next.symbol === last.symbol &&
            !visited.has(next.destinationChainId) &&
            isUsable(next)
        )
        .forEach((next) => walk([...path, next]));
    };

    routes
      .filter(
        (first) =>
          first.originChainId === chainId &&
          sameAssetId(ecosystem, first.originAssetId, assetId) &&
          first.symbol === symbol.toUpperCase() &&
          isUsable(first)
      )
      .forEach((first) => walk([first]));

    return paths;
  };

  const rank = (path: Definition[]): [number, number, string] => [
    path.length,
    providerOrder.get(path[0].providerId) ?? providerOrder.size,
    path.map(({ id }) => id).join('>'),
  ];
  const byRank = (left: Definition[], right: Definition[]): number => {
    const [leftLength, leftProvider, leftId] = rank(left);
    const [rightLength, rightProvider, rightId] = rank(right);

    return leftLength - rightLength || leftProvider - rightProvider || leftId.localeCompare(rightId);
  };

  /** The SORA asset a route ends with, found through the reviewed route that leaves SORA with it. */
  const soraCounterpart = (path: Definition[]): string | undefined => {
    const execution = path[path.length - 1].execution;
    const soraAssetId = execution && 'soraAssetId' in execution ? execution.soraAssetId : undefined;

    return soraAssetId
      ? routes.find((route) => route.originChainId === SORA_CHAIN_ID && route.assetKeyAssetId === soraAssetId)?.originAssetId
      : undefined;
  };

  const unavailableRoute = (
    parts: NonNullable<ReturnType<typeof parseHoldingKey>>,
    subject: ReadinessSubject
  ): Readiness['unavailable'] => {
    const origin = networkByChain.get(parts.chainId);
    const registryAsset = origin?.assets.find((asset) => sameAssetId(parts.ecosystem, String(asset.id), parts.assetId));

    if (!origin || !registryAsset) return undefined;

    const ecosystem = normalizeReviewedRouteEcosystem(origin.ecosystem);
    const canonicalAssetId = String(registryAsset.currencyId ?? registryAsset.id);
    const owned: CrossChainOwnedAsset = {
      key: createAssetKey({ ecosystem, chainId: parts.chainId, assetId: canonicalAssetId }),
      groupId: String(registryAsset.id),
      canonicalAssetId,
      assetId: String(registryAsset.id),
      networkName: origin.name,
      networkChainId: parts.chainId,
      ecosystem,
      name: registryAsset.name,
      symbol: subject.symbol.toUpperCase(),
      icon: registryAsset.icon,
      balance: '0',
    };

    // A holding on SORA never gets here, so the only catalogued legacy route that can match is Ethereum to SORA.
    return buildUnavailableCrossChainRoutes({ asset: owned, origin, networks: [...networks] }).length
      ? 'ethereum-to-sora'
      : undefined;
  };

  return (subject) => {
    if (!actions) return { state: 'unknown', hops: [] };

    const parts = parseHoldingKey(subject.key);

    if (!parts) return { state: 'none', hops: [] };

    // The swap venue. Polkaswap trades only here, and only while release policy has swaps on.
    if (sameName(subject.networkName, soraNetworkName)) {
      return actions.polkaswap === true ? { state: 'ready', hops: [] } : { state: 'off', hops: [], cause: 'swaps-off' };
    }

    const paths = pathsToSora(parts.chainId, parts.assetId, parts.ecosystem, subject.symbol).sort(byRank);
    const enabled = paths.filter((path) => path.every((route) => actions[route.action] === true));
    const best = enabled[0] ?? paths[0];

    if (!best) {
      const unavailable = unavailableRoute(parts, subject);

      return { state: 'none', hops: [], ...(unavailable ? { unavailable } : {}) };
    }

    const soraAssetId = soraCounterpart(best);

    return {
      state: enabled.length ? 'route' : 'off',
      hops: best.map(toHop),
      ...(enabled.length ? {} : { cause: 'moves-off' as const }),
      ...(soraAssetId ? { soraAssetId } : {}),
    };
  };
}

/** One holding's readiness; for many holdings build `createReadinessEvaluator` once. */
export function evaluateReadiness(subject: ReadinessSubject, context: ReadinessContext): Readiness {
  return createReadinessEvaluator(context)(subject);
}
