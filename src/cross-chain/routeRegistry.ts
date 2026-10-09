import { FPNumber } from '@sora-substrate/util';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type { MutableAction } from '@extension-base/services/action-capability-service';
import { createAssetKey, getCanonicalAssetId } from '@/portfolio/assetIdentity';
import {
  BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES,
  CROSS_CHAIN_ROUTE_PROVIDERS,
  getReviewedRouteProvider,
  matchesReviewedRouteCatalog,
  normalizeReviewedRouteEcosystem,
  type CrossChainRouteProviderId,
  type ReviewedCrossChainRouteDefinition,
  type ReviewedCrossChainRouteProvider,
} from '@/cross-chain/reviewedRoutes';

type RouteBalance = Pick<BalanceItem, 'id' | 'name'> &
  Partial<
    Pick<
      BalanceItem,
      'currencyId' | 'free' | 'precision' | 'relayChain' | 'solanaTokenMint' | 'symbol' | 'total' | 'transferable'
    >
  >;

type RouteTokenGroup = Pick<TokenGroup, 'groupId' | 'icon' | 'symbol' | 'tokenName'> & {
  balances: RouteBalance[];
};

export type { CrossChainRouteProviderId } from '@/cross-chain/reviewedRoutes';
export { CROSS_CHAIN_ROUTE_PROVIDERS } from '@/cross-chain/reviewedRoutes';

export type CrossChainOwnedAsset = {
  key: string;
  groupId: string;
  canonicalAssetId: string;
  assetId: string;
  networkName: string;
  networkChainId: string;
  ecosystem: string;
  name: string;
  symbol: string;
  icon: string;
  balance: string;
};

export type ReviewedCrossChainRoute = {
  id: string;
  providerId: CrossChainRouteProviderId;
  action: MutableAction;
  enabled: boolean;
  disabledReason?: string;
  assetKey: string;
  assetId: string;
  xcmAssetId: string;
  originNetwork: string;
  originChainId: string;
  destinationNetwork: string;
  destinationChainId: string;
  protocol: string;
  minimum: string | null;
  destinationFee: string | null;
  feeDescription: string;
  estimatedTime: string;
  warnings: string[];
};

/** Stable provider contract used by the route builder and background guard. */
export type CrossChainRouteProvider = ReviewedCrossChainRouteProvider;

export type CrossChainProviderAvailability = 'available' | 'action-disabled' | 'unavailable';

export type CrossChainProviderCapability = CrossChainRouteProvider & {
  availability: CrossChainProviderAvailability;
  reason: string;
  reviewedRouteCount: number;
};

/**
 * Provider coverage is derived from bundled execution authority and release policy only.
 * It deliberately has no wallet, balance, selected-asset, or registry input so the complete
 * inventory remains visible before a user owns a matching asset.
 */
export function buildCrossChainProviderCapabilities(
  actions: Partial<Record<MutableAction, boolean>>,
  reviewedRoutes: readonly Readonly<ReviewedCrossChainRouteDefinition>[] = BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES
): CrossChainProviderCapability[] {
  return CROSS_CHAIN_ROUTE_PROVIDERS.map((provider) => {
    const reviewedRouteCount = reviewedRoutes.filter(
      (route) => route.providerId === provider.id && Boolean(route.execution)
    ).length;

    if (reviewedRouteCount === 0) {
      return {
        ...provider,
        availability: 'unavailable',
        reason:
          provider.id === 'sora-evm-bridge'
            ? 'No reviewed executable claim and recovery flow is bundled. SORA ↔ Ethereum transfers remain unavailable.'
            : 'No reviewed executable route is bundled for this provider.',
        reviewedRouteCount,
      };
    }

    if (actions[provider.action] !== true) {
      return {
        ...provider,
        availability: 'action-disabled',
        reason: 'Reviewed route authority is bundled, but transfers are not enabled by the current capability policy.',
        reviewedRouteCount,
      };
    }

    return {
      ...provider,
      availability: 'available',
      reason: `${reviewedRouteCount} reviewed route${reviewedRouteCount === 1 ? '' : 's'} available when exact network metadata, an owned asset, and a local signer match.`,
      reviewedRouteCount,
    };
  });
}

const ecosystemName = (network: NetworkJson, balance?: RouteBalance): string =>
  normalizeReviewedRouteEcosystem(network.ecosystem ?? balance?.relayChain ?? 'unknown');

const normalizeAssetId = (ecosystem: string, value: unknown): string => {
  const id = String(value ?? '').trim();

  return ecosystem === 'evm' || ecosystem === 'ethereum' || ecosystem.includes('ethereum') ? id.toLowerCase() : id;
};

const positiveBalance = (balance: RouteBalance): string | null => {
  const value = String(balance.transferable ?? balance.total ?? balance.free ?? '0');

  try {
    const amount = new FPNumber(value);

    return amount.isFinity() && amount.isGreaterThan(FPNumber.ZERO) ? amount.toString() : null;
  } catch {
    return null;
  }
};

