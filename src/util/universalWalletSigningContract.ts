import { WalletEcosystem } from '@/interfaces';

const UNIVERSAL_WALLET_SIGNING_METHODS = [
  'sign-message',
  'sign-transaction',
  'sign-and-send-transaction',
  'sign-all-transactions',
] as const;
const UNIVERSAL_WALLET_SIGNING_PAYLOAD_ENCODINGS = ['base64', 'hex', 'utf8'] as const;
const UNIVERSAL_WALLET_SIGNING_DISPLAYS = ['raw', 'utf8', 'hex'] as const;
const UNIVERSAL_WALLET_SIGNING_RESULT_STATUSES = ['approved', 'rejected', 'failed'] as const;

const UNIVERSAL_WALLET_SIGNING_LIMITS = {
  maxMessageBase64Length: 88 * 1024,
  maxMessageHexLength: 128 * 1024,
  maxMessageTextLength: 64 * 1024,
  maxTransactionBase64Length: 352 * 1024,
  maxTransactionBatch: 16,
} as const;

type UniversalWalletSigningMethod = (typeof UNIVERSAL_WALLET_SIGNING_METHODS)[number];
type UniversalWalletSigningPayloadEncoding = (typeof UNIVERSAL_WALLET_SIGNING_PAYLOAD_ENCODINGS)[number];
type UniversalWalletSigningDisplay = (typeof UNIVERSAL_WALLET_SIGNING_DISPLAYS)[number];
type UniversalWalletSigningResultStatus = (typeof UNIVERSAL_WALLET_SIGNING_RESULT_STATUSES)[number];

type UniversalWalletSigningValidationError =
  | 'invalidRequestId'
  | 'invalidAccountId'
  | 'invalidEcosystem'
  | 'invalidChainId'
  | 'invalidOrigin'
  | 'invalidTimestamp'
  | 'messageRequired'
  | 'transactionRequired'
  | 'invalidBatch'
  | 'invalidBase64'
  | 'invalidHex'
  | 'invalidMessage'
  | 'payloadNotAllowed'
  | 'publicKeyRequired'
  | 'invalidPublicKey'
  | 'signatureRequired'
  | 'invalidSignature'
  | 'signedTransactionRequired'
  | 'transactionHashRequired'
  | 'errorCodeRequired'
  | 'errorNotAllowed'
  | 'signatureNotAllowed';

type UniversalWalletSigningPayload = {
  encoding: UniversalWalletSigningPayloadEncoding;
  value: string;
  display: UniversalWalletSigningDisplay;
};

type UniversalWalletSigningRequest = {
  requestId: string;
  accountId: string;
  ecosystem: WalletEcosystem;
  chainId: string;
  origin: string;
  method: UniversalWalletSigningMethod;
  message?: UniversalWalletSigningPayload;
  transactionBase64?: string;
  transactionsBase64?: string[];
  createdAtMillis: number;
  expiresAtMillis?: number;
};

type UniversalWalletSigningResult = {
  requestId: string;
  accountId: string;
  ecosystem: WalletEcosystem;
  chainId: string;
  method: UniversalWalletSigningMethod;
  status: UniversalWalletSigningResultStatus;
  publicKey?: string;
  signatureHex?: string;
  signatureBase64?: string;
  signatureBase58?: string;
  signedTransactionBase64?: string;
  signedTransactionsBase64?: string[];
  transactionHash?: string;
  errorCode?: string;
  signedAtMillis: number;
};

function validateUniversalWalletSigningRequest(request: UniversalWalletSigningRequest): UniversalWalletSigningValidationError[] {
  const errors = new Set<UniversalWalletSigningValidationError>();
  validateEnvelope(
    {
      accountId: request.accountId,
      chainId: request.chainId,
      createdAtMillis: request.createdAtMillis,
      ecosystem: request.ecosystem,
      expiresAtMillis: request.expiresAtMillis,
      origin: request.origin,
      requestId: request.requestId,
    },
    errors
  );

  const transactionsBase64 = request.transactionsBase64 ?? [];

  if (request.method === 'sign-message') {
    if (!request.message) {
      errors.add('messageRequired');
    } else {
      validateUniversalWalletSigningPayload(request.message).forEach((error) => errors.add(error));
    }
    if (request.transactionBase64 !== undefined || transactionsBase64.length) errors.add('payloadNotAllowed');
  } else if (request.method === 'sign-transaction' || request.method === 'sign-and-send-transaction') {
    if (!isBase64Payload(request.transactionBase64, UNIVERSAL_WALLET_SIGNING_LIMITS.maxTransactionBase64Length)) {
      errors.add('transactionRequired');
    }
    if (request.message !== undefined || transactionsBase64.length) errors.add('payloadNotAllowed');
  } else {
    if (!transactionsBase64.length || transactionsBase64.length > UNIVERSAL_WALLET_SIGNING_LIMITS.maxTransactionBatch) {
      errors.add('invalidBatch');
    }
    if (
      transactionsBase64.some(
        (transaction) => !isBase64Payload(transaction, UNIVERSAL_WALLET_SIGNING_LIMITS.maxTransactionBase64Length)
      )
    ) {
      errors.add('invalidBase64');
    }
    if (request.message !== undefined || request.transactionBase64 !== undefined) errors.add('payloadNotAllowed');
  }

  return [...errors];
}

