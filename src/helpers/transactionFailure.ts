import { BasicTxErrorCode } from '@extension-base/background/types/types';

type TransactionFailurePresentation = {
  key: string;
  localeProps?: Record<string, string>;
};

type TransactionErrorLike = {
  code?: unknown;
  message?: unknown;
};

type TransactionResponseLike = {
  errors?: unknown;
  passwordError?: unknown;
  status?: unknown;
};

type OwnDataProperty = { kind: 'invalid' } | { kind: 'missing' } | { kind: 'value'; value: unknown };

const KNOWN_MESSAGE_KEYS = new Map<string, string>([
  ['bitcoin_transfer_disabled', 'assets.bitcoinTransfersDisabled'],
  ['iroha_transfer_disabled', 'assets.irohaTransfersDisabled'],
  ['iroha_transfer_protocol_mismatch', 'assets.irohaProtocolTestOnly'],
  ['unsupported_solana_asset', 'assets.unsupportedSolanaTokenTransfer'],
]);

const SAFE_ASSET_SYMBOL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/u;

function asResponse(value: unknown): TransactionResponseLike | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;

  try {
    const prototype = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null ? (value as TransactionResponseLike) : null;
  } catch {
    return null;
  }
}

function ownDataProperty(value: object, key: PropertyKey): OwnDataProperty {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);

    if (!descriptor) return { kind: 'missing' };
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) return { kind: 'invalid' };

    return { kind: 'value', value: descriptor.value };
  } catch {
    return { kind: 'invalid' };
  }
}

function errorsFrom(value: TransactionResponseLike | null): TransactionErrorLike[] | null {
  if (!value) return [];

  const errorsProperty = ownDataProperty(value, 'errors');

  if (errorsProperty.kind === 'missing') return [];
  if (errorsProperty.kind !== 'value' || !Array.isArray(errorsProperty.value)) return null;

  const errors: TransactionErrorLike[] = [];

  for (const error of errorsProperty.value) {
    const errorRecord = asResponse(error);

    if (!errorRecord) return null;

    const code = ownDataProperty(errorRecord, 'code');
    const message = ownDataProperty(errorRecord, 'message');

    if (code.kind === 'invalid' || message.kind === 'invalid') return null;

    errors.push({
      code: code.kind === 'value' ? code.value : undefined,
      message: message.kind === 'value' ? message.value : undefined,
    });
  }

  return errors;
}

function passwordErrorState(value: TransactionResponseLike | null): { valid: boolean; present: boolean } {
  if (!value) return { valid: true, present: false };

  const passwordError = ownDataProperty(value, 'passwordError');

  if (passwordError.kind === 'invalid') return { valid: false, present: false };
  if (
    passwordError.kind === 'missing' ||
    passwordError.value === undefined ||
    passwordError.value === null ||
    passwordError.value === ''
  ) {
    return { valid: true, present: false };
  }

  return { valid: true, present: true };
}

function transactionResponseSucceeded(value: unknown): boolean {
  const response = asResponse(value);
  if (!response) return false;

  const status = ownDataProperty(response, 'status');
  const errors = errorsFrom(response);
  const passwordError = passwordErrorState(response);

  return (
    status.kind === 'value' &&
    status.value === true &&
    errors !== null &&
    errors.length === 0 &&
    passwordError.valid &&
    !passwordError.present
  );
}

function getTransactionFailurePresentation(value: unknown, assetSymbol?: unknown): TransactionFailurePresentation {
  const response = asResponse(value);
  const errors = errorsFrom(response);
  const passwordError = passwordErrorState(response);

  if (!response || errors === null || !passwordError.valid) return { key: 'assets.transactionFailedDetails' };

  if (errors.some(({ code }) => code === BasicTxErrorCode.BALANCE_TO_LOW)) {
    const normalizedAsset = typeof assetSymbol === 'string' ? assetSymbol.trim() : '';

    if (SAFE_ASSET_SYMBOL.test(normalizedAsset)) {
      return {
        key: 'assets.insufficientBalance',
        localeProps: { asset: normalizedAsset.toUpperCase() },
      };
    }

    return { key: 'assets.insufficientBalanceGeneric' };
  }

  if (passwordError.present || errors.some(({ code }) => code === BasicTxErrorCode.INVALID_PASSWORD)) {
    return { key: 'common.invalidPassword' };
  }

  for (const error of errors) {
    if (typeof error.message !== 'string') continue;

    const knownKey = KNOWN_MESSAGE_KEYS.get(error.message);

    if (knownKey) return { key: knownKey };
  }

  return { key: 'assets.transactionFailedDetails' };
}

export { getTransactionFailurePresentation, transactionResponseSucceeded };
export type { TransactionFailurePresentation };
