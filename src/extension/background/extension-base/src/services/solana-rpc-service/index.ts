import { base58Encode } from '@polkadot/util-crypto';
import { UNIVERSAL_WALLET_SOLANA_RPC_FAILOVER_ENDPOINTS } from '@/consts/solanaRpc';
import {
  EndpointFailover,
  isRetryableHttpStatus,
  parseRetryAfterMs,
  withTimeout,
  type EndpointFailoverOptions,
} from '@/util/endpointFailover';
import { parseSolanaSerializedTransaction } from '@/util/solanaTransaction';

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

type SolanaRpcNetwork = 'mainnet' | 'devnet';
type SolanaRpcCommitment = 'processed' | 'confirmed' | 'finalized';

type SolanaJsonRpcErrorPayload = {
  code: number;
  data?: unknown;
  message: string;
};

type SolanaRpcContext = {
  apiVersion?: string;
  slot: number;
};

type SolanaLatestBlockhash = {
  blockhash: string;
  lastValidBlockHeight: number;
};

type SolanaLatestBlockhashResponse = {
  context: SolanaRpcContext;
  value: SolanaLatestBlockhash;
};

type SolanaFeeForMessageResponse = {
  context: SolanaRpcContext;
  value: number | null;
};

type SolanaSimulationReplacementBlockhash = {
  blockhash: string;
  lastValidBlockHeight: number;
};

type SolanaSimulationValue = {
  accounts?: unknown;
  err: unknown | null;
  logs: string[] | null;
  replacementBlockhash?: SolanaSimulationReplacementBlockhash;
  returnData?: unknown;
  unitsConsumed?: number;
};

type SolanaSimulationResponse = {
  context: SolanaRpcContext;
  value: SolanaSimulationValue;
};

type SolanaSimulationOptions = {
  commitment?: SolanaRpcCommitment;
  replaceRecentBlockhash?: boolean;
  sigVerify?: boolean;
};

type SolanaBroadcastOptions = {
  maxRetries?: number;
  minContextSlot?: number;
  preflightCommitment?: SolanaRpcCommitment;
  skipPreflight?: boolean;
};

type SolanaSignatureStatus = {
  confirmationStatus: SolanaRpcCommitment | null;
  confirmations: number | null;
  err: unknown | null;
  slot: number;
};

/** What one endpoint has shown for a signed transaction whose broadcast outcome is unknown. */
type SolanaEndpointVerdict =
  | { state: 'expired' }
  | { state: 'landed'; status: SolanaSignatureStatus }
  | { state: 'pending' };

/**
 * What the endpoints together have shown. An expiry carries how many distinct hosts each proved it on their own:
 * one host's "no trace" can come from a backend that lacks the transaction's history.
 */
type SolanaSignatureResolution =
  | { provingHosts: number; state: 'expired' }
  | { state: 'landed'; status: SolanaSignatureStatus }
  | { state: 'pending' };

type SolanaSignatureQuery = {
  lastValidBlockHeight: number;
  signature: string;
};

type SolanaParsedAccount = {
  data: unknown;
  executable: boolean;
  lamports: number;
  owner: string;
  space?: number;
};

type SolanaTokenAccountEntry = {
  account: SolanaParsedAccount;
  pubkey: string;
};

type SolanaPrioritizationFee = {
  prioritizationFee: number;
  slot: number;
};

type SolanaRpcClientOptions = {
  /**
   * Genesis hash of the cluster every endpoint must serve. When set, an endpoint is asked for its genesis hash before
   * it is used and skipped if it names another cluster (a devnet or testnet node behind a mainnet name).
   */
  expectedGenesisHash?: string;
  failover?: EndpointFailoverOptions;
  fetchFn?: FetchLike;
  network?: SolanaRpcNetwork;
  requestTimeoutMs?: number;
  rpcUrl?: string;
  /** Equivalent RPC endpoints tried in order; `rpcUrl` alone means just that one. */
  rpcUrls?: readonly string[];
};

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
// "Node is unhealthy / behind" answers mean try another node, not "your
// transaction is wrong".
const RETRYABLE_RPC_ERROR_CODES: ReadonlySet<number> = new Set([-32005, -32004, -32014, -32016]);
// JSON-RPC errors a node gives only before it relays a transaction: it judged the transaction invalid (-32002
// preflight failure, -32003 bad signature, -32600/-32602/-32700 undecodable) or could not take it at all (-32601 and
// the retryable codes). Any other code, such as a gateway's quota, auth or internal error, proves nothing: the
// gateway may have relayed the transaction before it failed.
const PRE_RELAY_RPC_ERROR_CODES: ReadonlySet<number> = new Set([
  ...RETRYABLE_RPC_ERROR_CODES,
  -32002,
  -32003,
  -32600,
  -32601,
  -32602,
  -32700,
]);

class SolanaRpcError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown,
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'SolanaRpcError';
  }
}

