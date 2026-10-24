import type { MutableAction } from '@extension-base/services/action-capability-service';
import type { NetworkJson } from '@extension-base/types';

export type CrossChainRouteProviderId = 'wallet-xcm' | 'sora-substrate-bridge' | 'sora-evm-bridge' | 'liberland-bridge';

export type ReviewedRouteEcosystem = 'substrate' | 'evm';

/** Registry producers use several names for the same EVM account/address family. */
export function normalizeReviewedRouteEcosystem(value: unknown): string {
  const ecosystem = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-_\s]/g, '');

  return ['evm', 'ethereum', 'ethereumbased'].includes(ecosystem) ? 'evm' : ecosystem;
}

export interface ReviewedCrossChainRouteProvider {
  id: CrossChainRouteProviderId;
  displayName: string;
  action: MutableAction;
  protocol: string;
  estimatedTime: string;
}

export type ReviewedRuntimeCall = Readonly<{
  pallet: 'xcmPallet' | 'polkadotXcm' | 'xTokens' | 'bridgeProxy' | 'soraBridgeApp';
  call: 'limitedTeleportAssets' | 'limitedReserveTransferAssets' | 'reserveTransferAssets' | 'transfer' | 'burn';
  /** Exact metadata argument names required before this call may be constructed. */
  args: readonly string[];
}>;

export type ReviewedDestinationMinimum =
  | Readonly<{ kind: 'balances-existential-deposit'; precision: number }>
  | Readonly<{ kind: 'assets-min-balance'; assetId: number; precision: number }>
  | Readonly<{ kind: 'acala-token-minimum'; token: 'ACA'; precision: number }>
  | Readonly<{
      kind: 'sora-parachain-asset-minimum';
      chainId: string;
      assetId: string;
      precision: number;
    }>;

interface ReviewedExecutionBase {
  originChainId: string;
  destinationChainId: string;
  assetXcmId: string;
  assetPrecision: number;
  callCandidates: readonly ReviewedRuntimeCall[];
  /** Reviewed downstream execution-fee estimate, expressed in the transferred asset. */
  destinationFee: string;
  destinationMinimum?: ReviewedDestinationMinimum;
}

export interface ReviewedRelayExecution extends ReviewedExecutionBase {
  kind: 'relay-native-xcm-v3';
  /** Kept for compatibility with older route fixtures; runtime uses callCandidates. */
  pallet: 'polkadotXcm' | 'xcmPallet';
  /** Kept for compatibility with older route fixtures; runtime uses callCandidates. */
  call: 'limitedTeleportAssets' | 'limitedReserveTransferAssets';
  relayNetwork: 'Polkadot' | 'Kusama';
  destinationParaId: number;
  receiverKind: 'AccountId32' | 'AccountKey20';
  assetParents: 0;
  assetInteriors: readonly Readonly<Record<string, unknown>>[];
}

export interface ReviewedExternalToSoraExecution extends ReviewedExecutionBase {
  kind: 'external-to-sora-xcm-v3';
  source: 'relay-native' | 'acala-native' | 'astar-native';
  relayNetwork: 'Polkadot' | 'Kusama';
  soraParachainId: number;
  soraParachainChainId: string;
  soraAssetId: string;
  soraAssetKind: 'Sidechain';
  bridgeNetwork: 'Polkadot' | 'Kusama';
  bridgeParachainId?: number;
  currencyId?: Readonly<{ Token: 'ACA' }>;
}

export interface ReviewedSoraBridgeExecution extends ReviewedExecutionBase {
  kind: 'sora-bridge-proxy-burn-v3';
  bridgeNetwork: 'Polkadot' | 'Kusama' | 'Liberland';
  recipientKind: 'relay' | 'parachain' | 'liberland';
  destinationParaId?: number;
  soraAssetId: string;
  soraAssetKind: 'Thischain' | 'Sidechain';
  sidechainPrecision: number;
  externalAsset: 'LLD' | number | null;
}

export interface ReviewedLiberlandToSoraExecution extends ReviewedExecutionBase {
  kind: 'liberland-to-sora-burn';
  externalAsset: 'LLD' | number;
  soraAssetId: string;
  soraAssetKind: 'Thischain' | 'Sidechain';
  sidechainPrecision: number;
}

export type ReviewedCrossChainExecution =
  | ReviewedRelayExecution
  | ReviewedExternalToSoraExecution
  | ReviewedSoraBridgeExecution
  | ReviewedLiberlandToSoraExecution;

export interface ReviewedCrossChainRouteDefinition {
  id: string;
  providerId: CrossChainRouteProviderId;
  action: MutableAction;
  originChainId: string;
  destinationChainId: string;
  originEcosystem: ReviewedRouteEcosystem;
  destinationEcosystem: ReviewedRouteEcosystem;
  /** Registry/balance id consumed by the legacy transfer engine. */
  originAssetId: string;
  /** Canonical id used in AssetKey (for example a Substrate currencyId when present). */
  assetKeyAssetId: string;
  originXcmAssetId: string;
  destinationXcmAssetId: string;
  symbol: string;
  precision: number;
  minimum: string | null;
  /** Complete bundled authority for the final pallet call and multilocation. */
  execution?: Readonly<ReviewedCrossChainExecution>;
}

