// The error codes of the WalletConnect v2 Sign protocol. Peers compare the codes, so they are fixed by the protocol.

const SDK_ERRORS = {
  INVALID_METHOD: { code: 1001, message: 'Invalid method.' },
  INVALID_EVENT: { code: 1002, message: 'Invalid event.' },
  INVALID_UPDATE_REQUEST: { code: 1003, message: 'Invalid update request.' },
  INVALID_EXTEND_REQUEST: { code: 1004, message: 'Invalid extend request.' },
  INVALID_SESSION_SETTLE_REQUEST: { code: 1005, message: 'Invalid session settle request.' },
  UNAUTHORIZED_METHOD: { code: 3001, message: 'Unauthorized method.' },
  UNAUTHORIZED_EVENT: { code: 3002, message: 'Unauthorized event.' },
  UNAUTHORIZED_UPDATE_REQUEST: { code: 3003, message: 'Unauthorized update request.' },
  UNAUTHORIZED_EXTEND_REQUEST: { code: 3004, message: 'Unauthorized extend request.' },
  USER_REJECTED: { code: 5000, message: 'User rejected.' },
  USER_REJECTED_CHAINS: { code: 5001, message: 'User rejected chains.' },
  USER_REJECTED_METHODS: { code: 5002, message: 'User rejected methods.' },
  USER_REJECTED_EVENTS: { code: 5003, message: 'User rejected events.' },
  UNSUPPORTED_CHAINS: { code: 5100, message: 'Unsupported chains.' },
  UNSUPPORTED_METHODS: { code: 5101, message: 'Unsupported methods.' },
  UNSUPPORTED_EVENTS: { code: 5102, message: 'Unsupported events.' },
  UNSUPPORTED_ACCOUNTS: { code: 5103, message: 'Unsupported accounts.' },
  UNSUPPORTED_NAMESPACE_KEY: { code: 5104, message: 'Unsupported namespace key.' },
  USER_DISCONNECTED: { code: 6000, message: 'User disconnected.' },
  SESSION_SETTLEMENT_FAILED: { code: 7000, message: 'Session settlement failed.' },
  WC_METHOD_UNSUPPORTED: { code: 10001, message: 'Unsupported wc_ method.' },
} as const;

// Local failures; these never travel to a peer.
const INTERNAL_ERRORS = {
  NOT_INITIALIZED: { code: 1, message: 'Not initialized.' },
  NO_MATCHING_KEY: { code: 2, message: 'No matching key.' },
  MISSING_OR_INVALID: { code: 5, message: 'Missing or invalid.' },
  EXPIRED: { code: 6, message: 'Expired.' },
  UNKNOWN_TYPE: { code: 7, message: 'Unknown type.' },
  MISMATCHED_TOPIC: { code: 8, message: 'Mismatched topic.' },
  NON_CONFORMING_NAMESPACES: { code: 9, message: 'Non conforming namespaces.' },
} as const;

export type SdkErrorKey = keyof typeof SDK_ERRORS;
export type InternalErrorKey = keyof typeof INTERNAL_ERRORS;
export type WalletConnectErrorReason = { code: number; message: string };

const describe = (entry: WalletConnectErrorReason, context?: string | number): WalletConnectErrorReason => ({
  code: entry.code,
  message: context === undefined || context === '' ? entry.message : `${entry.message} ${context}`,
});

/** The reason a peer receives for a refusal, a disconnection or a failed request. */
export function getSdkError(key: SdkErrorKey, context?: string | number): WalletConnectErrorReason {
  return describe(SDK_ERRORS[key], context);
}

export function getInternalError(key: InternalErrorKey, context?: string | number): WalletConnectErrorReason {
  return describe(INTERNAL_ERRORS[key], context);
}

export const isSdkErrorKey = (value: unknown): value is SdkErrorKey =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(SDK_ERRORS, value);