/**
 * An endpoint could not be shown to serve the expected cluster. Raised before the request that mattered is posted,
 * so nothing was sent to that endpoint; the next endpoint is tried.
 */
class SolanaClusterCheckError extends SolanaRpcError {
  constructor(
    message: 'solana_cluster_mismatch' | 'solana_cluster_unverified',
    cause?: unknown
  ) {
    super(
      message,
      cause instanceof SolanaRpcError ? cause.status : undefined,
      cause instanceof SolanaRpcError ? cause.body : undefined,
      cause instanceof SolanaRpcError ? cause.retryAfterMs : undefined
    );
    this.name = 'SolanaClusterCheckError';
  }
}

/** Genesis hashes of the clusters the wallet talks to. */
const SOLANA_GENESIS_HASHES: Readonly<Record<SolanaRpcNetwork, string>> = Object.freeze({
  devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  mainnet: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
});

/** A client whose endpoints are each proven to serve the named cluster before they answer anything else. */
function createClusterBoundSolanaRpcClient(options: SolanaRpcClientOptions & { network: SolanaRpcNetwork }): SolanaRpcClient {
  return new SolanaRpcClient({ ...options, expectedGenesisHash: SOLANA_GENESIS_HASHES[normalizeNetwork(options.network)] });
}

/**
 * `ambiguous` means an attempt may have reached a node (timeout, network
 * error, throttling, a server error or an unreadable answer) and none
 * confirmed the transaction, so it may still land. Otherwise every node that
 * answered refused it before relaying it, for example in preflight.
 */
class SolanaBroadcastError extends SolanaRpcError {
  constructor(
    message: 'solana_broadcast_ambiguous' | 'solana_broadcast_rejected',
    readonly ambiguous: boolean,
    readonly lastError?: unknown
  ) {
    super(
      message,
      lastError instanceof SolanaRpcError ? lastError.status : undefined,
      lastError instanceof SolanaRpcError ? lastError.body : undefined
    );
    this.name = 'SolanaBroadcastError';
  }
}

class SolanaRpcClient {
  private nextId = 1;
  private readonly endpoints: EndpointFailover;
  private readonly expectedGenesisHash?: string;
  private readonly failoverOptions?: EndpointFailoverOptions;
  private readonly fetchFn: FetchLike;
  private readonly requestTimeoutMs: number;

  constructor({
    expectedGenesisHash,
    failover,
    fetchFn = globalThis.fetch.bind(globalThis),
    network = 'mainnet',
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    rpcUrl,
    rpcUrls,
  }: SolanaRpcClientOptions = {}) {
    this.expectedGenesisHash = expectedGenesisHash === undefined ? undefined : normalizePubkey(expectedGenesisHash, 'invalid_genesis_hash');
    this.failoverOptions = failover;
    this.fetchFn = fetchFn;
    this.requestTimeoutMs = requestTimeoutMs;
    this.endpoints = new EndpointFailover(
      (rpcUrls?.length ? rpcUrls : rpcUrl ? [rpcUrl] : UNIVERSAL_WALLET_SOLANA_RPC_FAILOVER_ENDPOINTS[normalizeNetwork(network)]).map(
        normalizeRpcUrl
      ),
      failover
    );
  }

  get rpcUrls(): readonly string[] {
    return this.endpoints.endpoints;
  }

  getGenesisHash(): Promise<string> {
    return this.request('getGenesisHash', [], (value) => normalizePubkey(value, 'invalid_genesis_response'));
  }

  getBalance(address: string, commitment: SolanaRpcCommitment = 'confirmed'): Promise<number> {
    return this.request(
      'getBalance',
      [normalizePubkey(address, 'invalid_address'), { commitment: normalizeCommitment(commitment) }],
      (value) => requireSafeInteger(isRecord(value) ? value.value : undefined, 'invalid_balance_response')
    );
  }

  getBlockHeight(commitment: SolanaRpcCommitment = 'confirmed'): Promise<number> {
    return this.request('getBlockHeight', [{ commitment: normalizeCommitment(commitment) }], (value) =>
      requireSafeInteger(value, 'invalid_block_height_response')
    );
  }

  /** `null` when the account does not exist. */
  getAccountInfo(address: string, commitment: SolanaRpcCommitment = 'confirmed'): Promise<SolanaParsedAccount | null> {
    return this.request(
      'getAccountInfo',
      [normalizePubkey(address, 'invalid_address'), { commitment: normalizeCommitment(commitment), encoding: 'jsonParsed' }],
      (value) => {
        if (!isRecord(value)) throw new SolanaRpcError('invalid_account_response');

        return value.value === null ? null : normalizeParsedAccount(value.value);
      }
    );
  }

