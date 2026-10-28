import { hexToU8a } from '@polkadot/util';
import type { SignerPayloadJSON } from '@polkadot/types/types';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import {
  CROSS_CHAIN_DESTINATION_RETIRED,
  summarizeCrossChainCalls,
  type CrossChainCallSummary,
  type DecodedCall,
} from '@/cross-chain/dappCrossChainCalls';

/**
 * What the wallet could read from the call of a Substrate signing payload.
 *
 * `decoded` lists every cross-chain call in it (none for an ordinary call). `undecodable` means the request is shown
 * as unreadable, as before: the wallet has no ready runtime for that network, the payload was built for another
 * runtime version, or the bytes do not decode.
 */
export type SubstrateCallReview =
  | { status: 'decoded'; crossChain: CrossChainCallSummary[] }
  | { status: 'undecodable'; reason: 'runtime_unavailable' | 'runtime_mismatch' | 'call_undecodable' };

type ReviewApi = {
  genesisHash?: { toHex(): string };
  runtimeVersion?: { specVersion?: { toString(): string } };
  registry?: {
    createTypeUnsafe(type: string, params: unknown[], options?: { isPedantic?: boolean }): unknown;
    chainDecimals?: number[];
    chainTokens?: string[];
  };
};

export class CrossChainDestinationRetiredError extends Error {
  readonly code = CROSS_CHAIN_DESTINATION_RETIRED;

  constructor(readonly reason: string) {
    super(`${CROSS_CHAIN_DESTINATION_RETIRED}: ${reason}`);
    this.name = 'CrossChainDestinationRetiredError';
  }
}

function nativeToken(registry: NonNullable<ReviewApi['registry']>) {
  const symbol = registry.chainTokens?.[0];
  const decimals = registry.chainDecimals?.[0];

  return typeof symbol === 'string' && symbol && Number.isSafeInteger(decimals) && decimals! >= 0 && decimals! <= 64
    ? { symbol, decimals: decimals! }
    : undefined;
}

/**
 * Decodes the call of a payload with the wallet's own live runtime for its network. dApp-provided metadata is never
 * used here, since a site could supply types that make a transfer to another network look like something else. The
 * runtime must be the one the payload was built for: the same genesis and spec version.
 */
export function reviewSubstrateCall(
  state: State,
  network: NetworkJson | undefined,
  payload: SignerPayloadJSON
): SubstrateCallReview {
  let registry: NonNullable<ReviewApi['registry']>;
  let matches: boolean;
  try {
    const api = network
      ? (state.getSubstrateApiMap?.[network.name.toLowerCase()]?.api as ReviewApi | undefined)
      : undefined;
    if (!api) return { status: 'undecodable', reason: 'runtime_unavailable' };
    // polkadot-js throws while the API is not ready yet.
    const genesis = api.genesisHash?.toHex().toLowerCase();
    const specVersion = api.runtimeVersion?.specVersion?.toString();
    if (!genesis || !specVersion || !api.registry) return { status: 'undecodable', reason: 'runtime_unavailable' };
    registry = api.registry;
    matches = genesis === payload.genesisHash.toLowerCase() && BigInt(specVersion) === BigInt(payload.specVersion);
  } catch {
    return { status: 'undecodable', reason: 'runtime_unavailable' };
  }
  if (!matches) return { status: 'undecodable', reason: 'runtime_mismatch' };

  try {
    // Pedantic: the bytes must be exactly one call, re-encoding to the same bytes.
    const call = registry.createTypeUnsafe('Call', [hexToU8a(payload.method)], { isPedantic: true }) as DecodedCall;
    const chainId = String(network!.chainId).replace(/^0x/i, '').toLowerCase();

    return {
      status: 'decoded',
      crossChain: summarizeCrossChainCalls(call, {
        chainId,
        name: network!.name,
        nativeToken: nativeToken(registry),
        networks: Object.values(state.networkService.networkMap).map(
          ({ name, chainId: id, parentId, paraId, addressPrefix }) => ({ name, chainId: id, parentId, paraId, addressPrefix })
        ),
      }),
    };
  } catch {
    return { status: 'undecodable', reason: 'call_undecodable' };
  }
}

/** Refuses a call that sends funds to a destination the wallet already knows cannot deliver them. */
export function assertNoRetiredCrossChainDestination(review: SubstrateCallReview | undefined): void {
  const blocked = review?.status === 'decoded' ? review.crossChain.find((item) => item.blocked) : undefined;

  if (blocked?.blocked) throw new CrossChainDestinationRetiredError(blocked.blocked.reason);
}

/**
 * Whether the call review at approval still matches the one the user saw. It must be the same, with one exception: a
 * request admitted before the wallet's runtime for its network was ready was shown as unreadable, and that is still
 * true to what the user approved when the call turns out to hold no cross-chain transfer.
 */
export function sameSubstrateCallReview(
  admitted: SubstrateCallReview | undefined,
  current: SubstrateCallReview
): boolean {
  if (JSON.stringify(admitted) === JSON.stringify(current)) return true;

  return admitted?.status === 'undecodable' && current.status === 'decoded' && current.crossChain.length === 0;
}
