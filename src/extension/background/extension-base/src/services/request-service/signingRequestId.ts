export type SigningRequestKind = 'substrate' | 'evm' | 'solana';

/**
 * The key a queued signing request is approved or cancelled by. It is minted here, unguessable, and never taken from
 * a page: a page picks its own message ids, and a key it could choose or predict might name a request another site
 * queued, so that approving what the popup shows would sign a different, hidden request.
 */
export function createSigningRequestId(kind: SigningRequestKind): string {
  return `${kind}.${globalThis.crypto.randomUUID()}`;
}
