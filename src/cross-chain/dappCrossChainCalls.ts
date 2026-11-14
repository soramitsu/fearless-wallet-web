import { stringCamelCase } from '@polkadot/util';
import { decodeAddress, encodeAddress } from '@polkadot/util-crypto';
import type { NetworkJson } from '@extension-base/types';
import {
  ASSET_HUB_MIGRATION_RETIRED,
  BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES,
  DEAD_PARACHAINS,
  REVIEWED_CHAIN_IDS,
  SORA_PARACHAIN_HALTED,
  SORA_TO_LIBERLAND_STALLED,
  bundledRelayNetwork,
  type RetiredDestinationCode,
} from '@/cross-chain/reviewedRoutes';
import { REVIEWED_RUNTIMES } from '@/cross-chain/reviewedRuntimes';

/**
 * Cross-chain calls inside a Substrate payload a connected site asks the wallet to sign.
 *
 * The call is decoded with the wallet's own runtime for that network (see substrateCallReview in the request service),
 * and every XCM or bridge call in it, including those nested in batch, proxy and multisig wrappers, is summarised: where
 * the funds go, to whom, and which assets. A call toward a destination the bundle already knows cannot deliver is
 * marked blocked with the bundle's own reason, and the wallet refuses to sign it. The summary is display data and a
 * refusal rule, never an execution authority: the wallet's own transfers still go only through the reviewed routes.
 */

export const CROSS_CHAIN_DESTINATION_RETIRED = 'cross_chain_destination_retired';

export type CrossChainCallDestination = {
  /** The network as the wallet's catalog or the bridge names it. */
  network?: string;
  relay?: string;
  paraId?: number;
  /** The location as decoded, when the wallet cannot name it. */
  raw?: string;
};

export type CrossChainCallAsset = { asset: string; amount: string };

export type CrossChainCallSummary = {
  /** Where the call sits: "0" is the signed call, "0.1.2" the third call in the second argument of it. */
  path: string;
  /** `pallet.call` as decoded, for example `xcmPallet.limitedTeleportAssets`. */
  call: string;
  destination?: CrossChainCallDestination;
  beneficiary?: string;
  assets: CrossChainCallAsset[];
  /** Raw cross-network instructions whose effect on the other network the wallet cannot show. */
  highRisk: boolean;
  /** Set when the destination is known not to deliver; the wallet refuses to sign. */
  blocked?: { code: RetiredDestinationCode; reason: string };
};

/** A runtime call as polkadot-js decodes it. */
export type DecodedCall = {
  section: string;
  method: string;
  args: readonly unknown[];
  toJSON(): unknown;
  toRawType(): string;
};

type CatalogNetwork = Pick<NetworkJson, 'name' | 'chainId'> & Partial<Pick<NetworkJson, 'parentId' | 'paraId' | 'addressPrefix'>>;
type Token = Readonly<{ symbol: string; decimals: number }>;

/** What the wallet knows about the network the payload is for. */
export type CrossChainCallOrigin = {
  /** Genesis hash without 0x. */
  chainId: string;
  name?: string;
  /** The token of `Here` on this chain; pinned for reviewed runtimes, the chain's own properties otherwise. */
  nativeToken?: Token;
  /** The wallet's network catalog, to name destinations and format recipients. */
  networks: readonly CatalogNetwork[];
};

const chain = REVIEWED_CHAIN_IDS;
const XCM_PALLETS: ReadonlySet<string> = new Set(['xcmPallet', 'polkadotXcm']);
/** XCM calls that run caller-written instructions; their effect elsewhere cannot be summarised. */
const RAW_XCM_CALLS: ReadonlySet<string> = new Set(['execute', 'send', 'transferAssetsUsingTypeAndThen']);
const BRIDGE_CALLS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  bridgeProxy: Object.freeze(['burn']),
  ethBridge: Object.freeze(['transferToSidechain']),
  soraBridgeApp: Object.freeze(['burn']),
});
const RESERVE_TRANSFERS: ReadonlySet<string> = new Set(['reserveTransferAssets', 'limitedReserveTransferAssets']);
/** Para ids below this are system parachains, which a relay chain teleports its token to. */
const FIRST_NON_SYSTEM_PARA_ID = 2000;
/** SORA bridge networks that run through the halted SORA parachains. */
const SORA_PARACHAIN_NETWORKS: ReadonlySet<string> = new Set(['polkadot', 'kusama', 'rococo', 'polkadotacala', 'polkadotastar']);
/** FRAME decodes a call nested at most this deep; anything deeper cannot be a valid extrinsic. */
const MAX_CALL_DEPTH = 256;

