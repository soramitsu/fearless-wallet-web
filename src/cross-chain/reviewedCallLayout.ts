import { bnToU8a, compactToU8a, u8aConcat, u8aToHex } from '@polkadot/util';
import { decodeAddress } from '@polkadot/util-crypto';
import type { ReviewedCrossChainExecution, ReviewedRuntimeCall } from '@/cross-chain/reviewedRoutes';
import { REVIEWED_RUNTIMES } from '@/cross-chain/reviewedRuntimes';

/**
 * The exact bytes of every bundled cross-chain call, written out by hand.
 *
 * polkadot-js encodes a call with the type registry it builds from the metadata the connected node serves. The spec
 * version, the call index and the argument names are pinned, but the argument types are not, so a node that serves
 * altered type definitions at a pinned spec version could change what the signed bytes mean. The built call is
 * therefore compared byte for byte with this layout, which uses nothing the node supplies: the SCALE variant indices
 * below were read from the reviewed metadata, and the call indices come from the bundled runtime pins. It reproduces
 * every golden call in tests/unit/cross-chain-golden-calls.spec.ts.
 *
 * Only the bundled executions have a layout. Any other execution, including the retired ones whose builders are
 * kept, fails closed with cross_chain_call_layout_not_reviewed.
 */

/** `VersionedLocation::V3` and `VersionedAssets::V3`. */
const VERSIONED_V3 = 3;
const JUNCTIONS_HERE = 0;
const JUNCTIONS_X1 = 1;
const JUNCTION_PARACHAIN = 0;
const JUNCTION_ACCOUNT_ID32 = 1;
const OPTION_SOME = 1;
/** XCM v3 `NetworkId` variants of the relay networks. */
const XCM_V3_NETWORK_ID: Readonly<Record<'Polkadot' | 'Kusama', number>> = Object.freeze({ Polkadot: 2, Kusama: 3 });
const ASSET_ID_CONCRETE = 0;
const FUNGIBILITY_FUNGIBLE = 0;
const WEIGHT_LIMIT_UNLIMITED = 0;
/** Liberland's `BridgeTypesSubNetworkId::Mainnet`, which is SORA. */
const SUB_NETWORK_MAINNET = 0;
const LIBERLAND_ASSET_LLD = 0;
const LIBERLAND_ASSET_ASSET = 1;
/** Liberland's `BridgeTypesGenericAccount::Sora`. */
const GENERIC_ACCOUNT_SORA = 1;

const U128_LIMIT = 1n << 128n;
const U32_LIMIT = 1n << 32n;

function notReviewed(): never {
  throw new Error('cross_chain_call_layout_not_reviewed');
}

/** The pinned `[pallet index, call index]` of a reviewed call on its origin runtime. */
function pinnedCallIndex(originChainId: string, pallet: ReviewedRuntimeCall['pallet'], call: ReviewedRuntimeCall['call']) {
  const reviewed = REVIEWED_RUNTIMES.find(({ chainId }) => chainId === originChainId)?.calls.find(
    (candidate) => candidate.pallet === pallet && candidate.call === call
  );
  if (!reviewed) notReviewed();

  return [reviewed.palletIndex, reviewed.callIndex];
}

function planck(precisionAmount: string): bigint {
  if (!/^\d+$/.test(precisionAmount)) notReviewed();
  const amount = BigInt(precisionAmount);
  if (amount >= U128_LIMIT) notReviewed();

  return amount;
}

/** The 32-byte account id of an SS58 or hex recipient. */
function accountId32(to: string): Uint8Array {
  const id = decodeAddress(to);
  if (id.length !== 32) notReviewed();

  return id;
}

/** The encoded call a bundled execution must produce for this recipient and amount, as 0x-prefixed hex. */
export function expectedReviewedCall(
  execution: Readonly<ReviewedCrossChainExecution>,
  to: string,
  precisionAmount: string
): string {
  const amount = planck(precisionAmount);

  if (execution.kind === 'relay-native-xcm-v3') {
    if (
      execution.call !== 'limitedTeleportAssets' ||
      execution.receiverKind !== 'AccountId32' ||
      execution.assetParents !== 0 ||
      execution.assetInteriors.length !== 0 ||
      !Number.isSafeInteger(execution.destinationParaId) ||
      execution.destinationParaId < 0
    ) {
      notReviewed();
    }

    return u8aToHex(
      u8aConcat(
        pinnedCallIndex(execution.originChainId, 'xcmPallet', 'limitedTeleportAssets'),
        // dest: V3 { parents: 0, interior: X1(Parachain(id)) }
        [VERSIONED_V3, 0, JUNCTIONS_X1, JUNCTION_PARACHAIN],
        compactToU8a(execution.destinationParaId),
        // beneficiary: V3 { parents: 0, interior: X1(AccountId32 { network: Some(relay), id }) }
        [VERSIONED_V3, 0, JUNCTIONS_X1, JUNCTION_ACCOUNT_ID32, OPTION_SOME, XCM_V3_NETWORK_ID[execution.relayNetwork]],
        accountId32(to),
        // assets: V3 [{ id: Concrete { parents: 0, interior: Here }, fun: Fungible(amount) }]
        [VERSIONED_V3],
        compactToU8a(1),
        [ASSET_ID_CONCRETE, 0, JUNCTIONS_HERE, FUNGIBILITY_FUNGIBLE],
        compactToU8a(amount),
        // fee_asset_item: u32 0, weight_limit: Unlimited
        [0, 0, 0, 0],
        [WEIGHT_LIMIT_UNLIMITED]
      )
    );
  }

  if (execution.kind === 'liberland-to-sora-burn') {
    const { externalAsset } = execution;
    let assetId: Uint8Array;
    if (externalAsset === 'LLD') {
      assetId = Uint8Array.from([LIBERLAND_ASSET_LLD]);
    } else if (Number.isSafeInteger(externalAsset) && externalAsset >= 0 && BigInt(externalAsset) < U32_LIMIT) {
      // Asset(u32), little endian
      assetId = u8aConcat([LIBERLAND_ASSET_ASSET], bnToU8a(externalAsset, { bitLength: 32 }));
    } else {
      notReviewed();
    }

    return u8aToHex(
      u8aConcat(
        pinnedCallIndex(execution.originChainId, 'soraBridgeApp', 'burn'),
        [SUB_NETWORK_MAINNET],
        assetId,
        [GENERIC_ACCOUNT_SORA],
        accountId32(to),
        // amount: u128, little endian
        bnToU8a(amount, { bitLength: 128 })
      )
    );
  }

  return notReviewed();
}

/** Throws unless the built call is exactly the reviewed layout for this execution, recipient and amount. */
export function assertReviewedCallLayout(
  execution: Readonly<ReviewedCrossChainExecution>,
  to: string,
  precisionAmount: string,
  call: { toHex(): string } | undefined
): void {
  const expected = expectedReviewedCall(execution, to, precisionAmount);

  if (typeof call?.toHex !== 'function' || call.toHex() !== expected) {
    throw new Error('cross_chain_call_layout_mismatch');
  }
}
