import { BasicTxErrorCode } from '@extension-base/background/types/types';
import { ACCOUNT_ACCESS_ERROR_LOCALE_KEYS, SEND_ERROR_LOCALE_KEYS } from '@/helpers/transferErrors';

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
  outcome?: unknown;
  passwordError?: unknown;
  status?: unknown;
  transactionHash?: unknown;
};

type OwnDataProperty = { kind: 'invalid' } | { kind: 'missing' } | { kind: 'value'; value: unknown };

type TransactionOutcome = 'failed' | 'success' | 'unconfirmed';

const KNOWN_MESSAGE_KEYS = new Map<string, string>([
  ...Object.entries(SEND_ERROR_LOCALE_KEYS),
  ['transfer_fee_changed', 'assets.transferFeeChanged'],
  ['transfer_fee_approval_required', 'assets.transferFeeApprovalRequired'],
  ...Object.entries(ACCOUNT_ACCESS_ERROR_LOCALE_KEYS),
  ['bitcoin_transfer_disabled', 'assets.bitcoinTransfersDisabled'],
  ['iroha_transfer_disabled', 'assets.irohaTransfersDisabled'],
  ['iroha_network_reset', 'assets.irohaTransfersDisabled'],
  ['iroha_network_identity_unavailable', 'assets.irohaTransfersDisabled'],
  ['iroha_node_protocol_unsupported', 'assets.irohaTransfersDisabled'],
  ['unsupported_solana_asset', 'assets.unsupportedSolanaTokenTransfer'],
  ['cross_chain_send_in_progress', 'assets.transactionPending'],
  // Nothing was sent; the quote must be confirmed again.
  ['cross_chain_fee_changed', 'assets.transferFeeApprovalRequired'],
  ['cross_chain_destination_fee_changed', 'assets.transferFeeApprovalRequired'],
  ['cross_chain_quote_token_required', 'assets.transferFeeApprovalRequired'],
  ['cross_chain_quote_token_unknown', 'assets.transferFeeApprovalRequired'],
  ['cross_chain_quote_expired', 'assets.transferFeeApprovalRequired'],
  ['cross_chain_quote_mismatch', 'assets.transferFeeApprovalRequired'],
]);

const HEX_TRANSACTION_HASH = /^[0-9a-f]{64}$/iu;
// 64 bytes in base58: 88 characters at most, and fewer for the rare signature that is a smaller number.
const SOLANA_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/u;
// The network may already have these transfers: they can still go through, so the
// result is neither a success nor a failure.
const UNCONFIRMED_MESSAGES: ReadonlySet<string> = new Set([
  'bitcoin_broadcast_ambiguous',
  'solana_broadcast_ambiguous',
  'solana_broadcast_signature_mismatch',
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
  const outcome = ownDataProperty(response, 'outcome');
  const errors = errorsFrom(response);
  const passwordError = passwordErrorState(response);

  return (
    status.kind === 'value' &&
    status.value === true &&
    (outcome.kind === 'missing' || (outcome.kind === 'value' && outcome.value === undefined)) &&
    errors !== null &&
    errors.length === 0 &&
    passwordError.valid &&
    !passwordError.present
  );
}

// Only typed background outcomes may expose a hash. Never display provider text or an
// accessor-supplied value as transaction status.
function getUnknownTransactionHash(value: unknown): string | null {
  const response = asResponse(value);
  if (!response) return null;

  const status = ownDataProperty(response, 'status');
  const outcome = ownDataProperty(response, 'outcome');
  const hash = ownDataProperty(response, 'transactionHash');

  if (
    status.kind !== 'value' || status.value !== false ||
    outcome.kind !== 'value' || outcome.value !== 'unknown' ||
    hash.kind !== 'value' || typeof hash.value !== 'string'
  ) return null;

  // Bitcoin and Iroha hashes are hex, which a base58 reading would also accept when it holds no zero; a Solana
  // signature is base58 and case-sensitive.
  if (HEX_TRANSACTION_HASH.test(hash.value)) return hash.value.toLowerCase();

  return SOLANA_SIGNATURE.test(hash.value) ? hash.value : null;
}

function getTransactionOutcome(value: unknown): TransactionOutcome {
  if (transactionResponseSucceeded(value)) return 'success';
  if (getUnknownTransactionHash(value)) return 'unconfirmed';

  const response = asResponse(value);
  const errors = errorsFrom(response);
  const passwordError = passwordErrorState(response);

  if (!response || errors === null || !passwordError.valid || passwordError.present) return 'failed';

  return errors.some(({ message }) => typeof message === 'string' && UNCONFIRMED_MESSAGES.has(message))
    ? 'unconfirmed'
    : 'failed';
}

// The hash of an extrinsic whose outcome the background settled, failed at dispatch or included.
function getSettledTransactionHash(value: unknown): string | null {
  const response = asResponse(value);
  if (!response) return null;

  const status = ownDataProperty(response, 'status');
  const outcome = ownDataProperty(response, 'outcome');
  const hash = ownDataProperty(response, 'transactionHash');

  if (
    status.kind !== 'value' || typeof status.value !== 'boolean' ||
    !(outcome.kind === 'missing' || (outcome.kind === 'value' && outcome.value === undefined)) ||
    hash.kind !== 'value' || typeof hash.value !== 'string' || !/^[0-9a-f]{64}$/iu.test(hash.value)
  ) return null;

  return hash.value.toLowerCase();
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

/** The send stopped before signing because the account's key waits for a password (Account access). */
function isAccountAccessFailure(value: unknown): boolean {
  const errors = errorsFrom(asResponse(value));

  return (
    getTransactionOutcome(value) === 'failed' &&
    !!errors?.some(({ message }) => typeof message === 'string' && message in ACCOUNT_ACCESS_ERROR_LOCALE_KEYS)
  );
}

export {
  getSettledTransactionHash,
  getTransactionFailurePresentation,
  getTransactionOutcome,
  getUnknownTransactionHash,
  isAccountAccessFailure,
  transactionResponseSucceeded,
};
export type { TransactionFailurePresentation, TransactionOutcome };