const RELAY_CHAIN_IDS: Readonly<Record<string, string>> = Object.freeze({ Polkadot: chain.polkadot, Kusama: chain.kusama });
const pinnedToken = (chainId: string): Token | undefined => {
  const feeAsset = REVIEWED_RUNTIMES.find((runtime) => runtime.chainId === chainId)?.feeAsset;

  return feeAsset ? { symbol: feeAsset.symbol, decimals: feeAsset.precision } : undefined;
};
const RELAY_TOKENS: Readonly<Record<string, Token | undefined>> = Object.freeze({
  Polkadot: pinnedToken(chain.polkadot),
  Kusama: pinnedToken(chain.kusama),
});

type Origin = CrossChainCallOrigin & { relay?: string; isRelay: boolean };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const compact = (value: unknown): string => JSON.stringify(value) ?? String(value);

/** The single variant of a decoded enum: `{ sub: 'Polkadot' }`, or a basic variant written as a string. */
function variant(value: unknown): { name: string; value: unknown } | undefined {
  if (typeof value === 'string') return { name: value.toLowerCase(), value: null };
  if (!isRecord(value)) return undefined;
  const keys = Object.keys(value);

  return keys.length === 1 ? { name: keys[0].toLowerCase(), value: value[keys[0]] } : undefined;
}

/** Unwraps `{ v3: … }`, `{ v4: … }` and the other versions of a versioned XCM value. */
function unversioned(value: unknown): unknown {
  const version = variant(value);

  return version && /^v\d+$/.test(version.name) ? version.value : value;
}

function amountOf(value: unknown): bigint {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === 'string' && /^(?:\d+|0x[0-9a-fA-F]+)$/.test(value)) return BigInt(value);
  throw new Error('Unreadable amount');
}

function formatUnits(value: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const fraction = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '');

  return fraction ? `${value / base}.${fraction}` : `${value / base}`;
}

function describeAmount(value: unknown, token?: Token): string {
  try {
    const amount = amountOf(value);

    return token ? formatUnits(amount, token.decimals) : amount.toString();
  } catch {
    return compact(value);
  }
}

type Location = { parents: number; junctions: unknown[] };

function locationOf(value: unknown): Location | undefined {
  const location = unversioned(value);
  if (!isRecord(location) || !Number.isSafeInteger(location.parents)) return undefined;

  const interior = variant(location.interior);
  if (!interior) return undefined;
  if (interior.name === 'here') return { parents: location.parents as number, junctions: [] };
  if (!/^x[1-8]$/.test(interior.name)) return undefined;

  return {
    parents: location.parents as number,
    junctions: Array.isArray(interior.value) ? interior.value : [interior.value],
  };
}

function consensusName(value: unknown, origin: Origin): string {
  const network = variant(value);
  if (network?.name === 'polkadot') return 'Polkadot';
  if (network?.name === 'kusama') return 'Kusama';
  if (network?.name === 'bygenesis' && typeof network.value === 'string') {
    const chainId = network.value.replace(/^0x/i, '').toLowerCase();

    return origin.networks.find((row) => String(row.chainId) === chainId)?.name ?? compact(value);
  }
  if (network?.name === 'ethereum') return 'Ethereum';

  return compact(value);
}

type Resolved = { relay?: string; paraId?: number; local?: boolean; rest: unknown[] };

