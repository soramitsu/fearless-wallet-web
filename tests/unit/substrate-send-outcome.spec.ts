import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUBSTRATE_SEND_TIMEOUT_MS, sendExtrinsic } from '@extension-base/api/substrate/shared/sendExtrinsic';
import { signAndSendExtrinsic } from '@extension-base/api/substrate/shared/signAndSendExtrinsic';
import { BasicTxErrorCode, TransferErrorCode, type BasicTxResponse } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import { getTransactionOutcome, getUnknownTransactionHash } from '@/helpers/transactionFailure';

vi.mock('@extension-base/api/substrate/shared/signExtrinsic', () => ({ signExtrinsic: vi.fn(async () => undefined) }));

const HASH = 'cd'.repeat(32);

type StatusType = 'Ready' | 'Broadcast' | 'InBlock' | 'Finalized' | 'Dropped' | 'Invalid' | 'Usurped';

const status = (type: StatusType) => ({
  type,
  isBroadcast: type === 'Broadcast',
  isInBlock: type === 'InBlock',
  isFinalized: type === 'Finalized',
  isDropped: type === 'Dropped',
  isInvalid: type === 'Invalid',
  isUsurped: type === 'Usurped',
});

/** A signed extrinsic whose node pushes statuses on demand, or refuses the submission. */
function fakeExtrinsic(rejectWith?: unknown) {
  const unsubscribe = vi.fn();
  let push: ((result: unknown) => void) | undefined;
  const extrinsic = {
    hash: { toHex: () => `0x${HASH.toUpperCase()}` },
    registry: { findMetaError: vi.fn(() => ({ section: 'balances', name: 'InsufficientBalance' })) },
    send: vi.fn(async (callback: (result: unknown) => void) => {
      if (rejectWith !== undefined) throw rejectWith;
      push = callback;

      return unsubscribe;
    }),
  };

  return { extrinsic, unsubscribe, push: (result: unknown) => push?.(result) };
}

function startSend(extrinsic: unknown) {
  const callback = vi.fn();
  const sending = sendExtrinsic({ extrinsic: extrinsic as never, callback, txState: {}, apiProps: {} as never });

  return { callback, sending };
}

const response = (callback: ReturnType<typeof vi.fn>) => callback.mock.calls[0]?.[0] as BasicTxResponse;

describe('Substrate send outcome', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('answers success only once the extrinsic is in a block, not when it is broadcast', async () => {
    vi.useFakeTimers();
    const { extrinsic, push, unsubscribe } = fakeExtrinsic();
    const { callback, sending } = startSend(extrinsic);

    await vi.advanceTimersByTimeAsync(0);
    push({ status: status('Ready') });
    push({ status: status('Broadcast') });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(callback).not.toHaveBeenCalled();

    push({ status: status('InBlock'), events: [] });
    await sending;

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({ status: true });
    expect(getTransactionOutcome(response(callback))).toBe('success');
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it.each([
    // 0.5 DOT to an empty account, or 0.5 USDT on Asset Hub below its minimum balance.
    ['a token error', { isModule: false, toString: () => '{"token":"BelowMinimum"}' }, '{"token":"BelowMinimum"}'],
    ['a module error', { isModule: true, asModule: { index: 10, error: 2 }, toString: () => '{}' }, 'balances.InsufficientBalance'],
  ])('reports a dispatch failure in the block (%s) as failed, not done', async (_name, dispatchError, message) => {
    vi.useFakeTimers();
    const { extrinsic, push } = fakeExtrinsic();
    const { callback, sending } = startSend(extrinsic);

    await vi.advanceTimersByTimeAsync(0);
    push({ status: status('Broadcast') });
    push({
      status: status('InBlock'),
      dispatchError,
      events: [{ event: { section: 'system', method: 'ExtrinsicFailed', data: [] } }],
    });
    await sending;

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({ status: false, errors: [{ code: TransferErrorCode.TRANSFER_ERROR, message }] });
    expect(getTransactionOutcome(response(callback))).toBe('failed');
  });

  it('answers unknown with the hash when no block arrives within the bound', async () => {
    vi.useFakeTimers();
    const { extrinsic, push, unsubscribe } = fakeExtrinsic();
    const { callback, sending } = startSend(extrinsic);

    await vi.advanceTimersByTimeAsync(0);
    push({ status: status('Ready') });
    push({ status: status('Broadcast') });
    await vi.advanceTimersByTimeAsync(SUBSTRATE_SEND_TIMEOUT_MS - 1);
    expect(callback).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await sending;

    expect(callback).toHaveBeenCalledOnce();
    expect(response(callback)).toMatchObject({ status: false, outcome: 'unknown', transactionHash: HASH });
    expect(response(callback).errors).toEqual([{ code: TransferErrorCode.TRANSFER_ERROR, message: expect.any(String) }]);
    // The popup then says the transfer may already have been sent, with this hash.
    expect(getUnknownTransactionHash(response(callback))).toBe(HASH);
    expect(getTransactionOutcome(response(callback))).toBe('unconfirmed');
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(SUBSTRATE_SEND_TIMEOUT_MS).toBe(120_000);
  });

  it.each(['Invalid', 'Dropped', 'Usurped'] as const)(
    'answers unknown with the hash when the pool reports %s after taking it',
    async (type) => {
      vi.useFakeTimers();
      const { extrinsic, push } = fakeExtrinsic();
      const { callback, sending } = startSend(extrinsic);

      await vi.advanceTimersByTimeAsync(0);
      push({ status: status('Broadcast') });
      push({ status: status(type) });
      await sending;

      expect(callback).toHaveBeenCalledOnce();
      expect(getUnknownTransactionHash(response(callback))).toBe(HASH);
    }
  );

  it('answers unknown with the hash when the connection fails during the submission', async () => {
    const { extrinsic } = fakeExtrinsic(new Error('disconnected from wss://node: 1006:: Abnormal Closure'));
    const { callback, sending } = startSend(extrinsic);

    await sending;

    expect(callback).toHaveBeenCalledOnce();
    expect(getUnknownTransactionHash(response(callback))).toBe(HASH);
  });

  it('still reports an explicit refusal at submission as a failure the caller explains', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const message = '1010: Invalid Transaction: Inability to pay some fees , e.g. account balance too low';
    const { extrinsic } = fakeExtrinsic(Object.assign(new Error(message), { code: 1010 }));
    const callback = vi.fn();
    const state = { keyringService: { isResetting: false, walletResetRevision: 0 } } as unknown as State;

    await signAndSendExtrinsic(
      {
        address: 'sender',
        apiProps: {} as never,
        callback,
        chainId: HASH,
        errorMessage: 'error transfer',
        extrinsic: extrinsic as never,
        isMobile: false,
      },
      state
    );

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({ status: false, errors: [{ code: BasicTxErrorCode.BALANCE_TO_LOW, message }] });
  });
});