export const CROSS_CHAIN_ROUTE_PROVIDERS: readonly ReviewedCrossChainRouteProvider[] = Object.freeze([
  Object.freeze({
    id: 'wallet-xcm' as const,
    displayName: 'Wallet XCM',
    action: 'crossChainXcm' as const,
    protocol: 'Polkadot XCM',
    estimatedTime: '2–10 minutes',
  }),
  Object.freeze({
    id: 'sora-substrate-bridge' as const,
    displayName: 'SORA ↔ Substrate',
    action: 'crossChainSoraBridge' as const,
    protocol: 'SORA Substrate bridge',
    estimatedTime: '5–20 minutes',
  }),
  Object.freeze({
    id: 'sora-evm-bridge' as const,
    displayName: 'SORA ↔ Ethereum',
    action: 'crossChainSoraBridge' as const,
    protocol: 'SORA ↔ Ethereum legacy bridge',
    estimatedTime: '10–60 minutes plus claim',
  }),
  Object.freeze({
    id: 'liberland-bridge' as const,
    displayName: 'SORA ↔ Liberland',
    action: 'crossChainLiberland' as const,
    protocol: 'Liberland bridge',
    estimatedTime: '5–20 minutes',
  }),
]);

const providerById = new Map(CROSS_CHAIN_ROUTE_PROVIDERS.map((provider) => [provider.id, provider]));

const reviewedCall = (
  pallet: ReviewedRuntimeCall['pallet'],
  call: ReviewedRuntimeCall['call'],
  args: readonly string[]
): ReviewedRuntimeCall => Object.freeze({ pallet, call, args: Object.freeze([...args]) });

const XCM_LIMITED_ARGS = Object.freeze(['dest', 'beneficiary', 'assets', 'feeAssetItem', 'weightLimit']);
const XCM_RESERVE_ARGS = Object.freeze(['dest', 'beneficiary', 'assets', 'feeAssetItem']);
const BRIDGE_BURN_ARGS = Object.freeze(['networkId', 'assetId', 'recipient', 'amount']);

export function getReviewedRouteProvider(providerId: CrossChainRouteProviderId): ReviewedCrossChainRouteProvider {
  const provider = providerById.get(providerId);

  if (!provider) throw new Error('cross_chain_provider_not_reviewed');

  return provider;
}

type DefinitionInput = Omit<ReviewedCrossChainRouteDefinition, 'id' | 'action'>;

export function createReviewedCrossChainRouteId(
  route: Pick<DefinitionInput, 'providerId' | 'originChainId' | 'destinationChainId' | 'originAssetId'>
): string {
  return [
    'reviewed-v1',
    route.providerId,
    route.originChainId,
    route.destinationChainId,
    encodeURIComponent(route.originAssetId),
  ].join(':');
}

export function defineReviewedCrossChainRoute(input: DefinitionInput): Readonly<ReviewedCrossChainRouteDefinition> {
  const provider = getReviewedRouteProvider(input.providerId);
  if (
    input.execution &&
    (input.execution.originChainId !== input.originChainId ||
      input.execution.destinationChainId !== input.destinationChainId ||
      input.execution.assetXcmId !== input.originXcmAssetId ||
      input.execution.assetPrecision !== input.precision)
  ) {
    throw new Error('cross_chain_execution_definition_mismatch');
  }
  const execution = input.execution
    ? Object.freeze({
        ...input.execution,
        callCandidates: Object.freeze(
          input.execution.callCandidates.map((candidate) =>
            Object.freeze({ ...candidate, args: Object.freeze([...candidate.args]) })
          )
        ),
        ...(input.execution.destinationMinimum
          ? { destinationMinimum: Object.freeze({ ...input.execution.destinationMinimum }) }
          : {}),
        ...('assetInteriors' in input.execution
          ? {
              assetInteriors: Object.freeze(input.execution.assetInteriors.map((item) => Object.freeze({ ...item }))),
            }
          : {}),
      })
    : undefined;

  return Object.freeze({
    ...input,
    execution,
    id: createReviewedCrossChainRouteId(input),
    action: provider.action,
  });
}

export function matchesReviewedRouteCatalog(
  definition: Readonly<ReviewedCrossChainRouteDefinition>,
  origin: NetworkJson,
  destination: NetworkJson
): boolean {
  if (!definition.execution) return false;
  if (
    String(origin.chainId) !== definition.originChainId ||
    String(destination.chainId) !== definition.destinationChainId ||
    normalizeReviewedRouteEcosystem(origin.ecosystem) !== definition.originEcosystem ||
    normalizeReviewedRouteEcosystem(destination.ecosystem) !== definition.destinationEcosystem ||
    origin.options?.includes('testnet') ||
    destination.options?.includes('testnet') ||
    origin.xcm?.xcmVersion.toLowerCase() !== 'v3'
  ) {
    return false;
  }

  const registryAssets = origin.assets.filter((registryAsset) => {
    const canonicalId = String(registryAsset.currencyId ?? registryAsset.id);

    return (
      registryAsset.id === definition.originAssetId &&
      canonicalId === definition.assetKeyAssetId &&
      registryAsset.symbol.toUpperCase() === definition.symbol &&
      registryAsset.precision === definition.precision
    );
  });
  const originXcmAssets = origin.xcm.availableAssets.filter(
    ({ id, symbol }) => id === definition.originXcmAssetId && symbol.toUpperCase() === definition.symbol
  );
  const destinations = origin.xcm.availableDestinations.filter(
    ({ chainId }) => String(chainId) === definition.destinationChainId
  );
  const destinationAssets = destinations.flatMap(({ assets }) =>
    assets.filter(
      ({ id, symbol }) => id === definition.destinationXcmAssetId && symbol.toUpperCase() === definition.symbol
    )
  );

  return (
    registryAssets.length === 1 &&
    originXcmAssets.length === 1 &&
    destinations.length === 1 &&
    destinationAssets.length === 1
  );
}

