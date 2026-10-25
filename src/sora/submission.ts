/** A send may have reached the chain even when its confirmation was lost. */
export class SoraSubmissionUnknownError extends Error {
  readonly outcome = 'unknown';
  readonly transactionHash?: string;

  constructor(transactionHash?: unknown) {
    super('SORA transaction confirmation is unavailable; check its status before retrying');
    this.name = 'SoraSubmissionUnknownError';
    if (typeof transactionHash === 'string' && /^(?:0x)?[a-f\d]{64}$/i.test(transactionHash)) {
      this.transactionHash = transactionHash.replace(/^0x/i, '').toLowerCase();
    }
  }
}

/** Keep uncertainty across messaging boundaries without exposing provider errors. */
export function soraSubmissionUnknownResponse(error: unknown) {
  if (!(error instanceof SoraSubmissionUnknownError)) return null;
  return {
    status: false as const,
    outcome: 'unknown' as const,
    ...(error.transactionHash ? { transactionHash: error.transactionHash } : {}),
    errors: [{ message: 'sora_broadcast_ambiguous' }],
  };
}
