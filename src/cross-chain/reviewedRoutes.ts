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
  if (retiredCrossChainRouteReason(input)) throw new Error('cross_chain_route_retired');
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

type RelayNetwork = ReviewedRelayExecution['relayNetwork'];

const RELAY_CHAIN_IDS: Readonly<Record<RelayNetwork, string>> = Object.freeze({
  Polkadot: chain.polkadot,
  Kusama: chain.kusama,
});

/**
 * The relay network of each parachain a bundled execution can address. Relay executions encode the destination by
 * para id alone, and para ids repeat across relays (Asset Hub is 1000 on both, Acala and Karura are both 2000), so a
 * relay execution is only bundled, and only encoded, when its origin is the relay chain its destination belongs to.
 */
const PARACHAIN_RELAY: Readonly<Record<string, RelayNetwork>> = Object.freeze({
  [chain.polkadotAssetHub]: 'Polkadot',
  [chain.kusamaAssetHub]: 'Kusama',
  [chain.acala]: 'Polkadot',
  [chain.astar]: 'Polkadot',
  [chain.moonbeam]: 'Polkadot',
  [chain.parallel]: 'Polkadot',
  [chain.karura]: 'Kusama',
  [chain.bifrost]: 'Kusama',
  [chain.moonriver]: 'Kusama',
});

export function relayExecutionSharesRelay(
  execution: Pick<ReviewedRelayExecution, 'relayNetwork' | 'originChainId' | 'destinationChainId'>
): boolean {
  return (
    RELAY_CHAIN_IDS[execution.relayNetwork] === execution.originChainId &&
    PARACHAIN_RELAY[execution.destinationChainId] === execution.relayNetwork
  );
}

/**
 * Chains that must never be an origin or destination of a reviewed route. Checked on 2026-10-23
 * against the relay chains' parachain registrars: none of these para ids is registered any more, and
 * the operators announced the shutdowns (Moonbeam and Moonriver in July 2026, Parallel abandoned).
 * A route into a halted or unregistered chain can strand funds.
 */
export const RETIRED_CROSS_CHAIN_CHAINS: Readonly<Record<string, string>> = Object.freeze({
  [chain.moonbeam]: 'Moonbeam was shut down in July 2026 and its parachain is no longer registered on Polkadot.',
  [chain.moonriver]: 'Moonriver was shut down in July 2026 and its parachain is no longer registered on Kusama.',
  [chain.parallel]: 'Parallel Finance stopped operating and its parachain is no longer registered on Polkadot.',
});

/**
 * Since the Asset Hub Migration (Kusama 2025-10-07, Polkadot 2025-11-04) DOT and KSM balances live on
 * Asset Hub, and parachains move their DOT/KSM reserve from the relay chain to Asset Hub on their own
 * schedule. Verified on 2026-10-23 with the runtimes' dry-run API: relay ↔ Asset Hub teleports still
 * execute, while every limitedReserveTransferAssets shape from or to a relay chain is rejected
 * (Filtered / InvalidAssetUnknownReserve). The SORA parachains also keep their DOT/KSM backing on Asset
 * Hub now. Relay routes other than the Asset Hub teleport pairs below stay retired until they are
 * re-qualified against Asset Hub with funded evidence.
 */
const relayAssetHubTeleportPairs: ReadonlyMap<string, string> = new Map([
  [chain.polkadot, chain.polkadotAssetHub],
  [chain.kusama, chain.kusamaAssetHub],
]);

const relayChainIds: ReadonlySet<string> = new Set([chain.polkadot, chain.kusama]);

/**
 * SORA's bridges to the Polkadot and Kusama networks run through the SORA parachains (para 2025 on Polkadot,
 * para 2011 on Kusama), and both have stopped producing blocks. Read from the relay chains' `paras.heads` on
 * 2026-10-24: the Polkadot one has been at parachain block 4,850,969 since relay block 29,053,378 (2025-12-13) and
 * the Kusama one at 6,535,527 since 2025-11-11, while Acala, Astar and Asset Hub advance normally. SORA's own
 * bridge records agree: no inbound transfer from either network completed after those dates, and every outbound
 * burn since then toward a relay account (5 DOT, 9 KSM) is still "Committed". A transfer toward or from the SORA
 * parachains can therefore be burned or reserved without ever being credited.
 *
 * SORA to Liberland is retired for a different reason: its last three outbound transfers (2081 LLD, 1 LLD and
 * 4 LLD, May and June 2026) are still pending after 502 earlier ones completed, so the SORA-to-Liberland
 * direction is not being delivered. Liberland to SORA still completes (the latest on 2026-10-21) and stays.
 *
 * Every route that touches SORA other than Liberland to SORA is therefore retired until the operators confirm
 * delivery and funded evidence exists.
 */