  getMultipleAccounts(
    addresses: string[],
    commitment: SolanaRpcCommitment = 'confirmed'
  ): Promise<Array<SolanaParsedAccount | null>> {
    if (!Array.isArray(addresses) || addresses.length === 0 || addresses.length > 100) {
      throw new SolanaRpcError('invalid_addresses');
    }

    return this.request(
      'getMultipleAccounts',
      [
        addresses.map((address) => normalizePubkey(address, 'invalid_address')),
        { commitment: normalizeCommitment(commitment), encoding: 'jsonParsed' },
      ],
      (value) => {
        if (!isRecord(value) || !Array.isArray(value.value) || value.value.length !== addresses.length) {
          throw new SolanaRpcError('invalid_accounts_response');
        }

        return value.value.map((account) => (account === null ? null : normalizeParsedAccount(account)));
      }
    );
  }

  getTokenAccountsByOwner(
    owner: string,
    programId: string,
    commitment: SolanaRpcCommitment = 'confirmed'
  ): Promise<SolanaTokenAccountEntry[]> {
    const params = [
      normalizePubkey(owner, 'invalid_address'),
      { programId: normalizePubkey(programId, 'invalid_program_id') },
      { commitment: normalizeCommitment(commitment), encoding: 'jsonParsed' },
    ];
    const normalizeResult = (value: unknown): SolanaTokenAccountEntry[] => {
      if (!isRecord(value) || !Array.isArray(value.value)) throw new SolanaRpcError('invalid_token_accounts_response');

      return value.value.map((entry) => {
        if (!isRecord(entry)) throw new SolanaRpcError('invalid_token_accounts_response');

        return {
          account: normalizeParsedAccount(entry.account),
          pubkey: normalizePubkey(entry.pubkey, 'invalid_token_accounts_response'),
        };
      });
    };
    // Token accounts get their own failover, so the node that serves them (Solana Vibe Station's public node, which
    // throttles) does not become the first node asked for everything else, and a node that refused them lately
    // (PublicNode answers 403 after about three seconds) is asked last.
    const endpoints = new EndpointFailover(askTokenAccountRefusersLast(this.endpoints.endpoints), this.failoverOptions);

    return this.runWithFailover(endpoints, (rpcUrl) =>
      this.requestOnce(rpcUrl, 'getTokenAccountsByOwner', params, normalizeResult).catch((error: unknown) => {
        if (isEndpointRefusalError(error)) tokenAccountRefusals.set(rpcUrl, Date.now());

        throw error;
      })
    );
  }

  getSignatureStatuses(signatures: string[]): Promise<Array<SolanaSignatureStatus | null>> {
    if (!Array.isArray(signatures) || signatures.length === 0 || signatures.length > 256) {
      throw new SolanaRpcError('invalid_signatures');
    }

    return this.request(
      'getSignatureStatuses',
      [signatures.map((signature) => normalizeSignature(signature)), { searchTransactionHistory: true }],
      (value) => {
        if (!isRecord(value) || !Array.isArray(value.value) || value.value.length !== signatures.length) {
          throw new SolanaRpcError('invalid_signature_status_response');
        }

        return value.value.map((status) => (status === null ? null : normalizeSignatureStatus(status)));
      }
    );
  }

  /**
   * What the cluster can prove about signed transactions whose broadcast outcome is unknown, one verdict per query.
   *
   * Each endpoint is asked on its own and its answers are never mixed with another's: a node that lags, or sits behind
   * a load balancer of mixed freshness, can find no trace of a transaction that another node already has. An endpoint
   * proves a transaction expired only after reporting that it has finalized past the transaction's last valid block
   * height and then, from a state at least as recent as that, finding no trace of the signature. A confirmed status on
   * any endpoint means the transaction landed. A trace that is not confirmed yet, or an endpoint that has not
   * finalized that far, keeps it pending whatever the others say. Fails only when no endpoint answered.
   */
  async resolveSignatures(queries: readonly SolanaSignatureQuery[]): Promise<SolanaSignatureResolution[]> {
    if (!Array.isArray(queries) || queries.length === 0 || queries.length > 256) {
      throw new SolanaRpcError('invalid_signatures');
    }

    const signatures = queries.map(({ signature }) => normalizeSignature(signature));
    const lastValidHeights = queries.map(({ lastValidBlockHeight }) =>
      requireSafeInteger(lastValidBlockHeight, 'invalid_block_height')
    );
    // Every endpoint is asked at once, so a node that hangs costs one timeout, not one in turn.
    const answers = await Promise.all(
      this.endpoints.endpoints.map(async (rpcUrl) => {
        try {
          // Asked in this order, so the lookup is at least as recent as the progress it is judged against.
          const finalized = await this.requestOnce(
            rpcUrl,
            'getEpochInfo',
            [{ commitment: 'finalized' }],
            normalizeFinalizedProgress
          );
          const observed = await this.requestOnce(
            rpcUrl,
            'getSignatureStatuses',
            [signatures, { searchTransactionHistory: true }],
            (value) => normalizeSignatureStatusesWithContext(value, signatures.length)
          );

          return { finalized, observed, rpcUrl };
        } catch (error) {
          return { error };
        }
      })
    );
    const verdicts: Array<SolanaEndpointVerdict | undefined> = queries.map(() => undefined);
    const provingHosts = queries.map(() => new Set<string>());
    let lastError: unknown;

    for (const answer of answers) {
      if ('error' in answer) {
        lastError = answer.error;

        continue;
      }

      verdicts.forEach((previous, index) => {
        const next = judgeSignature(
          answer.observed.statuses[index],
          lastValidHeights[index],
          answer.finalized,
          answer.observed.slot
        );

        if (next.state === 'expired') provingHosts[index].add(endpointHost(answer.rpcUrl));
        verdicts[index] =
          previous === undefined || VERDICT_STRENGTH[next.state] > VERDICT_STRENGTH[previous.state] ? next : previous;
      });
    }

    if (verdicts.some((verdict) => verdict === undefined)) {
      throw lastError instanceof SolanaRpcError ? lastError : new SolanaRpcError('solana_rpc_unavailable');
    }

    return (verdicts as SolanaEndpointVerdict[]).map((verdict, index) =>
      verdict.state === 'expired' ? { provingHosts: provingHosts[index].size, state: 'expired' } : verdict
    );
  }

