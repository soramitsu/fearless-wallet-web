import { BasicTxErrorCode, TransferErrorCode } from '@extension-base/background/types/types';
import {
  getSettledTransactionHash,
  getTransactionFailurePresentation,
  getTransactionOutcome,
  getUnknownTransactionHash,
  isAccountAccessFailure,
  transactionResponseSucceeded,
} from '@/helpers/transactionFailure';

describe('transaction failure presentation', () => {
  it('exposes the hash of a settled extrinsic only from a typed response', () => {
    const hash = 'cd'.repeat(32);

    expect(getSettledTransactionHash({ status: true, transactionHash: hash.toUpperCase() })).toBe(hash);
    expect(getSettledTransactionHash({ status: false, transactionHash: hash, errors: [] })).toBe(hash);
    expect(getSettledTransactionHash({ status: false, outcome: 'unknown', transactionHash: hash })).toBeNull();
    expect(getSettledTransactionHash({ status: true, transactionHash: `0x${hash}` })).toBeNull();
    expect(getSettledTransactionHash({ transactionHash: hash })).toBeNull();
    expect(getSettledTransactionHash(Object.create({ status: true, transactionHash: hash }))).toBeNull();
  });

  it.each([
    ['cross_chain_send_in_progress', 'assets.transactionPending'],
    ['cross_chain_fee_changed', 'assets.transferFeeApprovalRequired'],
    ['cross_chain_destination_fee_changed', 'assets.transferFeeApprovalRequired'],
    ['cross_chain_quote_token_required', 'assets.transferFeeApprovalRequired'],
    ['cross_chain_quote_token_unknown', 'assets.transferFeeApprovalRequired'],
    ['cross_chain_quote_expired', 'assets.transferFeeApprovalRequired'],
    ['cross_chain_quote_mismatch', 'assets.transferFeeApprovalRequired'],
  ])('explains the cross-chain refusal %s', (message, key) => {
    expect(
      getTransactionFailurePresentation({ status: false, errors: [{ code: TransferErrorCode.CROSSCHAIN_ERROR, message }] })
    ).toEqual({ key });
  });

  it('preserves only a typed, bounded unknown-outcome hash and rejects contradictory success', () => {
    const hash = 'ab'.repeat(32);
    const response = { status: false, outcome: 'unknown', transactionHash: hash.toUpperCase() };

    expect(getUnknownTransactionHash(response)).toBe(hash);
    expect(transactionResponseSucceeded(response)).toBe(false);
    expect(transactionResponseSucceeded({ ...response, status: true })).toBe(false);
    expect(getUnknownTransactionHash({ ...response, status: true })).toBeNull();
    expect(getUnknownTransactionHash({ ...response, transactionHash: '<script>secret</script>' })).toBeNull();
    expect(getUnknownTransactionHash(Object.create(response))).toBeNull();
    const getter = vi.fn(() => hash);
    Object.defineProperty(response, 'transactionHash', { get: getter });
    expect(getUnknownTransactionHash(response)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });

  it('surfaces insufficient balance with a bounded normalized asset symbol', () => {
    const response = {
      status: false,
      errors: [{ code: BasicTxErrorCode.BALANCE_TO_LOW, message: 'raw provider detail' }],
    };

    expect(getTransactionFailurePresentation(response, ' dot ')).toEqual({
      key: 'assets.insufficientBalance',
      localeProps: { asset: 'DOT' },
    });
    expect(getTransactionFailurePresentation(response, '<img src=x onerror=alert(1)>')).toEqual({
      key: 'assets.insufficientBalanceGeneric',
    });
  });

  it('uses localized password and known fail-closed transfer messages without exposing provider text', () => {
    expect(
      getTransactionFailurePresentation({ status: false, passwordError: 'private backend detail', errors: [] }, 'DOT')
    ).toEqual({ key: 'common.invalidPassword' });
    expect(
      getTransactionFailurePresentation({
        status: false,
        errors: [{ code: TransferErrorCode.TRANSFER_ERROR, message: 'iroha_transfer_disabled' }],
      })
    ).toEqual({ key: 'assets.irohaTransfersDisabled' });
    expect(
      getTransactionFailurePresentation({
        status: false,
        errors: [{ code: TransferErrorCode.TRANSFER_ERROR, message: 'bitcoin_transfer_disabled' }],
      })
    ).toEqual({ key: 'assets.bitcoinTransfersDisabled' });
    expect(
      getTransactionFailurePresentation({
        status: false,
        errors: [{ code: TransferErrorCode.TRANSFER_ERROR, message: '<script>steal()</script>' }],
      })
    ).toEqual({ key: 'assets.transactionFailedDetails' });
  });

  it.each(['toString', 'constructor', '__proto__'])(
    'does not inherit a locale key for prototype message %s',
    (message) => {
      expect(
        getTransactionFailurePresentation({
          status: false,
          errors: [{ code: TransferErrorCode.TRANSFER_ERROR, message }],
        })
      ).toEqual({ key: 'assets.transactionFailedDetails' });
    }
  );

  it('only accepts an explicit success with an empty, structurally valid error list', () => {
    expect(transactionResponseSucceeded({ status: true, errors: [] })).toBe(true);
    expect(transactionResponseSucceeded({ status: true })).toBe(true);
    expect(transactionResponseSucceeded({ status: true, errors: [{ message: 'contradictory success' }] })).toBe(false);
    expect(transactionResponseSucceeded({ status: true, errors: 'not-an-array' })).toBe(false);
    expect(transactionResponseSucceeded({ status: true, passwordError: 'wrong password' })).toBe(false);
    expect(transactionResponseSucceeded({ status: true, passwordError: true })).toBe(false);
    expect(transactionResponseSucceeded({ status: false, errors: [] })).toBe(false);
    expect(transactionResponseSucceeded(null)).toBe(false);
  });

  it.each([
    ['status', Object.create({ status: true, errors: [] })],
    [
      'errors',
      Object.assign(
        Object.create({ errors: [{ code: BasicTxErrorCode.BALANCE_TO_LOW, message: 'inherited error' }] }),
        { status: false }
      ),
    ],
    ['passwordError', Object.assign(Object.create({ passwordError: 'inherited password detail' }), { status: false })],
  ])('rejects a response with inherited %s state', (_field, response) => {
    expect(transactionResponseSucceeded(response)).toBe(false);
    expect(getTransactionFailurePresentation(response, 'DOT')).toEqual({ key: 'assets.transactionFailedDetails' });
  });

  it.each(['status', 'errors', 'passwordError'])('rejects an accessor-backed %s field without invoking it', (field) => {
    let reads = 0;
    const response: Record<string, unknown> = { status: false, errors: [] };

    Object.defineProperty(response, field, {
      configurable: true,
      enumerable: true,
      get: () => {
        reads += 1;

        return field === 'status' ? true : field === 'errors' ? [] : 'password detail';
      },
    });

    expect(transactionResponseSucceeded(response)).toBe(false);
    expect(getTransactionFailurePresentation(response, 'DOT')).toEqual({ key: 'assets.transactionFailedDetails' });
    expect(reads).toBe(0);
  });

  it('accepts a null-prototype response only through its own data fields', () => {
    const response = Object.assign(Object.create(null), { status: true, errors: [] });

    expect(transactionResponseSucceeded(response)).toBe(true);
  });

  it('does not inherit nested transaction error codes or messages', () => {
    const inheritedError = Object.create({
      code: BasicTxErrorCode.BALANCE_TO_LOW,
      message: 'iroha_transfer_disabled',
    });

    expect(getTransactionFailurePresentation({ status: false, errors: [inheritedError] }, 'DOT')).toEqual({
      key: 'assets.transactionFailedDetails',
    });
  });

  it('fails safely for malformed and hostile error payloads', () => {
    for (const response of [
      undefined,
      null,
      'failed',
      { status: false, errors: [null] },
      { status: false, errors: ['balanceTooLow'] },
      { status: false, errors: [{ code: { toString: () => BasicTxErrorCode.BALANCE_TO_LOW } }] },
    ]) {
      expect(transactionResponseSucceeded(response)).toBe(false);
      expect(getTransactionFailurePresentation(response, 'DOT')).toEqual({ key: 'assets.transactionFailedDetails' });
    }
  });
});

describe('Bitcoin and Solana send outcomes', () => {
  const failure = (message: string) => ({
    status: false,
    errors: [{ code: TransferErrorCode.TRANSFER_ERROR, message }],
  });

  it.each([
    ['bitcoin_broadcast_ambiguous', 'unconfirmed', 'assets.bitcoinBroadcastUnconfirmed'],
    ['solana_broadcast_ambiguous', 'unconfirmed', 'assets.solanaBroadcastUnconfirmed'],
    ['solana_broadcast_signature_mismatch', 'unconfirmed', 'assets.solanaBroadcastUnconfirmed'],
    ['bitcoin_broadcast_rejected', 'failed', 'assets.bitcoinBroadcastRejected'],
    ['bitcoin_previous_send_pending', 'failed', 'assets.bitcoinPreviousSendPending'],
    ['bitcoin_previous_send_unconfirmed', 'failed', 'assets.bitcoinPreviousSendUnconfirmed'],
    ['solana_previous_send_pending', 'failed', 'assets.solanaPreviousSendPending'],
    ['solana_simulation_failed', 'failed', 'assets.solanaSimulationFailed'],
    ['solana_transaction_expired', 'failed', 'assets.solanaTransactionExpired'],
    ['solana_transaction_failed', 'failed', 'assets.solanaTransactionFailed'],
  ])('presents %s as %s with %s', (message, outcome, key) => {
    expect(getTransactionOutcome(failure(message))).toBe(outcome);
    expect(getTransactionFailurePresentation(failure(message))).toEqual({ key });
  });

  it('never calls a success, a password error or a malformed response unconfirmed', () => {
    expect(getTransactionOutcome({ status: true, errors: [] })).toBe('success');
    expect(
      getTransactionOutcome({
        status: false,
        passwordError: 'wrong',
        errors: [{ message: 'bitcoin_broadcast_ambiguous' }],
      })
    ).toBe('failed');
    expect(getTransactionOutcome({ status: false, errors: 'bitcoin_broadcast_ambiguous' })).toBe('failed');
    expect(getTransactionOutcome(undefined)).toBe('failed');
  });

  it('explains a send stopped by a key that waits for a password, and marks it for the unlock action', () => {
    const legacy = {
      status: false,
      errors: [{ code: TransferErrorCode.TRANSFER_ERROR, message: 'legacy_password_required' }],
    };
    const ton = { status: false, errors: [{ message: 'ton_seed_needs_previous_password' }] };

    expect(getTransactionFailurePresentation(legacy)).toEqual({ key: 'migration.legacyPasswordRequired' });
    expect(getTransactionFailurePresentation(ton)).toEqual({ key: 'accountAccess.previousPasswordRequired' });
    expect(isAccountAccessFailure(legacy)).toBe(true);
    expect(isAccountAccessFailure(ton)).toBe(true);
    expect(isAccountAccessFailure({ status: false, errors: [{ message: 'bitcoin_broadcast_rejected' }] })).toBe(false);
    expect(isAccountAccessFailure({ status: true })).toBe(false);
    expect(isAccountAccessFailure(undefined)).toBe(false);
  });
});