const SORA_PARACHAIN_HALTED =
  'The SORA parachains for Polkadot and Kusama have stopped producing blocks, so SORA bridge transfers to or from those networks cannot be delivered.';
const SORA_TO_LIBERLAND_STALLED =
  'SORA to Liberland transfers are not being delivered: the latest ones are still pending after several months.';

export function retiredCrossChainRouteReason(
  input: Pick<DefinitionInput, 'originChainId' | 'destinationChainId' | 'symbol' | 'execution'>
): string | undefined {
  const retiredChain =
    RETIRED_CROSS_CHAIN_CHAINS[input.originChainId] ?? RETIRED_CROSS_CHAIN_CHAINS[input.destinationChainId];
  if (retiredChain) return retiredChain;

  if (input.originChainId === chain.sora && input.destinationChainId === chain.liberland) {
    return SORA_TO_LIBERLAND_STALLED;
  }
  const touchesSora = input.originChainId === chain.sora || input.destinationChainId === chain.sora;
  const isLiberlandToSora = input.originChainId === chain.liberland && input.destinationChainId === chain.sora;
  if (touchesSora && !isLiberlandToSora) return SORA_PARACHAIN_HALTED;

  const movesRelayAsset = input.symbol === 'DOT' || input.symbol === 'KSM';
  const touchesRelay = relayChainIds.has(input.originChainId) || relayChainIds.has(input.destinationChainId);
  const isAssetHubTeleport =
    input.execution?.kind === 'relay-native-xcm-v3' &&
    input.execution.call === 'limitedTeleportAssets' &&
    relayAssetHubTeleportPairs.get(input.originChainId) === input.destinationChainId;

  if (movesRelayAsset && touchesRelay && !isAssetHubTeleport) {
    return 'DOT and KSM moved to Asset Hub in the Asset Hub Migration; this relay-chain route is retired until it is re-qualified.';
  }

  return undefined;
}

const xcmAsset = Object.freeze({
  dot: '99e66d4f-00cd-4d73-bd1b-3adadcacffb2',
  ksm: '0ceffe96-8090-404e-815c-91118ee5dd65',
});

// Relay-chain origins may only teleport to their own Asset Hub; see retiredCrossChainRouteReason.
const relayDestination = Object.freeze({
  [chain.polkadotAssetHub]: { paraId: 1000, native: true, receiverKind: 'AccountId32' as const },
  [chain.kusamaAssetHub]: { paraId: 1000, native: true, receiverKind: 'AccountId32' as const },
});

/**
 * Reviewed upper estimates of the fee Asset Hub deducts from a relay teleport (measured 2026-10-23 with the
 * destination dry-run API: 0.00082 DOT and 0.0000554 KSM, rounded up).
 */
const relayTeleportDestinationFee: Readonly<Record<'Polkadot' | 'Kusama', string>> = Object.freeze({
  Polkadot: '0.001',
  Kusama: '0.0001',
});

/**
 * Reviewed floors for a relay teleport to a new account: Asset Hub's existential deposit (0.01 DOT, 0.0000033 KSM)
 * plus its fee, with a margin. Dry runs on 2026-10-23 against the live runtimes: 0.0005 DOT, 0.005 DOT and
 * 0.0108 DOT are trapped on arrival and 0.0112 DOT completes; 0.00005 KSM is trapped and 0.0001 KSM completes.
 */
