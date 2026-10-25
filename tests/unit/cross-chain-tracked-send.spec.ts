import { sendAndTrackExtrinsic, type TrackableResult } from '@/cross-chain/trackedSend';

const HASH = 'ab'.repeat(32);

type StatusType = 'Ready' | 'Broadcast' | 'InBlock' | 'Finalized' | 'Retracted' | 'Dropped' | 'Invalid' | 'Usurped';

const status = (type: StatusType): TrackableResult['status'] => ({
  type,
  isInBlock: type === 'InBlock',
  isFinalized: type === 'Finalized',
  isDropped: type === 'Dropped',
  isInvalid: type === 'Invalid',
  isUsurped: type === 'Usurped',
});

const codec = (json: unknown) => ({ toJSON: () => json });

const attempted = (outcome: unknown, section = 'xcmPallet') => ({
  event: { section, method: 'Attempted', data: [codec(outcome)] },
});

/** A submittable extrinsic whose node pushes the given results, or rejects the submission. */
function fakeExtrinsic({ results = [], rejectWith }: { results?: TrackableResult[]; rejectWith?: unknown } = {}) {
  const unsubscribe = vi.fn();
  let push: ((result: TrackableResult) => void) | undefined;
  const extrinsic = {
    hash: { toHex: () => `0x${HASH.toUpperCase()}` },
    registry: {
      findMetaError: vi.fn(({ index, error }: { index: unknown; error: unknown }) => {
        if (index === 99) throw new Error('unknown module');

        return { section: 'balances', name: `Error${String(index)}${String(error)}` };
      }),
    },
    send: vi.fn(async (callback: (result: TrackableResult) => void) => {
      if (rejectWith !== undefined) throw rejectWith;
      push = callback;
      results.forEach((result) => callback(result));

      return unsubscribe;
    }),
  };

  return { extrinsic, unsubscribe, push: (result: TrackableResult) => push?.(result) };
}

const rpcError = (code: number, message: string) => Object.assign(new Error(`${code}: ${message}`), { code });