/** Where a location relative to the origin points: a relay network, a parachain of it, or the origin itself. */
function resolveLocation(location: Location, origin: Origin): Resolved | undefined {
  let relay: string | undefined;
  let rest = location.junctions;
  const first = variant(rest[0]);

  if (first?.name === 'globalconsensus') {
    relay = consensusName(first.value, origin);
    rest = rest.slice(1);
  } else if (location.parents === 0) {
    if (!origin.isRelay) return { local: true, rest };
    relay = origin.relay;
  } else if (location.parents === 1 && !origin.isRelay && origin.relay) {
    relay = origin.relay;
  } else {
    return undefined;
  }

  const parachain = variant(rest[0]);
  if (parachain?.name !== 'parachain') return { relay, rest };
  const paraId = Number(parachain.value);

  return Number.isSafeInteger(paraId) ? { relay, paraId, rest: rest.slice(1) } : undefined;
}

function catalogChain(relay: string | undefined, paraId: number | undefined, origin: Origin): CatalogNetwork | undefined {
  const relayChainId = relay ? RELAY_CHAIN_IDS[relay] : undefined;
  if (!relayChainId) return undefined;
  if (paraId === undefined) return origin.networks.find((row) => String(row.chainId) === relayChainId);

  const matches = origin.networks.filter(
    (row) => row.parentId === relayChainId && Number(row.paraId) === paraId && row.paraId !== undefined
  );

  return matches.length === 1 ? matches[0] : undefined;
}

function describeDestination(location: Location | undefined, raw: unknown, origin: Origin) {
  const resolved = location ? resolveLocation(location, origin) : undefined;
  let destination: CrossChainCallDestination;
  let network: CatalogNetwork | undefined;

  if (resolved?.local) {
    destination = { network: origin.name ?? compact(raw) };
    network = origin.networks.find((row) => String(row.chainId) === origin.chainId);
  } else if (resolved?.relay) {
    network = catalogChain(resolved.relay, resolved.paraId, origin);
    destination = {
      ...(network ? { network: network.name } : resolved.paraId === undefined ? { network: resolved.relay } : {}),
      relay: resolved.relay,
      ...(resolved.paraId !== undefined ? { paraId: resolved.paraId } : {}),
    };
  } else {
    destination = { raw: compact(raw) };
  }

  return { destination, resolved, network };
}

function accountAddress(value: unknown, network: CatalogNetwork | undefined): string {
  if (typeof value !== 'string') return compact(value);

  try {
    const id = decodeAddress(value);
    const prefix = Number(network?.addressPrefix);

    return id.length === 32 && Number.isSafeInteger(prefix) && prefix >= 0 ? encodeAddress(id, prefix) : value;
  } catch {
    return value;
  }
}

/** The account a location ends in, or the whole location when it does not end in one. */
function describeBeneficiary(location: Location | undefined, raw: unknown, network: CatalogNetwork | undefined): string {
  const last = variant(location?.junctions.at(-1));
  if (last?.name === 'accountid32' && isRecord(last.value)) return accountAddress(last.value.id, network);
  if (last?.name === 'accountkey20' && isRecord(last.value)) return String(last.value.key);

  return compact(raw);
}

function tokenAt(location: Location | undefined, origin: Origin): Token | undefined {
  if (!location) return undefined;
  const [first, ...rest] = location.junctions;
  if (location.parents === 0 && !first) return origin.nativeToken;
  if (location.parents === 1 && !first && !origin.isRelay && origin.relay) return RELAY_TOKENS[origin.relay];

  const consensus = variant(first);
  if (location.parents >= 1 && consensus?.name === 'globalconsensus' && rest.length === 0) {
    return RELAY_TOKENS[consensusName(consensus.value, origin)];
  }

  return undefined;
}

type DescribedAssets = { assets: CrossChainCallAsset[]; movesNativeToken: boolean };

function describeAssets(value: unknown, origin: Origin): DescribedAssets {
  const list = unversioned(value);
  const items = Array.isArray(list) ? list : [list];
  let movesNativeToken = false;

  const assets = items.map((item) => {
    const asset = isRecord(item) ? item : {};
    const id = variant(asset.id);
    // XCM v2 and v3 wrap the location in `Concrete`; v4 and later use the location itself.
    const location = locationOf(id?.name === 'concrete' ? id.value : asset.id);
    const token = tokenAt(location, origin);
    if (location && location.parents === 0 && !location.junctions.length) movesNativeToken = true;

    const fungibility = variant(asset.fun);
    const amount = fungibility?.name === 'fungible' ? describeAmount(fungibility.value, token) : compact(asset.fun);

    return { asset: token?.symbol ?? compact(id?.name === 'concrete' ? id.value : asset.id), amount };
  });

  return { assets, movesNativeToken };
}