  getRecentPrioritizationFees(writableAccounts: string[] = []): Promise<SolanaPrioritizationFee[]> {
    if (!Array.isArray(writableAccounts) || writableAccounts.length > 128) {
      throw new SolanaRpcError('invalid_accounts');
    }

    return this.request(
      'getRecentPrioritizationFees',
      [writableAccounts.map((address) => normalizePubkey(address, 'invalid_address'))],
      (value) => {
        if (!Array.isArray(value)) throw new SolanaRpcError('invalid_prioritization_fees_response');

        return value.map((entry) => {
          if (!isRecord(entry)) throw new SolanaRpcError('invalid_prioritization_fees_response');

          return {
            prioritizationFee: requireSafeInteger(entry.prioritizationFee, 'invalid_prioritization_fees_response'),
            slot: requireSafeInteger(entry.slot, 'invalid_prioritization_fees_response'),
          };
        });
      }
    );
  }

  getLatestBlockhash(commitment: SolanaRpcCommitment = 'confirmed'): Promise<SolanaLatestBlockhashResponse> {
    return this.request('getLatestBlockhash', [{ commitment: normalizeCommitment(commitment) }], normalizeLatestBlockhashResponse);
  }

  getFeeForMessage(
    messageBase64: string,
    commitment: SolanaRpcCommitment = 'confirmed'
  ): Promise<SolanaFeeForMessageResponse> {
    return this.request(
      'getFeeForMessage',
      [
        normalizeTransactionBase64(messageBase64),
        {
          commitment: normalizeCommitment(commitment),
        },
      ],
      normalizeFeeForMessageResponse
    );
  }

  getMinimumBalanceForRentExemption(dataLength: number, commitment: SolanaRpcCommitment = 'confirmed'): Promise<number> {
    return this.request(
      'getMinimumBalanceForRentExemption',
      [
        normalizeDataLength(dataLength),
        {
          commitment: normalizeCommitment(commitment),
        },
      ],
      (value) => requireSafeInteger(value, 'invalid_rent_response')
    );
  }

  simulateTransaction(
    transactionBase64: string,
    {
      commitment = 'confirmed',
      replaceRecentBlockhash = true,
      sigVerify = false,
    }: SolanaSimulationOptions = {}
  ): Promise<SolanaSimulationResponse> {
    if (sigVerify && replaceRecentBlockhash) throw new SolanaRpcError('invalid_simulation_options');

    return this.request(
      'simulateTransaction',
      [
        normalizeTransactionBase64(transactionBase64),
        {
          commitment: normalizeCommitment(commitment),
          encoding: 'base64',
          replaceRecentBlockhash,
          sigVerify,
        },
      ],
      normalizeSimulationResponse
    );
  }

  /**
   * Posts the signed transaction to each endpoint in turn, once, until one
   * accepts it. Sending the identical signed bytes again is idempotent, but a
   * node that timed out may already have relayed them: every later post skips
   * preflight, where a lagging node would answer "Blockhash not found" or
   * "already processed", and a later refusal is reported as ambiguous, never as
   * "nothing was sent". "Already processed" always means the transaction is out
   * there. Fails with a `SolanaBroadcastError`.
   */
  async sendRawTransaction(
    transactionBase64: string,
    {
      maxRetries,
      minContextSlot,
      preflightCommitment = 'confirmed',
      skipPreflight = false,
    }: SolanaBroadcastOptions = {},
    assertCurrent?: () => void
  ): Promise<string> {
    const options: Record<string, unknown> = {
      encoding: 'base64',
      preflightCommitment: normalizeCommitment(preflightCommitment),
      skipPreflight,
    };

    if (maxRetries !== undefined) {
      if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 10) {
        throw new SolanaRpcError('invalid_max_retries');
      }
      options.maxRetries = maxRetries;
    }
    if (minContextSlot !== undefined) {
      options.minContextSlot = requireSafeInteger(minContextSlot, 'invalid_min_context_slot');
    }

