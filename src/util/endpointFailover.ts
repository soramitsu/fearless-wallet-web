/**
 * Ordered failover across equivalent public endpoints (Esplora indexers,
 * Solana JSON-RPC nodes).
 *
 * An attempt that fails with a retryable error moves on to the next endpoint;
 * after a full round every endpoint failed, the next round waits with
 * exponential backoff (honouring `Retry-After` up to the cap). A
 * non-retryable error (for example a 400 or a JSON-RPC application error) is
 * an answer, not an outage, and is returned to the caller unchanged.
 *
 * The last endpoint that answered is tried first next time, so one wallet
 * operation tends to read a consistent view from a single provider.
 */

type Sleep = (ms: number) => Promise<void>;

export type EndpointFailoverOptions = {
  baseDelayMs?: number;
  maxDelayMs?: number;
  rounds?: number;
  sleep?: Sleep;
};

export type EndpointAttemptFailure = {
  endpoint: string;
  error: unknown;
};

export class EndpointFailoverError extends Error {
  constructor(
    message: string,
    readonly failures: EndpointAttemptFailure[]
  ) {
    super(message);
    this.name = 'EndpointFailoverError';
  }

  get lastError(): unknown {
    return this.failures.at(-1)?.error;
  }
}

const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const RETRYABLE_HTTP_STATUSES: ReadonlySet<number> = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Network failures (no HTTP status) and throttling or server errors are retryable. */
export function isRetryableHttpStatus(status: number | undefined): boolean {
  return status === undefined || RETRYABLE_HTTP_STATUSES.has(status);
}

/** Seconds or an HTTP date, as sent in a 429/503 `Retry-After` header. */
export function parseRetryAfterMs(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();

  if (/^\d+$/u.test(trimmed)) return Number(trimmed) * 1000;

  const date = Date.parse(trimmed);

  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

export class EndpointFailover {
  readonly endpoints: readonly string[];
  private preferred = 0;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly rounds: number;
  private readonly sleep: Sleep;

  constructor(endpoints: readonly string[], { baseDelayMs = 400, maxDelayMs = 4_000, rounds = 2, sleep = defaultSleep }: EndpointFailoverOptions = {}) {
    const unique = [...new Set(endpoints)];

    if (unique.length === 0) throw new Error('endpoint_failover_requires_endpoints');

    this.endpoints = Object.freeze(unique);
    this.baseDelayMs = baseDelayMs;
    this.maxDelayMs = maxDelayMs;
    this.rounds = Math.max(1, rounds);
    this.sleep = sleep;
  }

  async run<T>(
    attempt: (endpoint: string) => Promise<T>,
    {
      isRetryable,
      retryAfterMs = () => undefined,
    }: {
      isRetryable: (error: unknown) => boolean;
      retryAfterMs?: (error: unknown) => number | undefined;
    }
  ): Promise<T> {
    const failures: EndpointAttemptFailure[] = [];

    for (let round = 0; round < this.rounds; round += 1) {
      if (round > 0) {
        const hinted = failures
          .slice(-this.endpoints.length)
          .map(({ error }) => retryAfterMs(error))
          .filter((value): value is number => value !== undefined);
        const backoff = this.baseDelayMs * 2 ** (round - 1);

        await this.sleep(Math.min(this.maxDelayMs, Math.max(backoff, ...hinted)));
      }

      for (let offset = 0; offset < this.endpoints.length; offset += 1) {
        const index = (this.preferred + offset) % this.endpoints.length;
        const endpoint = this.endpoints[index];

        try {
          const result = await attempt(endpoint);

          this.preferred = index;

          return result;
        } catch (error) {
          if (!isRetryable(error)) {
            this.preferred = index;
            throw error;
          }

          failures.push({ endpoint, error });
        }
      }
    }

    throw new EndpointFailoverError('all_endpoints_failed', failures);
  }
}

/**
 * Rejects with `onTimeout()` when `promise` has not settled in time, so a hung
 * endpoint counts as unavailable and the next one is tried.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(onTimeout()), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
