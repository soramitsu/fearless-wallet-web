import type { NetworkJson } from '@extension-base/types';
import type { ReviewedRuntimeCall } from '@/cross-chain/reviewedRoutes';

/**
 * Runtimes whose transfer calls were reviewed against live metadata, per origin chain.
 *
 * Argument names alone do not pin what a call does: the Asset Hub Migration changed the meaning of the relay
 * reserve transfers without renaming a single argument, and the call and pallet indices that polkadot-js encodes come
 * from metadata the RPC node supplies. A reviewed execution is therefore built only on a runtime whose spec name and
 * version are listed here and only when its pallet and call sit at the reviewed indices. A runtime upgrade disables
 * the route until the new version is reviewed (live metadata, a dry run, the golden encoding test) and added.
 *
 * Read from the live chains on 2026-10-24; `tests/fixtures/contracts/cross-chain-runtime-calls-v1.json` records the
 * same metadata facts. Chains whose routes are retired keep their entry so the retained builders stay testable;
 * their routes are still refused by the route table.
 *
 * The fee asset is the one each runtime charges its transaction fee in, with the registry id and precision of the
 * production registry on 2026-10-29. The quote converts the live fee with this precision and checks it against this
 * asset's balance, so the remote registry may confirm it but cannot choose it.
 */

export type ReviewedRuntimeCallIndex = Readonly<{
  pallet: ReviewedRuntimeCall['pallet'];
  call: ReviewedRuntimeCall['call'];
  palletIndex: number;
  callIndex: number;
}>;

export type ReviewedRuntime = Readonly<{
  name: string;
  chainId: string;
  specName: string;
  /** Inclusive range of reviewed spec versions. */
  specVersions: Readonly<{ min: number; max: number }>;
  calls: readonly ReviewedRuntimeCallIndex[];
  /** The asset transaction fees are paid in: its registry id, ticker and precision. */
  feeAsset: Readonly<{ id: string; symbol: string; precision: number }>;
}>;

const reviewedRuntime = (runtime: ReviewedRuntime): ReviewedRuntime =>
  Object.freeze({
    ...runtime,
    specVersions: Object.freeze({ ...runtime.specVersions }),
    calls: Object.freeze(runtime.calls.map((call) => Object.freeze({ ...call }))),
    feeAsset: Object.freeze({ ...runtime.feeAsset }),
  });

export const REVIEWED_RUNTIMES: readonly ReviewedRuntime[] = Object.freeze([
  reviewedRuntime({
    name: 'Polkadot',
    chainId: '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3',
    specName: 'polkadot',
    specVersions: { min: 2005000, max: 2005000 },
    calls: [{ pallet: 'xcmPallet', call: 'limitedTeleportAssets', palletIndex: 99, callIndex: 9 }],
    feeAsset: { id: '887a17c7-1370-4de0-97dd-5422e294fa75', symbol: 'DOT', precision: 10 },
  }),
  reviewedRuntime({
    name: 'Kusama',
    chainId: 'b0a8d493285c2df73290dfb7e61f870f17b41801197a149ca93654499ea3dafe',
    specName: 'kusama',
    specVersions: { min: 2003002, max: 2003002 },
    calls: [{ pallet: 'xcmPallet', call: 'limitedTeleportAssets', palletIndex: 99, callIndex: 9 }],
    feeAsset: { id: '1e0c2ec6-935f-49bd-a854-5e12ee6c9f1b', symbol: 'KSM', precision: 12 },
  }),
  reviewedRuntime({
    name: 'Liberland',
    chainId: '6bd89e052d67a45bb60a9a23e8581053d5e0d619f15cb9865946937e690c42d6',
    specName: 'Liberland',
    specVersions: { min: 34, max: 34 },
    calls: [{ pallet: 'soraBridgeApp', call: 'burn', palletIndex: 81, callIndex: 3 }],
    feeAsset: { id: 'a6b83d39-a488-4b34-8352-280705a792ea', symbol: 'LLD', precision: 12 },
  }),
  reviewedRuntime({
    name: 'SORA Mainnet',
    chainId: '7e4e32d0feafd4f9c9414b0be86373f9a1efa904809b683453a9af6856d38ad5',
    specName: 'sora-substrate',
    specVersions: { min: 134, max: 134 },
    calls: [{ pallet: 'bridgeProxy', call: 'burn', palletIndex: 103, callIndex: 0 }],
    feeAsset: { id: 'b774c386-5cce-454a-a845-1ec0381538ec', symbol: 'XOR', precision: 18 },
  }),
  reviewedRuntime({
    name: 'Acala',
    chainId: 'fc41b9bd8ef8fe53d58c7ea67c794c7ec9a73daf05e6d54b14ff6342c99ba64c',
    specName: 'acala',
    specVersions: { min: 2370, max: 2370 },
    calls: [{ pallet: 'xTokens', call: 'transfer', palletIndex: 54, callIndex: 0 }],
    feeAsset: { id: 'c801d6c1-3edf-41a9-9aea-da705eab249b', symbol: 'ACA', precision: 12 },
  }),
  reviewedRuntime({
    name: 'Astar',
    chainId: '9eb76c5184c4ab8679d2d5d819fdf90b9c001403e9e17da2e14b6d8aec4029c6',
    specName: 'astar',
    specVersions: { min: 2500, max: 2500 },
    calls: [{ pallet: 'polkadotXcm', call: 'reserveTransferAssets', palletIndex: 51, callIndex: 2 }],
    // The registry id of ASTR is one character short of a UUID; it is copied as is so the registry must agree exactly.
    feeAsset: { id: '5ab1e8d-81ed-4130-9d29-55b549cc6bab', symbol: 'ASTR', precision: 18 },
  }),
]);