const chain = Object.freeze({
  polkadot: '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3',
  kusama: 'b0a8d493285c2df73290dfb7e61f870f17b41801197a149ca93654499ea3dafe',
  polkadotAssetHub: '68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f',
  kusamaAssetHub: '48239ef607d7928874027a43a67689209727dfb3d3dc5e5b03a39bdc2eda771a',
  moonbeam: 'fe58ea77779b7abda7da4ec526d14db9b1e9cd40a217c34892af80a9b332b76d',
  moonriver: '401a1f9dca3da46f5c4091016c8a2f26dcea05865116b286f60f668207d1474b',
  acala: 'fc41b9bd8ef8fe53d58c7ea67c794c7ec9a73daf05e6d54b14ff6342c99ba64c',
  karura: 'baf5aabe40646d11f0ee8abbdc64f4a4b7674925cba08e4a05ff9ebed6e2126b',
  parallel: 'e61a41c53f5dcd0beb09df93b34402aada44cb05117b71059cce40a2723a4e97',
  bifrost: '9f28c6a68e0fc9646eff64935684f6eeeece527e37bbe1f213d22caa1d9d6bed',
  astar: '9eb76c5184c4ab8679d2d5d819fdf90b9c001403e9e17da2e14b6d8aec4029c6',
  sora: '7e4e32d0feafd4f9c9414b0be86373f9a1efa904809b683453a9af6856d38ad5',
  liberland: '6bd89e052d67a45bb60a9a23e8581053d5e0d619f15cb9865946937e690c42d6',
});

const soraParachain = Object.freeze({
  polkadot: {
    chainId: 'e92d165ad41e41e215d09713788173aecfdbe34d3bed29409d33a2ef03980738',
    paraId: 2025,
  },
  kusama: {
    chainId: '6d8d9f145c2177fa83512492cdd80a71e29f22473f4a8943a6292149ac319fb9',
    paraId: 2011,
  },
});

const xcmAsset = Object.freeze({
  dot: '99e66d4f-00cd-4d73-bd1b-3adadcacffb2',
  ksm: '0ceffe96-8090-404e-815c-91118ee5dd65',
});

const relayDestination = Object.freeze({
  [chain.polkadotAssetHub]: { paraId: 1000, native: true, receiverKind: 'AccountId32' as const },
  [chain.moonbeam]: { paraId: 2004, native: false, receiverKind: 'AccountKey20' as const },
  [chain.acala]: { paraId: 2000, native: false, receiverKind: 'AccountId32' as const },
  [chain.parallel]: { paraId: 2012, native: false, receiverKind: 'AccountId32' as const },
  [chain.kusamaAssetHub]: { paraId: 1000, native: true, receiverKind: 'AccountId32' as const },
  [chain.moonriver]: { paraId: 2023, native: false, receiverKind: 'AccountKey20' as const },
  [chain.karura]: { paraId: 2000, native: false, receiverKind: 'AccountId32' as const },
});

const reviewedRelayExecution = (
  originChainId: string,
  destinationChainId: string,
  assetXcmId: string,
  assetPrecision: number
): Readonly<ReviewedCrossChainExecution> | undefined => {
  const destination = relayDestination[destinationChainId as keyof typeof relayDestination];
  const relayNetwork =
    originChainId === chain.polkadot ? 'Polkadot' : originChainId === chain.kusama ? 'Kusama' : undefined;
  if (!destination || !relayNetwork) return undefined;

  return {
    kind: 'relay-native-xcm-v3',
    originChainId,
    destinationChainId,
    assetXcmId,
    assetPrecision,
    pallet: 'xcmPallet',
    call: destination.native ? 'limitedTeleportAssets' : 'limitedReserveTransferAssets',
    callCandidates: [
      reviewedCall(
        'xcmPallet',
        destination.native ? 'limitedTeleportAssets' : 'limitedReserveTransferAssets',
        XCM_LIMITED_ARGS
      ),
    ],
    destinationFee: '0',
    relayNetwork,
    destinationParaId: destination.paraId,
    receiverKind: destination.receiverKind,
    assetParents: 0,
    assetInteriors: [],
  };
};