function registryAssetForBalance(network: NetworkJson, balance: RouteBalance) {
  const ecosystem = ecosystemName(network, balance);
  const ids = [balance.solanaTokenMint, balance.currencyId, balance.id]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizeAssetId(ecosystem, value));

  return network.assets.find((asset) =>
    [asset.currencyId, asset.id]
      .filter((value): value is string => Boolean(value))
      .some((value) => ids.includes(normalizeAssetId(ecosystem, value)))
  );
}

export function buildOwnedCrossChainAssets(
  groups: readonly RouteTokenGroup[],
  networks: readonly NetworkJson[]
): CrossChainOwnedAsset[] {
  const networkByName = new Map(networks.map((network) => [network.name.toLowerCase(), network]));
  const assets = new Map<string, CrossChainOwnedAsset>();

  groups.forEach((group) => {
    group.balances.forEach((balance) => {
      const network = networkByName.get(balance.name.toLowerCase());
      const amount = positiveBalance(balance);

      if (!network || !amount) return;

      const registryAsset = registryAssetForBalance(network, balance);
      if (!registryAsset) return;

      const ecosystem = ecosystemName(network, balance);
      const chainId = String(network.chainId || network.name);
      const canonicalAssetId = getCanonicalAssetId(balance as BalanceItem);
      const assetId = String(balance.id);
      const key = createAssetKey({ ecosystem, chainId, assetId: canonicalAssetId });

      assets.set(key, {
        key,
        groupId: group.groupId,
        canonicalAssetId,
        assetId,
        networkName: network.name,
        networkChainId: chainId,
        ecosystem,
        name: registryAsset.name || group.tokenName || registryAsset.symbol,
        symbol: registryAsset.symbol.toUpperCase(),
        icon: registryAsset.icon || group.icon,
        balance: amount,
      });
    });
  });

  return [...assets.values()].sort((left, right) =>
    `${left.networkName}:${left.name}`.localeCompare(`${right.networkName}:${right.name}`)
  );
}

export function buildReviewedCrossChainRoutes({
  asset,
  origin,
  networks,
  actions,
  reviewedRoutes = BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES,
}: {
  asset: CrossChainOwnedAsset;
  origin: NetworkJson;
  networks: NetworkJson[];
  actions: Partial<Record<MutableAction, boolean>>;
  reviewedRoutes?: readonly Readonly<ReviewedCrossChainRouteDefinition>[];
}): ReviewedCrossChainRoute[] {
  if (
    asset.key !==
    createAssetKey({ ecosystem: asset.ecosystem, chainId: asset.networkChainId, assetId: asset.canonicalAssetId })
  ) {
    return [];
  }
  if (!['substrate', 'evm'].includes(asset.ecosystem)) return [];

  const networksByChainId = new Map<string, NetworkJson>();
  const duplicateChainIds = new Set<string>();
  networks.forEach((network) => {
    const chainId = String(network.chainId);
    if (networksByChainId.has(chainId)) duplicateChainIds.add(chainId);
    networksByChainId.set(chainId, network);
  });

  return reviewedRoutes.flatMap((definition) => {
    if (
      definition.originChainId !== asset.networkChainId ||
      definition.originAssetId !== asset.assetId ||
      definition.assetKeyAssetId !== asset.canonicalAssetId ||
      definition.symbol !== asset.symbol.toUpperCase() ||
      duplicateChainIds.has(definition.originChainId) ||
      duplicateChainIds.has(definition.destinationChainId)
    ) {
      return [];
    }

    const destination = networksByChainId.get(definition.destinationChainId);
    if (!destination || !matchesReviewedRouteCatalog(definition, origin, destination)) return [];

    const provider = getReviewedRouteProvider(definition.providerId);
    const enabled = actions[definition.action] === true;

    return [
      {
        id: definition.id,
        providerId: definition.providerId,
        action: definition.action,
        enabled,
        disabledReason: enabled ? undefined : 'Transfers on this reviewed provider are temporarily disabled.',
        assetKey: asset.key,
        assetId: definition.originAssetId,
        xcmAssetId: definition.originXcmAssetId,
        originNetwork: origin.name,
        originChainId: definition.originChainId,
        destinationNetwork: destination.name,
        destinationChainId: definition.destinationChainId,
        protocol: provider.protocol,
        minimum: definition.minimum,
        destinationFee: definition.execution.destinationFee,
        feeDescription:
          definition.execution.destinationFee === '0'
            ? 'Origin network fee quoted live before confirmation'
            : `Origin fee quoted live; downstream estimate ${definition.execution.destinationFee} ${definition.symbol}`,
        estimatedTime: provider.estimatedTime,
        warnings: [
          `Only the reviewed ${origin.name} → ${destination.name} route is enabled.`,
          'Network conditions can change the final fee and delivery time.',
          ...(definition.execution.destinationFee === '0'
            ? []
            : ['The downstream fee is a reviewed estimate and is bound into the confirmation.']),
        ],
      },
    ];
  });
}