function deadParachain(resolved: Resolved | undefined) {
  if (!resolved?.relay || resolved.paraId === undefined) return undefined;

  return DEAD_PARACHAINS.find(({ relay, paraId }) => relay === resolved.relay && paraId === resolved.paraId);
}

type Fields = Omit<CrossChainCallSummary, 'path' | 'call' | 'highRisk'>;

function xcmPalletCall(method: string, args: Record<string, unknown>, origin: Origin, section: string): Fields {
  // execute has no destination, and claimAssets and the force calls carry no transfer at all.
  const target = args.dest === undefined ? undefined : describeDestination(locationOf(args.dest), args.dest, origin);
  const { destination, resolved, network } = target ?? {};
  const { assets, movesNativeToken } =
    args.assets === undefined ? { assets: [], movesNativeToken: false } : describeAssets(args.assets, origin);
  const beneficiary =
    args.beneficiary === undefined
      ? undefined
      : describeBeneficiary(locationOf(args.beneficiary), args.beneficiary, network);

  const dead = deadParachain(resolved);
  // Since the Asset Hub Migration a relay chain is no longer the reserve of its token: a reserve transfer of it from
  // the relay cannot be delivered, whether the call names it, transferAssets chooses it for a non-system parachain or
  // transferAssetsUsingTypeAndThen is given anything but a teleport.
  const assetHubMigration =
    origin.isRelay &&
    section === 'xcmPallet' &&
    movesNativeToken &&
    (RESERVE_TRANSFERS.has(method) ||
      (method === 'transferAssets' && resolved?.paraId !== undefined && resolved.paraId >= FIRST_NON_SYSTEM_PARA_ID) ||
      (method === 'transferAssetsUsingTypeAndThen' && variant(args.assetsTransferType)?.name !== 'teleport'));
  let blocked: CrossChainCallSummary['blocked'];
  if (dead) blocked = { code: dead.code, reason: dead.reason };
  else if (assetHubMigration) blocked = { code: 'asset-hub-migration', reason: ASSET_HUB_MIGRATION_RETIRED };

  return {
    ...(destination ? { destination } : {}),
    ...(beneficiary !== undefined ? { beneficiary } : {}),
    assets,
    ...(blocked ? { blocked } : {}),
  };
}

function xTokensCall(method: string, args: Record<string, unknown>, origin: Origin): Fields {
  // The destination of an xTokens transfer ends in the recipient's account.
  const full = locationOf(args.dest);
  const last = variant(full?.junctions.at(-1));
  const endsInAccount = last?.name === 'accountid32' || last?.name === 'accountkey20';
  const chainLocation = full && endsInAccount ? { ...full, junctions: full.junctions.slice(0, -1) } : full;
  const { destination, resolved, network } = describeDestination(chainLocation, args.dest, origin);

  let assets: CrossChainCallAsset[];
  if (method === 'transferMultiasset' || method === 'transferMultiassetWithFee') {
    assets = describeAssets(args.asset, origin).assets;
  } else if (method === 'transferMultiassets') {
    assets = describeAssets(args.assets, origin).assets;
  } else if (method === 'transferMulticurrencies' && Array.isArray(args.currencies)) {
    assets = args.currencies.map((entry) =>
      Array.isArray(entry) ? { asset: compact(entry[0]), amount: describeAmount(entry[1]) } : { asset: compact(entry), amount: '' }
    );
  } else {
    assets = [{ asset: compact(args.currencyId), amount: describeAmount(args.amount) }];
  }

  const dead = deadParachain(resolved);

  return {
    destination,
    ...(endsInAccount ? { beneficiary: describeBeneficiary(full, args.dest, network) } : {}),
    assets,
    ...(dead ? { blocked: { code: dead.code, reason: dead.reason } } : {}),
  };
}

const assetIdHex = (value: unknown): string => (isRecord(value) && 'code' in value ? String(value.code) : compact(value));