const walletXcmRoute = (
  originChainId: string,
  destinationChainId: string,
  originAssetId: string,
  assetKeyAssetId: string,
  symbol: 'DOT' | 'KSM',
  precision: number,
  originEcosystem: ReviewedRouteEcosystem = 'substrate',
  destinationEcosystem: ReviewedRouteEcosystem = 'substrate'
) => {
  const routeXcmAssetId = symbol === 'DOT' ? xcmAsset.dot : xcmAsset.ksm;

  return defineReviewedCrossChainRoute({
    providerId: 'wallet-xcm',
    originChainId,
    destinationChainId,
    originEcosystem,
    destinationEcosystem,
    originAssetId,
    assetKeyAssetId,
    originXcmAssetId: routeXcmAssetId,
    destinationXcmAssetId: routeXcmAssetId,
    symbol,
    precision,
    minimum: null,
    execution: reviewedRelayExecution(originChainId, destinationChainId, routeXcmAssetId, precision),
  });
};

const bridgeRoute = (input: Omit<DefinitionInput, 'originEcosystem' | 'destinationEcosystem'>) =>
  defineReviewedCrossChainRoute({
    ...input,
    originEcosystem: 'substrate',
    destinationEcosystem: 'substrate',
  });

const externalToSoraExecution = ({
  originChainId,
  assetXcmId,
  assetPrecision,
  source,
  relayNetwork,
  soraParachainId,
  soraParachainChainId,
  soraAssetId,
  bridgeParachainId,
  currencyId,
}: {
  originChainId: string;
  assetXcmId: string;
  assetPrecision: number;
  source: ReviewedExternalToSoraExecution['source'];
  relayNetwork: ReviewedExternalToSoraExecution['relayNetwork'];
  soraParachainId: number;
  soraParachainChainId: string;
  soraAssetId: string;
  bridgeParachainId?: number;
  currencyId?: Readonly<{ Token: 'ACA' }>;
}): ReviewedExternalToSoraExecution => ({
  kind: 'external-to-sora-xcm-v3',
  originChainId,
  destinationChainId: chain.sora,
  assetXcmId,
  assetPrecision,
  source,
  relayNetwork,
  soraParachainId,
  soraParachainChainId,
  soraAssetId,
  soraAssetKind: 'Sidechain',
  bridgeNetwork: relayNetwork,
  bridgeParachainId,
  currencyId,
  callCandidates:
    source === 'relay-native'
      ? [reviewedCall('xcmPallet', 'reserveTransferAssets', XCM_RESERVE_ARGS)]
      : source === 'acala-native'
        ? [reviewedCall('xTokens', 'transfer', ['currencyId', 'amount', 'dest', 'destWeightLimit'])]
        : [reviewedCall('polkadotXcm', 'reserveTransferAssets', XCM_RESERVE_ARGS)],
  destinationFee: '0',
  destinationMinimum: {
    kind: 'sora-parachain-asset-minimum',
    chainId: soraParachainChainId,
    assetId: soraAssetId,
    precision: assetPrecision,
  },
});

const soraBridgeExecution = ({
  destinationChainId,
  assetXcmId,
  bridgeNetwork,
  recipientKind,
  destinationParaId,
  soraAssetId,
  soraAssetKind,
  sidechainPrecision,
  externalAsset,
  destinationFee,
  destinationMinimum,
}: {
  destinationChainId: string;
  assetXcmId: string;
  bridgeNetwork: ReviewedSoraBridgeExecution['bridgeNetwork'];
  recipientKind: ReviewedSoraBridgeExecution['recipientKind'];
  destinationParaId?: number;
  soraAssetId: string;
  soraAssetKind: ReviewedSoraBridgeExecution['soraAssetKind'];
  sidechainPrecision: number;
  externalAsset: ReviewedSoraBridgeExecution['externalAsset'];
  destinationFee: string;
  destinationMinimum?: ReviewedDestinationMinimum;
}): ReviewedSoraBridgeExecution => ({
  kind: 'sora-bridge-proxy-burn-v3',
  originChainId: chain.sora,
  destinationChainId,
  assetXcmId,
  assetPrecision: 18,
  bridgeNetwork,
  recipientKind,
  destinationParaId,
  soraAssetId,
  soraAssetKind,
  sidechainPrecision,
  externalAsset,
  callCandidates: [reviewedCall('bridgeProxy', 'burn', BRIDGE_BURN_ARGS)],
  destinationFee,
  destinationMinimum,
});

const liberlandToSoraExecution = ({
  assetXcmId,
  assetPrecision,
  externalAsset,
  soraAssetId,
  soraAssetKind,
}: {
  assetXcmId: string;
  assetPrecision: number;
  externalAsset: ReviewedLiberlandToSoraExecution['externalAsset'];
  soraAssetId: string;
  soraAssetKind: ReviewedLiberlandToSoraExecution['soraAssetKind'];
}): ReviewedLiberlandToSoraExecution => ({
  kind: 'liberland-to-sora-burn',
  originChainId: chain.liberland,
  destinationChainId: chain.sora,
  assetXcmId,
  assetPrecision,
  externalAsset,
  soraAssetId,
  soraAssetKind,
  sidechainPrecision: assetPrecision,
  callCandidates: [reviewedCall('soraBridgeApp', 'burn', BRIDGE_BURN_ARGS)],
  destinationFee: '0',
});

/**
 * Transaction authority shipped with the extension. Remote network JSON can make one of these
 * routes unavailable, but it cannot add a route, change its provider, substitute an AssetKey, or
 * lower its reviewed minimum.
 */