    const transaction = normalizeTransactionBase64(transactionBase64);
    let ambiguous = false;
    let lastError: unknown;

    for (const rpcUrl of this.endpoints.endpoints) {
      assertCurrent?.();
      try {
        return await this.requestOnce(
          rpcUrl,
          'sendTransaction',
          [transaction, ambiguous ? { ...options, skipPreflight: true } : options],
          normalizeSignature
        );
      } catch (error) {
        lastError = error;

        if (isAlreadyProcessed(error)) {
          const signature = firstSignatureOf(transaction);

          if (signature) return signature;
        }
        if (isAlreadyProcessed(error) || mayHaveReachedNode(error)) {
          ambiguous = true;
          continue;
        }
        // A node that is behind, or an endpoint that refuses this client,
        // refuses before relaying; another may take it.
        if (isRetryableRpcError(error)) continue;

        break;
      }
    }

    throw new SolanaBroadcastError(
      ambiguous ? 'solana_broadcast_ambiguous' : 'solana_broadcast_rejected',
      ambiguous,
      lastError
    );
  }

  /**
   * Asks the endpoint which cluster it serves, at most once per few minutes, and refuses it when that is not the
   * expected one. A node that cannot say is treated as unavailable rather than trusted.
   */
  private assertEndpointCluster(rpcUrl: string): Promise<void> {
    const expected = this.expectedGenesisHash;

    if (expected === undefined) return Promise.resolve();

    const key = `${expected}|${rpcUrl}`;
    const verifiedAt = verifiedClusters.get(key);

    if (verifiedAt !== undefined && Date.now() - verifiedAt < CLUSTER_RECHECK_MS) return Promise.resolve();

    const inFlight = clusterChecks.get(key);

    if (inFlight) return inFlight;

    const check = this.requestOnce(rpcUrl, 'getGenesisHash', [], (value) => normalizePubkey(value, 'invalid_genesis_response'))
      .catch((error: unknown) => {
        throw new SolanaClusterCheckError('solana_cluster_unverified', error);
      })
      .then((genesisHash) => {
        if (genesisHash !== expected) throw new SolanaClusterCheckError('solana_cluster_mismatch');

        verifiedClusters.set(key, Date.now());
      })
      .finally(() => clusterChecks.delete(key));

    clusterChecks.set(key, check);

    return check;
  }

  private request<T>(
    method: string,
    params: unknown[],
    normalizeResult: (value: unknown) => T
  ): Promise<T> {
    return this.runWithFailover(this.endpoints, (rpcUrl) => this.requestOnce(rpcUrl, method, params, normalizeResult));
  }

  private async runWithFailover<T>(endpoints: EndpointFailover, attempt: (rpcUrl: string) => Promise<T>): Promise<T> {
    return endpoints
      .run(attempt, {
        isRetryable: isRetryableRpcError,
        retryAfterMs: (error) => (error instanceof SolanaRpcError ? error.retryAfterMs : undefined),
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'EndpointFailoverError') {
          const lastError = (error as Error & { lastError?: unknown }).lastError;

          throw lastError instanceof SolanaRpcError ? lastError : new SolanaRpcError('solana_rpc_unavailable');
        }

        throw error;
      });
  }

  private async requestOnce<T>(
    rpcUrl: string,
    method: string,
    params: unknown[],
    normalizeResult: (value: unknown) => T
  ): Promise<T> {
    if (method !== 'getGenesisHash') await this.assertEndpointCluster(rpcUrl);

    const id = this.nextId++;
    const response = await withTimeout(
      this.fetchFn(rpcUrl, {
        body: JSON.stringify({
          id,
          jsonrpc: '2.0',
          method,
          params,
        }),
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        method: 'POST',
      }),
      this.requestTimeoutMs,
      () => new SolanaRpcError('solana_rpc_timeout')
    );
    if (!response.ok) {
      throw new SolanaRpcError(
        `solana_rpc_http_${response.status}`,
        response.status,
        await readJson(response).catch(() => undefined),
        parseRetryAfterMs(response.headers.get('retry-after'))
      );
    }

    const body = await readJson(response);
    if (!isRecord(body) || body.jsonrpc !== '2.0' || body.id !== id) throw new SolanaRpcError('invalid_rpc_response');
    if (body.error !== undefined) throw new SolanaRpcError('solana_rpc_error', response.status, normalizeRpcError(body.error));
    if (!('result' in body)) throw new SolanaRpcError('invalid_rpc_response');

    return normalizeResult(body.result);
  }
}

