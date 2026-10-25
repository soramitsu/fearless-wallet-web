import type { RouteLocationRaw } from 'vue-router';
import type { MoveHop } from '@/portfolio/dashboard/readiness';
import { parseHoldingKey } from '@/portfolio/dashboard/holdingKey';

/**
 * Where the dashboard hands a person over. It never signs, never invents a route and never fills an amount: it opens
 * the screens the extension already has, with what it knows already chosen. The names are the values of `Components` in
 * src/router/routes.ts (tests/unit/portfolio-dashboard-handoff.spec.ts keeps them equal).
 */
export const ROUTE_NAMES = {
  polkaswap: 'Polkaswap',
  crossChain: 'CrossChain',
  send: 'SendForm',
  receive: 'ReceiveForm',
  locations: 'TokenLocations',
} as const;

/** A SORA asset id as the Polkaswap form names it: a registry id or a hex asset id, nothing else. */
const SORA_ASSET_ID = /^[0-9A-Za-z-]{1,100}$/;

const firstValue = (value: unknown): string | undefined => (Array.isArray(value) ? firstValue(value[0]) : typeof value === 'string' ? value : undefined);

export interface SwapPair {
  from: string;
  to?: string;
}

/** The pair a hand-off to Polkaswap carries, read back from the route's query; anything odd is ignored. */
export function swapPairFromQuery(query: Record<string, unknown>): SwapPair | undefined {
  const from = firstValue(query.from);
  const to = firstValue(query.to);

  if (!from || !SORA_ASSET_ID.test(from)) return undefined;

  return { from, ...(to && SORA_ASSET_ID.test(to) && to !== from ? { to } : {}) };
}

/** Polkaswap, with the pay asset and, when it was picked, the asset to receive. Both are SORA registry asset ids. */
export function swapLocation(pair: SwapPair): RouteLocationRaw {
  return { name: ROUTE_NAMES.polkaswap, query: { from: pair.from, ...(pair.to ? { to: pair.to } : {}) } };
}

/** The cross-chain screen, with the first move's network and asset chosen, as the asset page opens it. */
export function moveLocation(hop: Pick<MoveHop, 'originChainId' | 'assetKey'>): RouteLocationRaw {
  return { name: ROUTE_NAMES.crossChain, query: { originChainId: hop.originChainId, assetKey: hop.assetKey } };
}

/** Send, as the portfolio list opens it for one holding: the asset's registry id and its network. */
export function sendLocation(holding: { key: string; networkName: string }): RouteLocationRaw | undefined {
  const parts = parseHoldingKey(holding.key);

  return parts ? { name: ROUTE_NAMES.send, params: { assetId: parts.assetId, network: holding.networkName } } : undefined;
}

export function receiveLocation(holding: { key: string; networkName: string }): RouteLocationRaw | undefined {
  const parts = parseHoldingKey(holding.key);

  return parts ? { name: ROUTE_NAMES.receive, params: { assetId: parts.assetId, network: holding.networkName } } : undefined;
}

/** Receive on SORA for the asset a reviewed route ends with. */
export function receiveOnSoraLocation(soraAssetId: string, soraNetworkName: string): RouteLocationRaw {
  return { name: ROUTE_NAMES.receive, params: { assetId: soraAssetId, network: soraNetworkName } };
}

/** Where it lives for one token, optionally with one holding chosen. */
export function locationsLocation(tokenKey: string, holdingId?: string): RouteLocationRaw {
  return { name: ROUTE_NAMES.locations, query: { token: tokenKey, ...(holdingId ? { holding: holdingId } : {}) } };
}

/** The registry asset id of a holding's asset, which Send, Receive and Polkaswap name it by. */
export function holdingAssetId(holding: { key: string }): string | undefined {
  return parseHoldingKey(holding.key)?.assetId;
}

/** Acting on a holding of a wallet that is not selected switches to that wallet first (design spec 4.2). */
export const needsWalletSwitch = (holdingAddress: string, selectedAddress: string): boolean => holdingAddress !== selectedAddress;