/** SORA `bridgeProxy.burn(networkId, assetId, recipient, amount)`. */
function soraBurn(args: Record<string, unknown>, origin: Origin): Fields {
  const network = variant(args.networkId);
  const recipient = variant(args.recipient);
  const subNetwork = network?.name === 'sub' ? String(network.value) : undefined;
  const sub = subNetwork?.toLowerCase();
  let destination: CrossChainCallDestination;
  let destinationNetwork: CatalogNetwork | undefined;

  if (sub === 'liberland') {
    destinationNetwork = origin.networks.find((row) => String(row.chainId) === chain.liberland);
    destination = { network: destinationNetwork?.name ?? 'Liberland' };
  } else if (sub === 'polkadot' || sub === 'kusama' || sub === 'rococo') {
    const relay = `${subNetwork!.charAt(0).toUpperCase()}${subNetwork!.slice(1)}`;
    // Parachain recipients name their chain in the location: { parents: 1, interior: X2(Parachain(id), account) }.
    const location = recipient?.name === 'parachain' ? locationOf(recipient.value) : undefined;
    const parachain = variant(location?.junctions[0]);
    const paraId = parachain?.name === 'parachain' ? Number(parachain.value) : undefined;
    destinationNetwork = catalogChain(relay, paraId, origin);
    destination = {
      network: destinationNetwork?.name ?? relay,
      ...(paraId !== undefined && Number.isSafeInteger(paraId) ? { relay, paraId } : {}),
    };
  } else {
    destination = subNetwork ? { network: subNetwork } : { raw: compact(args.networkId) };
  }

  let beneficiary: string;
  if (recipient?.name === 'parachain') {
    beneficiary = describeBeneficiary(locationOf(recipient.value), recipient.value, destinationNetwork);
  } else if (recipient && typeof recipient.value === 'string') {
    beneficiary = accountAddress(recipient.value, destinationNetwork);
  } else {
    beneficiary = compact(args.recipient);
  }

  const assetId = assetIdHex(args.assetId);
  const xor = assetId.toLowerCase() === '0x0200000000000000000000000000000000000000000000000000000000000000';
  let blocked: CrossChainCallSummary['blocked'];
  if (origin.chainId === chain.sora && sub === 'liberland') {
    blocked = { code: 'sora-to-liberland-stalled', reason: SORA_TO_LIBERLAND_STALLED };
  } else if (origin.chainId === chain.sora && sub && SORA_PARACHAIN_NETWORKS.has(sub)) {
    blocked = { code: 'sora-parachain-halted', reason: SORA_PARACHAIN_HALTED };
  }

  return {
    destination,
    beneficiary,
    assets: [
      { asset: xor ? 'XOR' : assetId, amount: describeAmount(args.amount, xor ? pinnedToken(chain.sora) : undefined) },
    ],
    ...(blocked ? { blocked } : {}),
  };
}

/** Liberland `soraBridgeApp.burn(networkId, assetId, recipient, amount)`. Liberland to SORA still delivers. */
function liberlandBurn(args: Record<string, unknown>, origin: Origin): Fields {
  const network = variant(args.networkId);
  const sora = origin.networks.find((row) => String(row.chainId) === chain.sora);
  const destination =
    network?.name === 'mainnet' ? { network: sora?.name ?? 'SORA' } : { raw: compact(args.networkId) };

  // The bundled Liberland routes name each asset the bridge accepts.
  const asset = variant(args.assetId);
  const route = BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES.find(
    ({ execution }) =>
      execution?.kind === 'liberland-to-sora-burn' &&
      (asset?.name === 'lld' ? execution.externalAsset === 'LLD' : asset?.name === 'asset' && execution.externalAsset === Number(asset.value))
  );
  const token = route ? { symbol: route.symbol, decimals: route.precision } : undefined;

  const recipient = variant(args.recipient);

  return {
    destination,
    beneficiary:
      recipient && typeof recipient.value === 'string'
        ? accountAddress(recipient.value, recipient.name === 'sora' ? sora : undefined)
        : compact(args.recipient),
    assets: [{ asset: token?.symbol ?? compact(args.assetId), amount: describeAmount(args.amount, token) }],
  };
}