export const BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES: readonly Readonly<ReviewedCrossChainRouteDefinition>[] =
  Object.freeze([
    walletXcmRoute(
      chain.polkadot,
      chain.polkadotAssetHub,
      '887a17c7-1370-4de0-97dd-5422e294fa75',
      '887a17c7-1370-4de0-97dd-5422e294fa75',
      'DOT',
      10
    ),
    walletXcmRoute(
      chain.polkadot,
      chain.moonbeam,
      '887a17c7-1370-4de0-97dd-5422e294fa75',
      '887a17c7-1370-4de0-97dd-5422e294fa75',
      'DOT',
      10,
      'substrate',
      'evm'
    ),
    walletXcmRoute(
      chain.polkadot,
      chain.acala,
      '887a17c7-1370-4de0-97dd-5422e294fa75',
      '887a17c7-1370-4de0-97dd-5422e294fa75',
      'DOT',
      10
    ),
    walletXcmRoute(
      chain.polkadot,
      chain.parallel,
      '887a17c7-1370-4de0-97dd-5422e294fa75',
      '887a17c7-1370-4de0-97dd-5422e294fa75',
      'DOT',
      10
    ),
    walletXcmRoute(
      chain.kusama,
      chain.kusamaAssetHub,
      '1e0c2ec6-935f-49bd-a854-5e12ee6c9f1b',
      '1e0c2ec6-935f-49bd-a854-5e12ee6c9f1b',
      'KSM',
      12
    ),
    walletXcmRoute(
      chain.kusama,
      chain.moonriver,
      '1e0c2ec6-935f-49bd-a854-5e12ee6c9f1b',
      '1e0c2ec6-935f-49bd-a854-5e12ee6c9f1b',
      'KSM',
      12,
      'substrate',
      'evm'
    ),
    walletXcmRoute(
      chain.kusama,
      chain.karura,
      '1e0c2ec6-935f-49bd-a854-5e12ee6c9f1b',
      '1e0c2ec6-935f-49bd-a854-5e12ee6c9f1b',
      'KSM',
      12
    ),
    walletXcmRoute(
      chain.polkadotAssetHub,
      chain.polkadot,
      '887a17c7-1370-4de0-97dd-5422e294fa75',
      '887a17c7-1370-4de0-97dd-5422e294fa75',
      'DOT',
      10
    ),
    walletXcmRoute(
      chain.acala,
      chain.polkadot,
      'ed98bee1-34ce-4aa2-896e-508380dea1c2',
      'ed98bee1-34ce-4aa2-896e-508380dea1c2',
      'DOT',
      10
    ),
    walletXcmRoute(chain.parallel, chain.polkadot, '769ffb89-fd2f-4add-94a1-d2f9f716c143', '101', 'DOT', 10),
    walletXcmRoute(
      chain.moonbeam,
      chain.polkadot,
      '7e4e064e-2b23-4eb5-96db-e6491c4031e5',
      '42259045809535163221576417993425387648',
      'DOT',
      10,
      'evm'
    ),
    walletXcmRoute(
      chain.kusamaAssetHub,
      chain.kusama,
      '1e0c2ec6-935f-49bd-a854-5e12ee6c9f1b',
      '1e0c2ec6-935f-49bd-a854-5e12ee6c9f1b',
      'KSM',
      12
    ),
    walletXcmRoute(
      chain.karura,
      chain.kusama,
      '223b0282-b5c9-48ed-87e3-5e9ef6714ac8',
      '223b0282-b5c9-48ed-87e3-5e9ef6714ac8',
      'KSM',
      12
    ),
    walletXcmRoute(
      chain.moonriver,
      chain.kusama,
      '980af72c-d1b8-46c7-9793-fa87912652ec',
      '42259045809535163221576417993425387648',
      'KSM',
      12,
      'evm'
    ),
    walletXcmRoute(
      chain.bifrost,
      chain.kusama,
      '922c191c-4cb8-407e-8b81-2cfc52170c3b',
      '922c191c-4cb8-407e-8b81-2cfc52170c3b',
      'KSM',
      12
    ),

    bridgeRoute({
      providerId: 'sora-substrate-bridge',
      originChainId: chain.polkadot,
      destinationChainId: chain.sora,
      originAssetId: '887a17c7-1370-4de0-97dd-5422e294fa75',
      assetKeyAssetId: '887a17c7-1370-4de0-97dd-5422e294fa75',
      originXcmAssetId: xcmAsset.dot,
      destinationXcmAssetId: xcmAsset.dot,
      symbol: 'DOT',
      precision: 10,
      minimum: '1.1',
      execution: externalToSoraExecution({
        originChainId: chain.polkadot,
        assetXcmId: xcmAsset.dot,
        assetPrecision: 10,
        source: 'relay-native',
        relayNetwork: 'Polkadot',
        soraParachainId: soraParachain.polkadot.paraId,
        soraParachainChainId: soraParachain.polkadot.chainId,
        soraAssetId: '0x0003b1dbee890acfb1b3bc12d1bb3b4295f52755423f84d1751b2545cebf000b',
      }),
    }),
    bridgeRoute({
      providerId: 'sora-substrate-bridge',
      originChainId: chain.kusama,
      destinationChainId: chain.sora,
      originAssetId: '1e0c2ec6-935f-49bd-a854-5e12ee6c9f1b',
      assetKeyAssetId: '1e0c2ec6-935f-49bd-a854-5e12ee6c9f1b',
      originXcmAssetId: xcmAsset.ksm,
      destinationXcmAssetId: xcmAsset.ksm,
      symbol: 'KSM',
      precision: 12,
      minimum: '0.05',
      execution: externalToSoraExecution({
        originChainId: chain.kusama,
        assetXcmId: xcmAsset.ksm,
        assetPrecision: 12,
        source: 'relay-native',
        relayNetwork: 'Kusama',
        soraParachainId: soraParachain.kusama.paraId,
        soraParachainChainId: soraParachain.kusama.chainId,
        soraAssetId: '0x00117b0fa73c4672e03a7d9d774e3b3f91beb893e93d9a8d0430295f44225db8',
      }),
    }),
    bridgeRoute({
      providerId: 'sora-substrate-bridge',
      originChainId: chain.acala,
      destinationChainId: chain.sora,
      originAssetId: 'c801d6c1-3edf-41a9-9aea-da705eab249b',
      assetKeyAssetId: 'c801d6c1-3edf-41a9-9aea-da705eab249b',
      originXcmAssetId: '7528bb5b-2aa9-4a70-a4ed-3476aec0f87d',
      destinationXcmAssetId: '7528bb5b-2aa9-4a70-a4ed-3476aec0f87d',
      symbol: 'ACA',
      precision: 12,
      minimum: '56',
      execution: externalToSoraExecution({
        originChainId: chain.acala,
        assetXcmId: '7528bb5b-2aa9-4a70-a4ed-3476aec0f87d',
        assetPrecision: 12,
        source: 'acala-native',
        relayNetwork: 'Polkadot',
        soraParachainId: soraParachain.polkadot.paraId,
        soraParachainChainId: soraParachain.polkadot.chainId,
        soraAssetId: '0x001ddbe1a880031da72f7ea421260bec635fa7d1aa72593d5412795408b6b2ba',
        bridgeParachainId: 2000,
        currencyId: { Token: 'ACA' },
      }),
    }),
    bridgeRoute({
      providerId: 'sora-substrate-bridge',
      originChainId: chain.astar,
      destinationChainId: chain.sora,
      originAssetId: '5ab1e8d-81ed-4130-9d29-55b549cc6bab',
      assetKeyAssetId: '5ab1e8d-81ed-4130-9d29-55b549cc6bab',
      originXcmAssetId: '5ab1e8d-81ed-4130-9d29-55b549cc6bab',
      destinationXcmAssetId: '5ab1e8d-81ed-4130-9d29-55b549cc6bab',
      symbol: 'ASTR',
      precision: 18,
      minimum: '73',
      execution: externalToSoraExecution({
        originChainId: chain.astar,
        assetXcmId: '5ab1e8d-81ed-4130-9d29-55b549cc6bab',
        assetPrecision: 18,
        source: 'astar-native',
        relayNetwork: 'Polkadot',
        soraParachainId: soraParachain.polkadot.paraId,
        soraParachainChainId: soraParachain.polkadot.chainId,
        soraAssetId: '0x009dd037fcb32f4fe17c513abd4641a2ece844d106e30788124f0c0acc6e748e',
        bridgeParachainId: 2006,
      }),
    }),
    bridgeRoute({
      providerId: 'sora-substrate-bridge',
      originChainId: chain.sora,
      destinationChainId: chain.kusama,
      originAssetId: '5416b261-a759-4ba6-bc83-ea79a83c5101',
      assetKeyAssetId: '0x00117b0fa73c4672e03a7d9d774e3b3f91beb893e93d9a8d0430295f44225db8',
      originXcmAssetId: '5416b261-a759-4ba6-bc83-ea79a83c5101',
      destinationXcmAssetId: '5416b261-a759-4ba6-bc83-ea79a83c5101',
      symbol: 'KSM',
      precision: 18,
      minimum: null,
      execution: soraBridgeExecution({
        destinationChainId: chain.kusama,
        assetXcmId: '5416b261-a759-4ba6-bc83-ea79a83c5101',
        bridgeNetwork: 'Kusama',
        recipientKind: 'relay',
        soraAssetId: '0x00117b0fa73c4672e03a7d9d774e3b3f91beb893e93d9a8d0430295f44225db8',
        soraAssetKind: 'Sidechain',
        sidechainPrecision: 12,
        externalAsset: null,
        destinationFee: '0.0000900058',
        destinationMinimum: { kind: 'balances-existential-deposit', precision: 12 },
      }),
    }),
    bridgeRoute({
      providerId: 'sora-substrate-bridge',
      originChainId: chain.sora,
      destinationChainId: chain.polkadot,
      originAssetId: 'cd092a5a-4eb6-4318-9f11-4bf8454d67a2',
      assetKeyAssetId: '0x0003b1dbee890acfb1b3bc12d1bb3b4295f52755423f84d1751b2545cebf000b',
      originXcmAssetId: 'cd092a5a-4eb6-4318-9f11-4bf8454d67a2',
      destinationXcmAssetId: xcmAsset.dot,
      symbol: 'DOT',
      precision: 18,
      minimum: '1.1',
      execution: soraBridgeExecution({
        destinationChainId: chain.polkadot,
        assetXcmId: 'cd092a5a-4eb6-4318-9f11-4bf8454d67a2',
        bridgeNetwork: 'Polkadot',
        recipientKind: 'relay',
        soraAssetId: '0x0003b1dbee890acfb1b3bc12d1bb3b4295f52755423f84d1751b2545cebf000b',
        soraAssetKind: 'Sidechain',
        sidechainPrecision: 10,
        externalAsset: null,
        destinationFee: '0.0364421524',
        destinationMinimum: { kind: 'balances-existential-deposit', precision: 10 },
      }),
    }),
    bridgeRoute({
      providerId: 'sora-substrate-bridge',
      originChainId: chain.sora,
      destinationChainId: chain.acala,
      originAssetId: 'fb88fa55-b8c8-4ff1-afa8-f72a86a238a4',
      assetKeyAssetId: '0x001ddbe1a880031da72f7ea421260bec635fa7d1aa72593d5412795408b6b2ba',
      originXcmAssetId: 'fb88fa55-b8c8-4ff1-afa8-f72a86a238a4',
      destinationXcmAssetId: 'fb88fa55-b8c8-4ff1-afa8-f72a86a238a4',
      symbol: 'ACA',
      precision: 18,
      minimum: '1.1',
      execution: soraBridgeExecution({
        destinationChainId: chain.acala,
        assetXcmId: 'fb88fa55-b8c8-4ff1-afa8-f72a86a238a4',
        bridgeNetwork: 'Polkadot',
        recipientKind: 'parachain',
        destinationParaId: 2000,
        soraAssetId: '0x001ddbe1a880031da72f7ea421260bec635fa7d1aa72593d5412795408b6b2ba',
        soraAssetKind: 'Sidechain',
        sidechainPrecision: 12,
        externalAsset: null,
        destinationFee: '0.0064296',
        destinationMinimum: { kind: 'acala-token-minimum', token: 'ACA', precision: 12 },
      }),
    }),
    bridgeRoute({
      providerId: 'sora-substrate-bridge',
      originChainId: chain.sora,
      destinationChainId: chain.astar,
      originAssetId: 'acc32ee0-8fdc-4743-91e1-f70cc4f3069b',
      assetKeyAssetId: '0x009dd037fcb32f4fe17c513abd4641a2ece844d106e30788124f0c0acc6e748e',
      originXcmAssetId: 'acc32ee0-8fdc-4743-91e1-f70cc4f3069b',
      destinationXcmAssetId: 'acc32ee0-8fdc-4743-91e1-f70cc4f3069b',
      symbol: 'ASTR',
      precision: 18,
      minimum: null,
      execution: soraBridgeExecution({
        destinationChainId: chain.astar,
        assetXcmId: 'acc32ee0-8fdc-4743-91e1-f70cc4f3069b',
        bridgeNetwork: 'Polkadot',
        recipientKind: 'parachain',
        destinationParaId: 2006,
        soraAssetId: '0x009dd037fcb32f4fe17c513abd4641a2ece844d106e30788124f0c0acc6e748e',
        soraAssetKind: 'Sidechain',
        sidechainPrecision: 18,
        externalAsset: null,
        destinationFee: '0.150481591364315913',
        destinationMinimum: { kind: 'balances-existential-deposit', precision: 18 },
      }),
    }),
    bridgeRoute({
      providerId: 'liberland-bridge',
      originChainId: chain.sora,
      destinationChainId: chain.liberland,
      originAssetId: '1c3b4fcb-5a5f-4319-9dce-d178006eb9bf',
      assetKeyAssetId: '0x00513be65493a7fc3e2128d4230061a530acf40478a4affa20bbba27a310673e',
      originXcmAssetId: 'a6b83d39-a488-4b34-8352-280705a792ea',
      destinationXcmAssetId: 'a6b83d39-a488-4b34-8352-280705a792ea',
      symbol: 'LLD',
      precision: 18,
      minimum: '1.1',
      execution: soraBridgeExecution({
        destinationChainId: chain.liberland,
        assetXcmId: 'a6b83d39-a488-4b34-8352-280705a792ea',
        bridgeNetwork: 'Liberland',
        recipientKind: 'liberland',
        soraAssetId: '0x00513be65493a7fc3e2128d4230061a530acf40478a4affa20bbba27a310673e',
        soraAssetKind: 'Sidechain',
        sidechainPrecision: 12,
        externalAsset: 'LLD',
        destinationFee: '0',
        destinationMinimum: { kind: 'balances-existential-deposit', precision: 12 },
      }),
    }),
    bridgeRoute({
      providerId: 'liberland-bridge',
      originChainId: chain.sora,
      destinationChainId: chain.liberland,
      originAssetId: 'b774c386-5cce-454a-a845-1ec0381538ec',
      assetKeyAssetId: '0x0200000000000000000000000000000000000000000000000000000000000000',
      originXcmAssetId: 'b774c386-5cce-454a-a845-1ec0381538ec',
      destinationXcmAssetId: 'b774c386-5cce-454a-a845-1ec0381538ec',
      symbol: 'XOR',
      precision: 18,
      minimum: null,
      execution: soraBridgeExecution({
        destinationChainId: chain.liberland,
        assetXcmId: 'b774c386-5cce-454a-a845-1ec0381538ec',
        bridgeNetwork: 'Liberland',
        recipientKind: 'liberland',
        soraAssetId: '0x0200000000000000000000000000000000000000000000000000000000000000',
        soraAssetKind: 'Thischain',
        sidechainPrecision: 18,
        externalAsset: 774441749,
        destinationFee: '0',
        destinationMinimum: { kind: 'assets-min-balance', assetId: 774441749, precision: 18 },
      }),
    }),
    bridgeRoute({
      providerId: 'liberland-bridge',
      originChainId: chain.sora,
      destinationChainId: chain.liberland,
      originAssetId: '0ef3afdc-cdd3-47cc-bd52-817c54ae65b5',
      assetKeyAssetId: '0x00073edd278e1bd6a7f9d0b27d4f3e93b73c8f0832b58a4df13c69611a99f156',
      originXcmAssetId: '0ef3afdc-cdd3-47cc-bd52-817c54ae65b5',
      destinationXcmAssetId: '0ef3afdc-cdd3-47cc-bd52-817c54ae65b5',
      symbol: 'LLM',
      precision: 18,
      minimum: null,
      execution: soraBridgeExecution({
        destinationChainId: chain.liberland,
        assetXcmId: '0ef3afdc-cdd3-47cc-bd52-817c54ae65b5',
        bridgeNetwork: 'Liberland',
        recipientKind: 'liberland',
        soraAssetId: '0x00073edd278e1bd6a7f9d0b27d4f3e93b73c8f0832b58a4df13c69611a99f156',
        soraAssetKind: 'Sidechain',
        sidechainPrecision: 12,
        externalAsset: 1,
        destinationFee: '0',
        destinationMinimum: { kind: 'assets-min-balance', assetId: 1, precision: 12 },
      }),
    }),
    bridgeRoute({
      providerId: 'liberland-bridge',
      originChainId: chain.liberland,
      destinationChainId: chain.sora,
      originAssetId: 'a6b83d39-a488-4b34-8352-280705a792ea',
      assetKeyAssetId: 'a6b83d39-a488-4b34-8352-280705a792ea',
      originXcmAssetId: 'a6b83d39-a488-4b34-8352-280705a792e',
      destinationXcmAssetId: 'a6b83d39-a488-4b34-8352-280705a792e',
      symbol: 'LLD',
      precision: 12,
      minimum: '1.1',
      execution: liberlandToSoraExecution({
        assetXcmId: 'a6b83d39-a488-4b34-8352-280705a792e',
        assetPrecision: 12,
        externalAsset: 'LLD',
        soraAssetId: '0x00513be65493a7fc3e2128d4230061a530acf40478a4affa20bbba27a310673e',
        soraAssetKind: 'Sidechain',
      }),
    }),
    bridgeRoute({
      providerId: 'liberland-bridge',
      originChainId: chain.liberland,
      destinationChainId: chain.sora,
      originAssetId: '30b43eb9-36b4-4b40-bf72-330d2e20ee86',
      assetKeyAssetId: '1',
      originXcmAssetId: '30b43eb9-36b4-4b40-bf72-330d2e20ee86',
      destinationXcmAssetId: '30b43eb9-36b4-4b40-bf72-330d2e20ee86',
      symbol: 'LLM',
      precision: 12,
      minimum: null,
      execution: liberlandToSoraExecution({
        assetXcmId: '30b43eb9-36b4-4b40-bf72-330d2e20ee86',
        assetPrecision: 12,
        externalAsset: 1,
        soraAssetId: '0x00073edd278e1bd6a7f9d0b27d4f3e93b73c8f0832b58a4df13c69611a99f156',
        soraAssetKind: 'Sidechain',
      }),
    }),
    bridgeRoute({
      providerId: 'liberland-bridge',
      originChainId: chain.liberland,
      destinationChainId: chain.sora,
      originAssetId: '2e7179c9-4308-420e-a654-43c92d119717',
      assetKeyAssetId: '774441749',
      originXcmAssetId: '2e7179c9-4308-420e-a654-43c92d119717',
      destinationXcmAssetId: '2e7179c9-4308-420e-a654-43c92d119717',
      symbol: 'XOR',
      precision: 18,
      minimum: null,
      execution: liberlandToSoraExecution({
        assetXcmId: '2e7179c9-4308-420e-a654-43c92d119717',
        assetPrecision: 18,
        externalAsset: 774441749,
        soraAssetId: '0x0200000000000000000000000000000000000000000000000000000000000000',
        soraAssetKind: 'Thischain',
      }),
    }),
  ]);

const routeIds = new Set(BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES.map(({ id }) => id));

if (routeIds.size !== BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES.length) {
  throw new Error('Bundled reviewed cross-chain route ids must be unique.');
}

export function findBundledReviewedCrossChainRoute(
  routeId: string,
  routes: readonly Readonly<ReviewedCrossChainRouteDefinition>[] = BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES
): Readonly<ReviewedCrossChainRouteDefinition> | undefined {
  const matches = routes.filter((route) => route.id === routeId);

  return matches.length === 1 ? matches[0] : undefined;
}