type RuntimeIdentity = {
  genesisHash?: { toHex(): string };
  runtimeVersion?: { specName?: { toString(): string }; specVersion?: { toString(): string } };
};

/** Throws unless the API is connected to a reviewed spec version of the expected chain. */
export function assertReviewedRuntimeVersion(
  chainId: string,
  api: RuntimeIdentity,
  runtimes: readonly ReviewedRuntime[] = REVIEWED_RUNTIMES
): ReviewedRuntime {
  const runtime = runtimes.find((candidate) => candidate.chainId === chainId);
  if (!runtime) throw new Error('cross_chain_runtime_not_reviewed');

  const genesis = api.genesisHash?.toHex().replace(/^0x/i, '').toLowerCase();
  if (genesis !== runtime.chainId) throw new Error('cross_chain_runtime_genesis_mismatch');

  const specName = api.runtimeVersion?.specName?.toString();
  const specVersion = Number(api.runtimeVersion?.specVersion?.toString());
  if (
    specName !== runtime.specName ||
    !Number.isSafeInteger(specVersion) ||
    specVersion < runtime.specVersions.min ||
    specVersion > runtime.specVersions.max
  ) {
    throw new Error('cross_chain_runtime_not_reviewed');
  }

  return runtime;
}

/** Throws unless the metadata places the call at the reviewed pallet and call indices. */
export function assertReviewedCallIndex(
  runtime: ReviewedRuntime,
  descriptor: Pick<ReviewedRuntimeCall, 'pallet' | 'call'>,
  callIndex: ArrayLike<number> | undefined
): void {
  const reviewed = runtime.calls.find(({ pallet, call }) => pallet === descriptor.pallet && call === descriptor.call);

  if (
    !reviewed ||
    !callIndex ||
    callIndex.length !== 2 ||
    callIndex[0] !== reviewed.palletIndex ||
    callIndex[1] !== reviewed.callIndex
  ) {
    throw new Error('cross_chain_runtime_call_index_mismatch');
  }
}

/**
 * The fee asset of a reviewed runtime, confirmed by the registry row of its network: the wallet reads a network's first
 * asset as its fee asset, so that row must belong to the same chain and name the pinned asset with the pinned
 * precision. A missing, reordered or edited registry fails closed instead of misstating the fee or checking it
 * against another balance.
 */
export function assertReviewedFeeAsset(
  chainId: string,
  network: Pick<NetworkJson, 'chainId' | 'assets'> | undefined,
  runtimes: readonly ReviewedRuntime[] = REVIEWED_RUNTIMES
): ReviewedRuntime['feeAsset'] {
  const runtime = runtimes.find((candidate) => candidate.chainId === chainId);
  const registryAsset = network && String(network.chainId) === chainId ? network.assets?.[0] : undefined;

  if (
    !runtime ||
    !registryAsset ||
    registryAsset.id !== runtime.feeAsset.id ||
    registryAsset.precision !== runtime.feeAsset.precision ||
    String(registryAsset.symbol).toUpperCase() !== runtime.feeAsset.symbol
  ) {
    throw new Error('cross_chain_fee_asset_unavailable');
  }

  return runtime.feeAsset;
}