// Landed settles the question, a trace that is not confirmed (or an endpoint that has not caught up) keeps it open, and
// an endpoint's proof of expiry stands only when no endpoint disagrees.
const VERDICT_STRENGTH: Readonly<Record<SolanaEndpointVerdict['state'], number>> = Object.freeze({
  expired: 0,
  pending: 1,
  landed: 2,
});

/**
 * Only a supermajority-confirmed status is an outcome; a `processed` one can
 * still be rolled back with its fork. Nodes report a rooted transaction with
 * `confirmations: null`.
 */
const isConfirmedSolanaStatus = ({
  confirmationStatus,
  confirmations,
}: Pick<SolanaSignatureStatus, 'confirmationStatus' | 'confirmations'>): boolean =>
  confirmationStatus === 'confirmed' ||
  confirmationStatus === 'finalized' ||
  (confirmationStatus === null && confirmations === null);

function judgeSignature(
  status: SolanaSignatureStatus | null,
  lastValidBlockHeight: number,
  finalized: { blockHeight: number; slot: number },
  lookupSlot: number
): SolanaEndpointVerdict {
  if (status) return isConfirmedSolanaStatus(status) ? { state: 'landed', status } : { state: 'pending' };

  // No trace proves nothing until the endpoint has finalized past the last valid block, and then only if the lookup
  // came from a state that includes everything it had finalized.
  return finalized.blockHeight > lastValidBlockHeight && lookupSlot >= finalized.slot ? { state: 'expired' } : { state: 'pending' };
}

// Two spellings of one host (case, a trailing dot, another path or key) are one operator's answer, not two proofs.
function endpointHost(rpcUrl: string): string {
  try {
    return new URL(rpcUrl).hostname.toLowerCase().replace(/\.$/u, '');
  } catch {
    return rpcUrl;
  }
}

const CLUSTER_RECHECK_MS = 5 * 60_000;
// Endpoints already proven to serve a cluster, shared by every client of this worker so one balance refresh does
// not ask each node for its identity again.
const verifiedClusters = new Map<string, number>();
const clusterChecks = new Map<string, Promise<void>>();

// Nodes that answered a token-account lookup (or the cluster check before it) with 401 or 403, and when. Every
// balance refresh builds a new client, so this is kept for the whole worker. Such a node is asked last for a while,
// never skipped.
const TOKEN_ACCOUNT_REFUSAL_MEMORY_MS = 10 * 60_000;
const tokenAccountRefusals = new Map<string, number>();

function askTokenAccountRefusersLast(rpcUrls: readonly string[], now = Date.now()): string[] {
  const refusedLately = (rpcUrl: string) => {
    const refusedAt = tokenAccountRefusals.get(rpcUrl);

    return refusedAt !== undefined && now - refusedAt < TOKEN_ACCOUNT_REFUSAL_MEMORY_MS;
  };

  return [...rpcUrls.filter((rpcUrl) => !refusedLately(rpcUrl)), ...rpcUrls.filter(refusedLately)];
}

function isEndpointRefusalError(error: unknown): boolean {
  return error instanceof SolanaRpcError && (error.status === 401 || error.status === 403);
}

// Preflight answers -32002 with `AlreadyProcessed` when the node already has
// this exact transaction.
function isAlreadyProcessed(error: unknown): boolean {
  if (!(error instanceof SolanaRpcError) || error.message !== 'solana_rpc_error') return false;

  const { data, message } = (error.body ?? {}) as Partial<SolanaJsonRpcErrorPayload>;

  return (isRecord(data) && data.err === 'AlreadyProcessed') || /already been processed/iu.test(message ?? '');
}

// A failed post the node may still have acted on. A refused request (400, 401, 403, ...) and a JSON-RPC error that
// only a node gives before relaying are answers given before relaying; any other JSON-RPC error is not.
function mayHaveReachedNode(error: unknown): boolean {
  if (!(error instanceof SolanaRpcError)) return true;
  // Raised before the transaction was posted to that endpoint.
  if (error instanceof SolanaClusterCheckError) return false;
  if (error.message === 'solana_rpc_error') {
    const code = (error.body as Partial<SolanaJsonRpcErrorPayload> | undefined)?.code;

    return code === undefined || !PRE_RELAY_RPC_ERROR_CODES.has(code);
  }
  if (error.message.startsWith('solana_rpc_http_')) return isRetryableHttpStatus(error.status);

  return true;
}

// The transaction id is its first signature.
function firstSignatureOf(transactionBase64: string): string | undefined {
  try {
    const { signaturesOffset } = parseSolanaSerializedTransaction(transactionBase64);
    const bytes = Uint8Array.from(atob(transactionBase64), (char) => char.charCodeAt(0));

    return base58Encode(bytes.slice(signaturesOffset, signaturesOffset + 64));
  } catch {
    return undefined;
  }
}

// A JSON-RPC node answers a call, errors included, in a 200 body. A 4xx is the
// endpoint refusing this client before the call reaches a node: a key, a paid
// plan or an allowed origin is required. The public mainnet node answers 403 to
// every request that carries an Origin header, as an extension's requests do,
// and free plans answer 400 or 401. Another endpoint may serve the call.
function isEndpointRefusal(status: number | undefined): boolean {
  return status !== undefined && status >= 400 && status < 500;
}

