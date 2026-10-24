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
}>;

const reviewedRuntime = (runtime: ReviewedRuntime): ReviewedRuntime =>
  Object.freeze({
    ...runtime,
    specVersions: Object.freeze({ ...runtime.specVersions }),
    calls: Object.freeze(runtime.calls.map((call) => Object.freeze({ ...call }))),
  });

export const REVIEWED_RUNTIMES: readonly ReviewedRuntime[] = Object.freeze([
  reviewedRuntime({
    name: 'Polkadot',
    chainId: '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3',
    specName: 'polkadot',
    specVersions: { min: 2005000, max: 2005000 },
    calls: [{ pallet: 'xcmPallet', call: 'limitedTeleportAssets', palletIndex: 99, callIndex: 9 }],
  }),
  reviewedRuntime({
    name: 'Kusama',
    chainId: 'b0a8d493285c2df73290dfb7e61f870f17b41801197a149ca93654499ea3dafe',
    specName: 'kusama',
    specVersions: { min: 2003002, max: 2003002 },
    calls: [{ pallet: 'xcmPallet', call: 'limitedTeleportAssets', palletIndex: 99, callIndex: 9 }],
  }),
  reviewedRuntime({
    name: 'Liberland',
    chainId: '6bd89e052d67a45bb60a9a23e8581053d5e0d619f15cb9865946937e690c42d6',
    specName: 'Liberland',
    specVersions: { min: 34, max: 34 },
    calls: [{ pallet: 'soraBridgeApp', call: 'burn', palletIndex: 81, callIndex: 3 }],
  }),
  reviewedRuntime({
    name: 'SORA Mainnet',
    chainId: '7e4e32d0feafd4f9c9414b0be86373f9a1efa904809b683453a9af6856d38ad5',
    specName: 'sora-substrate',
    specVersions: { min: 134, max: 134 },
    calls: [{ pallet: 'bridgeProxy', call: 'burn', palletIndex: 103, callIndex: 0 }],
  }),
  reviewedRuntime({
    name: 'Acala',
    chainId: 'fc41b9bd8ef8fe53d58c7ea67c794c7ec9a73daf05e6d54b14ff6342c99ba64c',
    specName: 'acala',
    specVersions: { min: 2370, max: 2370 },
    calls: [{ pallet: 'xTokens', call: 'transfer', palletIndex: 54, callIndex: 0 }],
  }),
  reviewedRuntime({
    name: 'Astar',
    chainId: '9eb76c5184c4ab8679d2d5d819fdf90b9c001403e9e17da2e14b6d8aec4029c6',
    specName: 'astar',
    specVersions: { min: 2500, max: 2500 },
    calls: [{ pallet: 'polkadotXcm', call: 'reserveTransferAssets', palletIndex: 51, callIndex: 2 }],
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