function validateUniversalWalletSigningPayload(payload: UniversalWalletSigningPayload): UniversalWalletSigningValidationError[] {
  const errors = new Set<UniversalWalletSigningValidationError>();

  if (payload.encoding === 'base64') {
    if (!isBase64Payload(payload.value, UNIVERSAL_WALLET_SIGNING_LIMITS.maxMessageBase64Length)) errors.add('invalidBase64');
  } else if (payload.encoding === 'hex') {
    if (!isHexPayload(payload.value, UNIVERSAL_WALLET_SIGNING_LIMITS.maxMessageHexLength)) errors.add('invalidHex');
  } else if (!isHumanText(payload.value, UNIVERSAL_WALLET_SIGNING_LIMITS.maxMessageTextLength)) {
    errors.add('invalidMessage');
  }

  return [...errors];
}

function validateUniversalWalletSigningResult(result: UniversalWalletSigningResult): UniversalWalletSigningValidationError[] {
  const errors = new Set<UniversalWalletSigningValidationError>();
  validateEnvelope(
    {
      accountId: result.accountId,
      chainId: result.chainId,
      createdAtMillis: result.signedAtMillis,
      ecosystem: result.ecosystem,
      origin: 'result',
      requestId: result.requestId,
    },
    errors
  );

  const signedTransactionsBase64 = result.signedTransactionsBase64 ?? [];

  if (result.status === 'approved') {
    if (result.publicKey === undefined) errors.add('publicKeyRequired');
    else if (!isMachineText(result.publicKey, 256)) errors.add('invalidPublicKey');

    validateApprovedResultPayload(result, signedTransactionsBase64, errors);
    if (result.errorCode !== undefined) errors.add('errorNotAllowed');
  } else {
    if (result.errorCode === undefined || !/^[a-z][a-z0-9_:-]{1,63}$/.test(result.errorCode)) {
      errors.add('errorCodeRequired');
    }
    if (
      result.publicKey !== undefined ||
      result.signatureHex !== undefined ||
      result.signatureBase64 !== undefined ||
      result.signatureBase58 !== undefined ||
      result.signedTransactionBase64 !== undefined ||
      signedTransactionsBase64.length ||
      result.transactionHash !== undefined
    ) {
      errors.add('signatureNotAllowed');
    }
  }

  return [...errors];
}