function isRetryableRpcError(error: unknown): boolean {
  if (!(error instanceof SolanaRpcError)) return true;
  if (error instanceof SolanaClusterCheckError) return true;
  if (error.message === 'solana_rpc_error') {
    const code = (error.body as SolanaJsonRpcErrorPayload | undefined)?.code;

    return code !== undefined && RETRYABLE_RPC_ERROR_CODES.has(code);
  }
  if (error.message === 'invalid_json' || error.message === 'solana_rpc_timeout') return true;

  return (
    error.message.startsWith('solana_rpc_http_') &&
    (isRetryableHttpStatus(error.status) || isEndpointRefusal(error.status))
  );
}

function normalizePubkey(value: unknown, errorCode: string): string {
  if (typeof value !== 'string' || !BASE58_PUBKEY.test(value)) throw new SolanaRpcError(errorCode);

  return value;
}

function normalizeParsedAccount(value: unknown): SolanaParsedAccount {
  if (!isRecord(value) || typeof value.executable !== 'boolean') throw new SolanaRpcError('invalid_account_response');

  return {
    data: value.data,
    executable: value.executable,
    lamports: requireSafeInteger(value.lamports, 'invalid_account_response'),
    owner: normalizePubkey(value.owner, 'invalid_account_response'),
    space: optionalSafeInteger(value.space, 'invalid_account_response'),
  };
}

function normalizeSignatureStatus(value: unknown): SolanaSignatureStatus {
  // `confirmations: null` is how a node reports a rooted transaction, so the field must be there: a status that omits
  // it would otherwise read as rooted.
  if (!isRecord(value) || !('confirmations' in value) || !('err' in value)) {
    throw new SolanaRpcError('invalid_signature_status_response');
  }

  const confirmationStatus = value.confirmationStatus;

  return {
    confirmationStatus:
      confirmationStatus === 'processed' || confirmationStatus === 'confirmed' || confirmationStatus === 'finalized'
        ? confirmationStatus
        : null,
    confirmations: value.confirmations === null ? null : optionalSafeInteger(value.confirmations, 'invalid_signature_status_response') ?? null,
    err: value.err ?? null,
    slot: requireSafeInteger(value.slot, 'invalid_signature_status_response'),
  };
}

function normalizeSignatureStatusesWithContext(
  value: unknown,
  count: number
): { slot: number; statuses: Array<SolanaSignatureStatus | null> } {
  if (!isRecord(value) || !Array.isArray(value.value) || value.value.length !== count) {
    throw new SolanaRpcError('invalid_signature_status_response');
  }

  return {
    slot: normalizeContext(value.context, 'invalid_signature_status_response').slot,
    statuses: value.value.map((status) => (status === null ? null : normalizeSignatureStatus(status))),
  };
}

function normalizeFinalizedProgress(value: unknown): { blockHeight: number; slot: number } {
  if (!isRecord(value)) throw new SolanaRpcError('invalid_epoch_info_response');

  return {
    blockHeight: requireSafeInteger(value.blockHeight, 'invalid_epoch_info_response'),
    slot: requireSafeInteger(value.absoluteSlot, 'invalid_epoch_info_response'),
  };
}

function normalizeRpcUrl(rpcUrl: string): string {
  const url = new URL(rpcUrl);

  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new SolanaRpcError('invalid_rpc_url');
  }

  // A provider's key may sit in the query string, so only the fragment is dropped, and trailing slashes are trimmed
  // only from an address that has no query (a slash there can belong to the key).
  url.hash = '';

  return url.search === '' ? url.toString().replace(/\/+$/, '') : url.toString();
}

function normalizeNetwork(network: SolanaRpcNetwork): SolanaRpcNetwork {
  if (network !== 'mainnet' && network !== 'devnet') throw new SolanaRpcError('invalid_network');

  return network;
}

function normalizeCommitment(commitment: SolanaRpcCommitment): SolanaRpcCommitment {
  if (commitment !== 'processed' && commitment !== 'confirmed' && commitment !== 'finalized') {
    throw new SolanaRpcError('invalid_commitment');
  }

  return commitment;
}

function normalizeTransactionBase64(transactionBase64: string): string {
  if (
    typeof transactionBase64 !== 'string' ||
    transactionBase64.length === 0 ||
    transactionBase64.length > 1_000_000 ||
    transactionBase64.length % 4 !== 0 ||
    !BASE64.test(transactionBase64)
  ) {
    throw new SolanaRpcError('invalid_transaction');
  }

  return transactionBase64;
}