const unavailableSoraEthereumRoutes = Object.freeze([
  Object.freeze({
    originChainId: '7e4e32d0feafd4f9c9414b0be86373f9a1efa904809b683453a9af6856d38ad5',
    destinationChainId: '1',
    originEcosystem: 'substrate',
    destinationEcosystem: 'evm',
    originAssetId: '82f45df3-b6d8-43e7-a440-c0e73ab59785',
    originCanonicalAssetId: '0x0200070000000000000000000000000000000000000000000000000000000000',
    destinationAssetId: 'c2a6c062-d511-4bde-9ce6-ea775d2a302c',
    symbol: 'ETH',
    precision: 18,
    reason:
      'Ethereum delivery requires a second claim transaction and recovery tracking. This route stays unavailable until that full flow is reviewed.',
  }),
  Object.freeze({
    originChainId: '1',
    destinationChainId: '7e4e32d0feafd4f9c9414b0be86373f9a1efa904809b683453a9af6856d38ad5',
    originEcosystem: 'evm',
    destinationEcosystem: 'substrate',
    originAssetId: 'c2a6c062-d511-4bde-9ce6-ea775d2a302c',
    originCanonicalAssetId: 'c2a6c062-d511-4bde-9ce6-ea775d2a302c',
    destinationAssetId: '82f45df3-b6d8-43e7-a440-c0e73ab59785',
    symbol: 'ETH',
    precision: 18,
    reason:
      'Ethereum → SORA requires a contract transaction, live gas and allowance checks, and recovery tracking. This route stays unavailable until that full flow is reviewed.',
  }),
]);

/**
 * Honest, non-actionable capabilities for a catalogued legacy bridge whose multi-transaction
 * recovery flow is not yet safe to expose through the reviewed one-transaction executor.
 */
export function buildUnavailableCrossChainRoutes({
  asset,
  origin,
  networks,
}: {
  asset: CrossChainOwnedAsset;
  origin: NetworkJson;
  networks: NetworkJson[];
}): ReviewedCrossChainRoute[] {
  if (
    asset.key !==
    createAssetKey({ ecosystem: asset.ecosystem, chainId: asset.networkChainId, assetId: asset.canonicalAssetId })
  ) {
    return [];
  }

  return unavailableSoraEthereumRoutes.flatMap((definition) => {
    if (
      asset.networkChainId !== definition.originChainId ||
      asset.assetId !== definition.originAssetId ||
      asset.canonicalAssetId !== definition.originCanonicalAssetId ||
      asset.symbol !== definition.symbol ||
      String(origin.chainId) !== definition.originChainId ||
      normalizeReviewedRouteEcosystem(origin.ecosystem) !== definition.originEcosystem ||
      origin.options?.includes('testnet')
    ) {
      return [];
    }

    const destinations = networks.filter(
      (network) =>
        String(network.chainId) === definition.destinationChainId &&
        normalizeReviewedRouteEcosystem(network.ecosystem) === definition.destinationEcosystem &&
        !network.options?.includes('testnet') &&
        network.assets.some(
          (registryAsset) =>
            registryAsset.id === definition.destinationAssetId &&
            registryAsset.symbol.toUpperCase() === definition.symbol &&
            registryAsset.precision === definition.precision
        )
    );
    if (destinations.length !== 1) return [];

    const provider = getReviewedRouteProvider('sora-evm-bridge');
    const destination = destinations[0];

    return [
      {
        id: [
          'unavailable-v1',
          provider.id,
          definition.originChainId,
          definition.destinationChainId,
          encodeURIComponent(definition.originAssetId),
        ].join(':'),
        providerId: provider.id,
        action: provider.action,
        enabled: false,
        disabledReason: definition.reason,
        assetKey: asset.key,
        assetId: asset.assetId,
        xcmAssetId: asset.assetId,
        originNetwork: origin.name,
        originChainId: definition.originChainId,
        destinationNetwork: destination.name,
        destinationChainId: definition.destinationChainId,
        protocol: provider.protocol,
        minimum: null,
        destinationFee: null,
        feeDescription: 'Multi-step fees cannot be quoted safely in this release',
        estimatedTime: provider.estimatedTime,
        warnings: ['No funds are submitted while this capability is unavailable.'],
      },
    ];
  });
}

export function findReviewedCrossChainRoute(
  routeId: string,
  assets: CrossChainOwnedAsset[],
  networks: NetworkJson[],
  actions: Partial<Record<MutableAction, boolean>>,
  reviewedRoutes: readonly Readonly<ReviewedCrossChainRouteDefinition>[] = BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES
): ReviewedCrossChainRoute | undefined {
  for (const asset of assets) {
    const origin = networks.find(({ chainId }) => String(chainId) === asset.networkChainId);
    if (!origin) continue;

    const route = buildReviewedCrossChainRoutes({ asset, origin, networks, actions, reviewedRoutes }).find(
      ({ id }) => id === routeId
    );
    if (route) return route;
  }

  return undefined;
}
