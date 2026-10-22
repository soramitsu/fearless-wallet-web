import { BasicTxErrorCode, TransferErrorCode } from '@extension-base/background/types/types';
import { getTransactionFailurePresentation, transactionResponseSucceeded } from '@/helpers/transactionFailure';

describe('transaction failure presentation', () => {
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