describe('tracked cross-chain send', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('settles only when the extrinsic is in a block, not when it is broadcast', async () => {
    vi.useFakeTimers();
    const { extrinsic, unsubscribe, push } = fakeExtrinsic({ results: [{ status: status('Ready') }, { status: status('Broadcast') }] });
    let settled = false;
    const outcome = sendAndTrackExtrinsic(extrinsic).then((value) => {
      settled = true;

      return value;
    });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(settled).toBe(false);

    push({ status: status('InBlock'), events: [] });

    await expect(outcome).resolves.toEqual({ kind: 'included', hash: HASH });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('also settles on finality when no in-block status was seen', async () => {
    const { extrinsic } = fakeExtrinsic({ results: [{ status: status('Finalized') }] });

    await expect(sendAndTrackExtrinsic(extrinsic)).resolves.toEqual({ kind: 'included', hash: HASH });
  });

  it.each(['InBlock', 'Finalized'] as const)('does not report success when %s event lookup failed', async (type) => {
    const { extrinsic, unsubscribe } = fakeExtrinsic({
      results: [{ status: status(type), internalError: new Error('private RPC event lookup failure') }],
    });

    await expect(sendAndTrackExtrinsic(extrinsic)).resolves.toEqual({
      kind: 'unknown', hash: HASH, reason: 'cross_chain_dispatch_outcome_unavailable',
    });
    expect(extrinsic.send).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('reports a dispatch failure in the block with the module error and the hash', async () => {
    const { extrinsic } = fakeExtrinsic({
      results: [
        {
          status: status('InBlock'),
          dispatchError: { isModule: true, asModule: { index: 5, error: 2 }, toString: () => 'raw' },
        },
      ],
    });

    await expect(sendAndTrackExtrinsic(extrinsic)).resolves.toEqual({
      kind: 'failed',
      hash: HASH,
      reason: 'balances.Error52',
      included: true,
    });
  });

  it('falls back to the raw dispatch error when the module error cannot be decoded', async () => {
    const { extrinsic } = fakeExtrinsic({
      results: [
        {
          status: status('InBlock'),
          dispatchError: { isModule: true, asModule: { index: 99, error: 0 }, toString: () => '{"module":99}' },
        },
      ],
    });

    await expect(sendAndTrackExtrinsic(extrinsic)).resolves.toMatchObject({ kind: 'failed', reason: '{"module":99}' });
  });

  it.each([
    ['incomplete', { incomplete: { used: 1, error: 'FailedToTransactAsset' } }],
    ['error', { error: { error: 'Barrier' } }],
  ])('treats an %s local XCM execution as failed even though dispatch succeeded', async (_label, outcome) => {
    const { extrinsic } = fakeExtrinsic({
      results: [{ status: status('InBlock'), events: [attempted({ complete: { used: 1 } }, 'polkadotXcm'), attempted(outcome)] }],
    });

    await expect(sendAndTrackExtrinsic(extrinsic)).resolves.toEqual({
      kind: 'failed',
      hash: HASH,
      reason: 'cross_chain_local_xcm_incomplete',
      included: true,
    });
  });

  it.each([[null], ['Complete'], [{ complete: 1, error: 2 }]])(
    'keeps an unreadable local XCM outcome (%j) unknown instead of guessing',
    async (outcome) => {
      const { extrinsic } = fakeExtrinsic({ results: [{ status: status('InBlock'), events: [attempted(outcome)] }] });

      await expect(sendAndTrackExtrinsic(extrinsic)).resolves.toEqual({
        kind: 'unknown',
        hash: HASH,
        reason: 'cross_chain_local_xcm_outcome_unreadable',
      });
    }
  );

  it('accepts a complete local XCM execution', async () => {
    const { extrinsic } = fakeExtrinsic({
      results: [{ status: status('InBlock'), events: [attempted({ complete: { used: { refTime: 1, proofSize: 2 } } })] }],
    });

    await expect(sendAndTrackExtrinsic(extrinsic)).resolves.toEqual({ kind: 'included', hash: HASH });
  });

  it('fails an extrinsic the pool found invalid', async () => {
    const { extrinsic } = fakeExtrinsic({ results: [{ status: status('Broadcast') }, { status: status('Invalid') }] });

    await expect(sendAndTrackExtrinsic(extrinsic)).resolves.toEqual({
      kind: 'failed',
      hash: HASH,
      reason: 'cross_chain_extrinsic_invalid',
      included: false,
    });
  });

  it.each(['Dropped', 'Usurped'] as const)('keeps a %s extrinsic unknown: it may already have been gossiped', async (type) => {
    const { extrinsic } = fakeExtrinsic({ results: [{ status: status('Broadcast') }, { status: status(type) }] });

    await expect(sendAndTrackExtrinsic(extrinsic)).resolves.toEqual({
      kind: 'unknown',
      hash: HASH,
      reason: `cross_chain_extrinsic_${type.toLowerCase()}`,
    });
  });

  it('turns a missing inclusion into an unknown outcome after the timeout', async () => {
    vi.useFakeTimers();
    const { extrinsic, unsubscribe } = fakeExtrinsic({ results: [{ status: status('Broadcast') }] });
    const outcome = sendAndTrackExtrinsic(extrinsic, { timeoutMs: 1_000 });

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(outcome).resolves.toEqual({ kind: 'unknown', hash: HASH, reason: 'cross_chain_inclusion_timeout' });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it.each([1010, 1011, 1012, 1014, 1016])('fails when the node rejects the submission with %i', async (code) => {
    const { extrinsic } = fakeExtrinsic({ rejectWith: rpcError(code, 'Invalid Transaction') });

    await expect(sendAndTrackExtrinsic(extrinsic)).resolves.toEqual({
      kind: 'failed',
      hash: HASH,
      reason: `${code}: Invalid Transaction`,
      included: false,
    });
  });

  it('reads the pool error code from the message when the error carries no code', async () => {
    const { extrinsic } = fakeExtrinsic({ rejectWith: new Error('1010: Invalid Transaction: Inability to pay some fees') });

    await expect(sendAndTrackExtrinsic(extrinsic)).resolves.toMatchObject({ kind: 'failed', included: false });
  });

  it.each([
    ['already imported', rpcError(1013, 'Transaction Already Imported')],
    ['an unclassified author error', rpcError(1040, 'Other')],
    ['a closed socket', new Error('WebSocket is not connected')],
    ['a non-error rejection', 'socket closed'],
  ])('keeps %s unknown', async (_label, rejectWith) => {
    const { extrinsic } = fakeExtrinsic({ rejectWith });

    await expect(sendAndTrackExtrinsic(extrinsic)).resolves.toMatchObject({ kind: 'unknown', hash: HASH });
  });

  it('unsubscribes once the subscription is set up when the outcome arrived first', async () => {
    const { extrinsic, unsubscribe } = fakeExtrinsic({ results: [{ status: status('InBlock') }] });

    await sendAndTrackExtrinsic(extrinsic);
    await Promise.resolve();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('ignores updates after the outcome was settled', async () => {
    const { extrinsic, push } = fakeExtrinsic({ results: [{ status: status('InBlock') }] });
    const outcome = await sendAndTrackExtrinsic(extrinsic);

    push({ status: status('Dropped') });

    expect(outcome).toEqual({ kind: 'included', hash: HASH });
  });
});
