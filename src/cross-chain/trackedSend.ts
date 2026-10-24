/**
 * Sends a signed extrinsic and follows it until its outcome is known.
 *
 * Broadcast is not an outcome: a broadcast extrinsic can still fail at dispatch, be dropped from the pool or be replaced
 * by another one with the same nonce. Only inclusion in a block settles it, and the dispatch result in that block says
 * whether it did anything. When the node cannot tell (timeout, closed socket, dropped or replaced after it was gossiped)
 * the extrinsic may still be included elsewhere, so the outcome is unknown and the caller must not send a replacement
 * until it is resolved.
 */

type CodecLike = { toJSON?: () => unknown };

/** The part of a submittable extrinsic this module uses. */
export type TrackableExtrinsic = {
  hash: { toHex: () => string };
  registry: {
    findMetaError: (error: { index: unknown; error: unknown }) => { section: string; name: string };
  };
  send: (callback: (result: TrackableResult) => void) => Promise<() => void>;
};

export type TrackableResult = {
  status: {
    type: string;
    isInBlock: boolean;
    isFinalized: boolean;
    isDropped: boolean;
    isInvalid: boolean;
    isUsurped: boolean;
  };
  dispatchError?: {
    isModule: boolean;
    asModule: { index: unknown; error: unknown };
    toString: () => string;
  };
  /** Events of this extrinsic only, as filtered by the API for in-block results. */
  events?: readonly { event: { section: string; method: string; data: readonly CodecLike[] } }[];
};

export type TrackedSendOutcome =
  | { kind: 'included'; hash: string }
  /** `included` says whether the failure happened at dispatch, in a block, rather than in the pool. */
  | { kind: 'failed'; hash: string; reason: string; included: boolean }
  | { kind: 'unknown'; hash: string; reason: string };

/** Long enough for a mortal extrinsic on a slow parachain, short enough not to leave the user waiting forever. */
export const CROSS_CHAIN_INCLUSION_TIMEOUT_MS = 180_000;

/**
 * Author RPC errors that prove this node did not accept the extrinsic, so it was never propagated: bad format,
 * verification, invalid, unknown validity, temporarily banned, priority too low, cycle, immediately dropped,
 * unactionable, no tags, invalid block, future rejected. 1013 "already imported" proves the opposite, and anything
 * else (timeouts, closed sockets, 1040) proves nothing.
 */
const DEFINITE_POOL_REJECTIONS = new Set([1001, 1002, 1010, 1011, 1012, 1014, 1015, 1016, 1018, 1019, 1020, 1021]);

const XCM_PALLETS = new Set(['xcmPallet', 'polkadotXcm']);

export function normalizeExtrinsicHash(hex: string): string {
  return hex.replace(/^0x/i, '').toLowerCase();
}

function rpcErrorCode(error: unknown): number | undefined {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  if (typeof code === 'number') return code;

  const match = /^(-?\d+):/.exec(error instanceof Error ? error.message : String(error));

  return match ? Number(match[1]) : undefined;
}

function describeDispatchError(extrinsic: TrackableExtrinsic, error: NonNullable<TrackableResult['dispatchError']>) {
  if (error.isModule) {
    try {
      const { section, name } = extrinsic.registry.findMetaError(error.asModule);

      return `${section}.${name}`;
    } catch {
      // Fall back to the raw value below.
    }
  }

  return error.toString();
}

/**
 * Older pallet-xcm versions report an incomplete local execution through `Attempted` and still dispatch successfully,
 * so a successful dispatch alone does not mean the assets left the account.
 */
function localXcmOutcome(events: TrackableResult['events']): 'complete' | 'incomplete' | 'unreadable' {
  for (const { event } of events ?? []) {
    if (!XCM_PALLETS.has(event.section) || event.method !== 'Attempted') continue;

    let outcome: unknown;
    try {
      outcome = event.data[0]?.toJSON?.();
    } catch {
      return 'unreadable';
    }
    if (typeof outcome !== 'object' || outcome === null || Array.isArray(outcome)) return 'unreadable';

    const variants = Object.keys(outcome);
    if (variants.length !== 1) return 'unreadable';
    if (variants[0].toLowerCase() !== 'complete') return 'incomplete';
  }

  return 'complete';
}

function inBlockOutcome(extrinsic: TrackableExtrinsic, hash: string, result: TrackableResult): TrackedSendOutcome {
  if (result.dispatchError) {
    return { kind: 'failed', hash, reason: describeDispatchError(extrinsic, result.dispatchError), included: true };
  }

  switch (localXcmOutcome(result.events)) {
    case 'incomplete':
      return { kind: 'failed', hash, reason: 'cross_chain_local_xcm_incomplete', included: true };
    case 'unreadable':
      return { kind: 'unknown', hash, reason: 'cross_chain_local_xcm_outcome_unreadable' };
    default:
      return { kind: 'included', hash };
  }
}

export function sendAndTrackExtrinsic(
  extrinsic: TrackableExtrinsic,
  { timeoutMs = CROSS_CHAIN_INCLUSION_TIMEOUT_MS }: { timeoutMs?: number } = {}
): Promise<TrackedSendOutcome> {
  const hash = normalizeExtrinsicHash(extrinsic.hash.toHex());

  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;

    const settle = (outcome: TrackedSendOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        unsubscribe?.();
      } catch {
        // The outcome is already known; a failing unsubscribe must not hide it.
      }
      resolve(outcome);
    };

    const timer = setTimeout(() => settle({ kind: 'unknown', hash, reason: 'cross_chain_inclusion_timeout' }), timeoutMs);

    const onResult = (result: TrackableResult) => {
      const { status } = result;

      if (status.isInBlock || status.isFinalized) settle(inBlockOutcome(extrinsic, hash, result));
      // Revalidation against the chain state found it can never be included.
      else if (status.isInvalid) {
        settle({ kind: 'failed', hash, reason: 'cross_chain_extrinsic_invalid', included: false });
      }
      // Gone from this node's pool, but it may already have been gossiped to the nodes that author blocks.
      else if (status.isDropped || status.isUsurped) {
        settle({ kind: 'unknown', hash, reason: `cross_chain_extrinsic_${status.type.toLowerCase()}` });
      }
    };

    let sending: Promise<() => void>;
    try {
      sending = extrinsic.send((result) => {
        try {
          onResult(result);
        } catch (error) {
          settle({ kind: 'unknown', hash, reason: error instanceof Error ? error.message : String(error) });
        }
      });
    } catch (error) {
      sending = Promise.reject(error);
    }

    sending
      .then((stop) => {
        unsubscribe = stop;
        if (settled) {
          try {
            stop();
          } catch {
            // Already settled.
          }
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        const code = rpcErrorCode(error);

        settle(
          code !== undefined && DEFINITE_POOL_REJECTIONS.has(code)
            ? { kind: 'failed', hash, reason: message, included: false }
            : { kind: 'unknown', hash, reason: message }
        );
      });
  });
}