const relayTeleportMinimum: Readonly<Record<'DOT' | 'KSM', string>> = Object.freeze({
  DOT: '0.02',
  KSM: '0.0002',
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
  if (!destination || !relayNetwork || PARACHAIN_RELAY[destinationChainId] !== relayNetwork) return undefined;

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
    // Asset Hub charges its execution fee out of the teleported amount, so the recipient receives less
    // than was sent, and an amount that arrives below Asset Hub's existential deposit is trapped.
    destinationFee: relayTeleportDestinationFee[relayNetwork],
    destinationMinimum: { kind: 'balances-existential-deposit', precision: assetPrecision },
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
    minimum: relayTeleportMinimum[symbol],
    execution: reviewedRelayExecution(originChainId, destinationChainId, routeXcmAssetId, precision),
  });
};

const bridgeRoute = (input: Omit<DefinitionInput, 'originEcosystem' | 'destinationEcosystem'>) =>
  defineReviewedCrossChainRoute({
    ...input,
    originEcosystem: 'substrate',
    destinationEcosystem: 'substrate',
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

type RouteDefinition = () => Readonly<ReviewedCrossChainRouteDefinition>;

/**
 * Builds the bundled route table without letting one bad definition take the background down at import: a definition
 * that throws is left out, every route sharing a duplicated id is left out, and each problem is reported. The bundle
 * test requires the list of problems to be empty, so a bad definition fails the build instead.
 */
export function buildBundledReviewedRoutes(definitions: readonly RouteDefinition[]): {
  routes: readonly Readonly<ReviewedCrossChainRouteDefinition>[];
  errors: readonly string[];
} {
  const errors: string[] = [];
  const routes: Readonly<ReviewedCrossChainRouteDefinition>[] = [];

  definitions.forEach((define, index) => {
    try {
      routes.push(define());
    } catch (error) {
      errors.push(`route definition ${index}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  const counts = new Map<string, number>();
  routes.forEach(({ id }) => counts.set(id, (counts.get(id) ?? 0) + 1));
  counts.forEach((count, id) => {
    if (count > 1) errors.push(`route ${id}: duplicate id`);
  });

  if (errors.length) console.error('Bundled cross-chain routes left out', errors);

  return {
    routes: Object.freeze(routes.filter(({ id }) => counts.get(id) === 1)),
    errors: Object.freeze(errors),
  };
}

const bundledRoutes = buildBundledReviewedRoutes([
  () =>
    walletXcmRoute(
      chain.polkadot,
      chain.polkadotAssetHub,
      '887a17c7-1370-4de0-97dd-5422e294fa75',
      '887a17c7-1370-4de0-97dd-5422e294fa75',
      'DOT',
      10
    ),
  () =>
    walletXcmRoute(
      chain.kusama,
      chain.kusamaAssetHub,
      '1e0c2ec6-935f-49bd-a854-5e12ee6c9f1b',
      '1e0c2ec6-935f-49bd-a854-5e12ee6c9f1b',
      'KSM',
      12
    ),
  () =>
    bridgeRoute({
      providerId: 'liberland-bridge',
      originChainId: chain.liberland,
      destinationChainId: chain.sora,
      originAssetId: 'a6b83d39-a488-4b34-8352-280705a792ea',
      assetKeyAssetId: 'a6b83d39-a488-4b34-8352-280705a792ea',
      // The registry's XCM id for LLD is one character short of a UUID. It is copied as is on purpose: the catalog
      // match needs the registry's exact id, so if the registry corrects it this route stops matching and fails
      // closed until the bundle follows.
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
  () =>
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
  () =>
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

/**
 * Transaction authority shipped with the extension. Remote network JSON can make one of these
 * routes unavailable, but it cannot add a route, change its provider, substitute an AssetKey, or
 * lower its reviewed minimum.
 */
export const BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES: readonly Readonly<ReviewedCrossChainRouteDefinition>[] =
  bundledRoutes.routes;

/** Problems found while building the bundled routes; a correct bundle has none. */
export const BUNDLED_REVIEWED_ROUTE_ERRORS: readonly string[] = bundledRoutes.errors;

export function findBundledReviewedCrossChainRoute(
  routeId: string,
  routes: readonly Readonly<ReviewedCrossChainRouteDefinition>[] = BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES
): Readonly<ReviewedCrossChainRouteDefinition> | undefined {
  const matches = routes.filter((route) => route.id === routeId);

  return matches.length === 1 ? matches[0] : undefined;
}