/** SORA `ethBridge.transferToSidechain(assetId, to, amount, networkId)`, network 0 being Ethereum. */
function soraToEthereum(args: Record<string, unknown>): Fields {
  const assetId = assetIdHex(args.assetId);

  return {
    destination: Number(args.networkId) === 0 ? { network: 'Ethereum' } : { raw: compact({ networkId: args.networkId }) },
    beneficiary: typeof args.to === 'string' ? args.to : compact(args.to),
    assets: [{ asset: assetId, amount: describeAmount(args.amount) }],
  };
}

function isCrossChainCall(call: DecodedCall): boolean {
  return XCM_PALLETS.has(call.section) || call.section === 'xTokens' || !!BRIDGE_CALLS[call.section]?.includes(call.method);
}

function argumentsOf(call: DecodedCall): Record<string, unknown> {
  const json = call.toJSON();
  const args = isRecord(json) && isRecord(json.args) ? json.args : {};

  return Object.fromEntries(Object.entries(args).map(([name, value]) => [stringCamelCase(name), value]));
}

function summarize(call: DecodedCall, path: string, origin: Origin): CrossChainCallSummary {
  let fields: Fields;
  try {
    const args = argumentsOf(call);
    if (XCM_PALLETS.has(call.section)) fields = xcmPalletCall(call.method, args, origin, call.section);
    else if (call.section === 'xTokens') fields = xTokensCall(call.method, args, origin);
    else if (call.section === 'bridgeProxy') fields = soraBurn(args, origin);
    else if (call.section === 'soraBridgeApp') fields = liberlandBurn(args, origin);
    else fields = soraToEthereum(args);
  } catch {
    // Still a transfer to another network, shown without the fields that could not be read.
    fields = { assets: [] };
  }

  return {
    path,
    call: `${call.section}.${call.method}`,
    ...fields,
    highRisk: XCM_PALLETS.has(call.section) && RAW_XCM_CALLS.has(call.method),
  };
}

const isDecodedCall = (value: unknown): value is DecodedCall =>
  isRecord(value) &&
  typeof value.toRawType === 'function' &&
  (value as { toRawType(): unknown }).toRawType() === 'Call' &&
  typeof value.section === 'string' &&
  typeof value.method === 'string' &&
  Array.isArray(value.args);

/** Calls held by an argument: a call, a list of calls (batches) or an optional call. */
function nestedCalls(argument: unknown): DecodedCall[] {
  if (isDecodedCall(argument)) return [argument];
  if (Array.isArray(argument)) return argument.filter(isDecodedCall);
  const option = argument as { isSome?: unknown; unwrap?: () => unknown } | null;
  if (option && option.isSome === true && typeof option.unwrap === 'function') return nestedCalls(option.unwrap());

  return [];
}

/**
 * Every cross-chain call in a decoded call, in order. Calls nested in any argument are walked as well, which covers
 * utility.batch, batchAll, forceBatch, asDerivative, dispatchAs, withWeight and ifElse, proxy.proxy and
 * proxyAnnounced, and multisig.asMulti and asMultiThreshold1.
 */
export function summarizeCrossChainCalls(call: DecodedCall, origin: CrossChainCallOrigin): CrossChainCallSummary[] {
  const relay =
    bundledRelayNetwork(origin.chainId) ??
    Object.entries(RELAY_CHAIN_IDS).find(
      ([, chainId]) => origin.networks.find((row) => String(row.chainId) === origin.chainId)?.parentId === chainId
    )?.[0];
  const context: Origin = {
    ...origin,
    nativeToken: pinnedToken(origin.chainId) ?? origin.nativeToken,
    relay,
    isRelay: Object.values(RELAY_CHAIN_IDS).includes(origin.chainId),
  };
  const found: CrossChainCallSummary[] = [];

  const visit = (current: DecodedCall, path: string, depth: number) => {
    if (depth > MAX_CALL_DEPTH) throw new Error('Call nested too deeply');
    if (isCrossChainCall(current)) {
      found.push(summarize(current, path, context));

      return;
    }
    current.args.forEach((argument, index) =>
      nestedCalls(argument).forEach((inner, item) => visit(inner, `${path}.${index}.${item}`, depth + 1))
    );
  };
  visit(call, '0', 0);

  return found;
}