function normalizeLatestBlockhashResponse(value: unknown): SolanaLatestBlockhashResponse {
  if (!isRecord(value)) throw new SolanaRpcError('invalid_blockhash_response');

  return {
    context: normalizeContext(value.context, 'invalid_blockhash_response'),
    value: normalizeLatestBlockhash(value.value, 'invalid_blockhash_response'),
  };
}

function normalizeFeeForMessageResponse(value: unknown): SolanaFeeForMessageResponse {
  if (!isRecord(value)) throw new SolanaRpcError('invalid_fee_response');

  return {
    context: normalizeContext(value.context, 'invalid_fee_response'),
    value: value.value === null ? null : requireSafeInteger(value.value, 'invalid_fee_response'),
  };
}

function normalizeSimulationResponse(value: unknown): SolanaSimulationResponse {
  if (!isRecord(value)) throw new SolanaRpcError('invalid_simulation_response');
  if (!isRecord(value.value)) throw new SolanaRpcError('invalid_simulation_response');

  const logs = value.value.logs;
  if (logs !== null && (!Array.isArray(logs) || logs.some((entry) => typeof entry !== 'string'))) {
    throw new SolanaRpcError('invalid_simulation_response');
  }
  const normalizedLogs = logs as string[] | null;

  return {
    context: normalizeContext(value.context, 'invalid_simulation_response'),
    value: {
      accounts: value.value.accounts,
      err: value.value.err ?? null,
      logs: normalizedLogs,
      // Nodes send `null` when the blockhash was not replaced.
      replacementBlockhash: value.value.replacementBlockhash == null
        ? undefined
        : normalizeLatestBlockhash(value.value.replacementBlockhash, 'invalid_simulation_response'),
      returnData: value.value.returnData,
      unitsConsumed: optionalSafeInteger(value.value.unitsConsumed, 'invalid_simulation_response'),
    },
  };
}

function normalizeLatestBlockhash(value: unknown, errorCode: string): SolanaLatestBlockhash {
  if (!isRecord(value)) throw new SolanaRpcError(errorCode);

  return {
    blockhash: normalizeBase58(value.blockhash, errorCode),
    lastValidBlockHeight: requireSafeInteger(value.lastValidBlockHeight, errorCode),
  };
}

function normalizeContext(value: unknown, errorCode: string): SolanaRpcContext {
  if (!isRecord(value)) throw new SolanaRpcError(errorCode);

  return {
    apiVersion: optionalString(value.apiVersion, errorCode),
    slot: requireSafeInteger(value.slot, errorCode),
  };
}

function normalizeSignature(value: unknown): string {
  if (typeof value !== 'string' || !BASE58_SIGNATURE.test(value)) {
    throw new SolanaRpcError('invalid_signature_response');
  }

  return value;
}

function normalizeBase58(value: unknown, errorCode: string): string {
  if (typeof value !== 'string' || !BASE58_32_TO_64.test(value)) throw new SolanaRpcError(errorCode);

  return value;
}

function normalizeDataLength(dataLength: number): number {
  if (!Number.isInteger(dataLength) || dataLength < 0 || dataLength > 10_000_000) {
    throw new SolanaRpcError('invalid_data_length');
  }

  return dataLength;
}

function normalizeRpcError(value: unknown): SolanaJsonRpcErrorPayload {
  if (!isRecord(value)) return { code: -1, message: 'Unknown Solana RPC error' };

  return {
    code: typeof value.code === 'number' && Number.isFinite(value.code) ? value.code : -1,
    data: value.data,
    message: typeof value.message === 'string' ? value.message : 'Unknown Solana RPC error',
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new SolanaRpcError('invalid_json', response.status, text);
  }
}

function requireSafeInteger(value: unknown, errorCode: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new SolanaRpcError(errorCode);

  return value as number;
}

function optionalSafeInteger(value: unknown, errorCode: string): number | undefined {
  if (value === undefined || value === null) return undefined;

  return requireSafeInteger(value, errorCode);
}

function optionalString(value: unknown, errorCode: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new SolanaRpcError(errorCode);

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BASE58_PUBKEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BASE58_32_TO_64 = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const BASE58_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;

export {
  SOLANA_GENESIS_HASHES,
  SolanaBroadcastError,
  SolanaClusterCheckError,
  SolanaRpcClient,
  SolanaRpcError,
  createClusterBoundSolanaRpcClient,
  isConfirmedSolanaStatus,
  type SolanaBroadcastOptions,
  type SolanaFeeForMessageResponse,
  type SolanaJsonRpcErrorPayload,
  type SolanaLatestBlockhash,
  type SolanaLatestBlockhashResponse,
  type SolanaParsedAccount,
  type SolanaPrioritizationFee,
  type SolanaRpcCommitment,
  type SolanaRpcContext,
  type SolanaRpcNetwork,
  type SolanaSimulationOptions,
  type SolanaSimulationResponse,
  type SolanaSimulationValue,
  type SolanaSignatureQuery,
  type SolanaSignatureResolution,
  type SolanaSignatureStatus,
  type SolanaTokenAccountEntry,
};
