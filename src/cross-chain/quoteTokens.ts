/**
 * Single-use, time-boxed tokens that tie a cross-chain send to a quote the background computed.
 *
 * The quote fingerprint is an unkeyed hash of data the caller already knows, so on its own it proves nothing about
 * where a send request came from. The background now keeps a random token per quote and accepts a send only with an
 * unexpired token issued for exactly the same request, fees and fingerprint. A token is spent by its first use, whether
 * that use succeeds or not. Tokens live in memory: a restarted background asks for a new quote.
 */

export const CROSS_CHAIN_QUOTE_TOKEN_TTL_MS = 10 * 60 * 1000;

/** Quotes are requested while the form is edited; only the latest few can still be confirmed. */
const MAX_OUTSTANDING_QUOTES = 32;

export type CrossChainQuoteBinding = {
  from: string;
  to: string;
  amount: string;
  originNet: string;
  destinationNet: string;
  assetId: string;
  assetKey: string;
  routeId: string;
  routeProviderId: string;
  originFee: string;
  destinationFee: string;
  executionFingerprint: string;
};

const BINDING_FIELDS: readonly (keyof CrossChainQuoteBinding)[] = [
  'from',
  'to',
  'amount',
  'originNet',
  'destinationNet',
  'assetId',
  'assetKey',
  'routeId',
  'routeProviderId',
  'originFee',
  'destinationFee',
  'executionFingerprint',
];

function canonicalBinding(binding: CrossChainQuoteBinding): string {
  return JSON.stringify(BINDING_FIELDS.map((field) => String(binding[field] ?? '')));
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class CrossChainQuoteTokens {
  private readonly tokens = new Map<string, { binding: string; expiresAt: number }>();

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly createToken: () => string = randomToken
  ) {}

  issue(binding: CrossChainQuoteBinding): string {
    const now = this.now();
    for (const [token, entry] of this.tokens) if (entry.expiresAt <= now) this.tokens.delete(token);
    while (this.tokens.size >= MAX_OUTSTANDING_QUOTES) this.tokens.delete(this.tokens.keys().next().value as string);

    const token = this.createToken();
    this.tokens.set(token, { binding: canonicalBinding(binding), expiresAt: now + CROSS_CHAIN_QUOTE_TOKEN_TTL_MS });

    return token;
  }

  /** Spends the token. Throws unless it was issued for this exact binding and has not expired. */
  consume(token: unknown, binding: CrossChainQuoteBinding): void {
    if (typeof token !== 'string' || !token) throw new Error('cross_chain_quote_token_required');

    const entry = this.tokens.get(token);
    this.tokens.delete(token);

    if (!entry) throw new Error('cross_chain_quote_token_unknown');
    if (entry.expiresAt <= this.now()) throw new Error('cross_chain_quote_expired');
    if (entry.binding !== canonicalBinding(binding)) throw new Error('cross_chain_quote_mismatch');
  }
}

export const crossChainQuoteTokens = new CrossChainQuoteTokens();