function validateApprovedResultPayload(
  result: UniversalWalletSigningResult,
  signedTransactionsBase64: string[],
  errors: Set<UniversalWalletSigningValidationError>
): void {
  const hasSignature =
    result.signatureHex !== undefined || result.signatureBase64 !== undefined || result.signatureBase58 !== undefined;

  if (result.signatureHex !== undefined && !/^(?:[0-9a-f]{2}){32,130}$/.test(result.signatureHex)) {
    errors.add('invalidSignature');
  }
  if (result.signatureBase64 !== undefined && !isBase64Payload(result.signatureBase64, 512)) errors.add('invalidSignature');
  if (result.signatureBase58 !== undefined && !/^[1-9A-HJ-NP-Za-km-z]{64,128}$/.test(result.signatureBase58)) {
    errors.add('invalidSignature');
  }

  if (result.method === 'sign-message') {
    if (!hasSignature) errors.add('signatureRequired');
    if (result.signedTransactionBase64 !== undefined || signedTransactionsBase64.length || result.transactionHash !== undefined) {
      errors.add('payloadNotAllowed');
    }
  } else if (result.method === 'sign-transaction') {
    if (!isBase64Payload(result.signedTransactionBase64, UNIVERSAL_WALLET_SIGNING_LIMITS.maxTransactionBase64Length)) {
      errors.add('signedTransactionRequired');
    }
    if (signedTransactionsBase64.length || result.transactionHash !== undefined) errors.add('payloadNotAllowed');
  } else if (result.method === 'sign-and-send-transaction') {
    if (!isBase64Payload(result.signedTransactionBase64, UNIVERSAL_WALLET_SIGNING_LIMITS.maxTransactionBase64Length)) {
      errors.add('signedTransactionRequired');
    }
    if (!isMachineText(result.transactionHash ?? '', 256)) errors.add('transactionHashRequired');
    if (signedTransactionsBase64.length) errors.add('payloadNotAllowed');
  } else {
    if (!signedTransactionsBase64.length || signedTransactionsBase64.length > UNIVERSAL_WALLET_SIGNING_LIMITS.maxTransactionBatch) {
      errors.add('signedTransactionRequired');
    }
    if (
      signedTransactionsBase64.some(
        (transaction) => !isBase64Payload(transaction, UNIVERSAL_WALLET_SIGNING_LIMITS.maxTransactionBase64Length)
      )
    ) {
      errors.add('invalidBase64');
    }
    if (result.signedTransactionBase64 !== undefined || result.transactionHash !== undefined) errors.add('payloadNotAllowed');
  }
}

function validateEnvelope(
  value: {
    accountId: string;
    chainId: string;
    createdAtMillis: number;
    ecosystem: WalletEcosystem;
    expiresAtMillis?: number;
    origin: string;
    requestId: string;
  },
  errors: Set<UniversalWalletSigningValidationError>
): void {
  if (!/^sign_[A-Za-z0-9_-]{16,64}$/.test(value.requestId)) errors.add('invalidRequestId');
  if (!/^[a-z0-9][a-z0-9._:-]{1,63}$/.test(value.accountId)) errors.add('invalidAccountId');
  if (!(Object.values(WalletEcosystem) as string[]).includes(value.ecosystem)) errors.add('invalidEcosystem');
  if (!/^[A-Za-z0-9._:-]{2,128}$/.test(value.chainId)) errors.add('invalidChainId');
  if (!isMachineText(value.origin, 512)) errors.add('invalidOrigin');
  if (
    !Number.isSafeInteger(value.createdAtMillis) ||
    value.createdAtMillis <= 0 ||
    (value.expiresAtMillis !== undefined &&
      (!Number.isSafeInteger(value.expiresAtMillis) || value.expiresAtMillis <= value.createdAtMillis))
  ) {
    errors.add('invalidTimestamp');
  }
}

function isBase64Payload(value: string | undefined, maxLength: number): boolean {
  return (
    value !== undefined &&
    !!value &&
    value.length <= maxLength &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  );
}

function isHexPayload(value: string, maxLength: number): boolean {
  return !!value && value.length <= maxLength && /^(?:[0-9a-f]{2})+$/.test(value);
}

function isHumanText(value: string, maxLength: number): boolean {
  const normalized = value.trim();
  return !!normalized && normalized.length <= maxLength && !hasControlCharacters(normalized);
}

function isMachineText(value: string, maxLength: number): boolean {
  return !!value && value.length <= maxLength && value === value.trim() && !hasWhitespaceOrControl(value);
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((char) => {
    const codePoint = char.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function hasWhitespaceOrControl(value: string): boolean {
  return [...value].some((char) => {
    const codePoint = char.codePointAt(0) ?? 0;
    return codePoint <= 0x20 || codePoint === 0x7f;
  });
}

export {
  UNIVERSAL_WALLET_SIGNING_DISPLAYS,
  UNIVERSAL_WALLET_SIGNING_LIMITS,
  UNIVERSAL_WALLET_SIGNING_METHODS,
  UNIVERSAL_WALLET_SIGNING_PAYLOAD_ENCODINGS,
  UNIVERSAL_WALLET_SIGNING_RESULT_STATUSES,
  validateUniversalWalletSigningPayload,
  validateUniversalWalletSigningRequest,
  validateUniversalWalletSigningResult,
};

export type {
  UniversalWalletSigningDisplay,
  UniversalWalletSigningMethod,
  UniversalWalletSigningPayload,
  UniversalWalletSigningPayloadEncoding,
  UniversalWalletSigningRequest,
  UniversalWalletSigningResult,
  UniversalWalletSigningResultStatus,
  UniversalWalletSigningValidationError,
};
