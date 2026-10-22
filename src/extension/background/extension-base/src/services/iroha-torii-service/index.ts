import { UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';
import { parseIrohaI105Address } from '@/util/iroha';

// Direct Torii REST client for wallet reads and transaction submission.

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_SUBMIT_WAIT_TIMEOUT_MS = 90_000;
const DEFAULT_SUBMIT_WAIT_POLL_INTERVAL_MS = 500;
const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_SIGNED_TRANSACTION_BYTES = 1_048_576 + 4_096;
const MAX_PAGE_LIMIT = 100;
const MAX_CURSOR_LENGTH = 4_096;
const MAX_FILTER_LENGTH = 2_048;
const NETWORK_ID_LITERAL = /^hash:[0-9A-F]{63}[13579BDF]#[0-9A-F]{4}$/u;

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };
type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type IrohaNetworkKey = keyof typeof UNIVERSAL_WALLET_IROHA_NETWORKS;

type IrohaToriiRuntimeHeaders = Partial<{
  authorization: string;
  'x-api-token': string;
}>;

type IrohaToriiClientOptions = {
  baseUrl?: string | null;
  fetchFn?: FetchLike;
  headers?: IrohaToriiRuntimeHeaders;
  maxResponseBytes?: number;
  network?: IrohaNetworkKey;
  timeoutMs?: number;
};

type IrohaToriiPageOptions = {
  cursor?: string;
  // Torii's text filter syntax, e.g. `asset_definition_id = "…" and type = "TRANSFER"`.
  filter?: string;
  limit?: number;
};

type IrohaToriiPage<TItem> = {
  items: TItem[];
  next_cursor: string | null;
};

type IrohaToriiRouteResponse<TBody = JsonValue> = {
  status: number;
  headers: Record<string, string>;
  contentType: string | null;
  body: TBody;
};

type IrohaToriiTransactionStatusScope = 'local' | 'global';

type IrohaTransactionStatusKind = 'Queued' | 'Approved' | 'Committed' | 'Applied' | 'Rejected' | 'Expired';

type IrohaTransactionStatusBody = {
  hash: string;
  scope: IrohaToriiTransactionStatusScope;
  resolved_from: string;
  status: {
    kind: IrohaTransactionStatusKind | string;
    block_height?: number;
    [key: string]: JsonValue | undefined;
  };
  [key: string]: JsonValue | undefined;
};

type IrohaSubmissionReceipt = {
  payload?: {
    entrypoint_hash?: string;
    signed_transaction_hash?: string;
    submitted_at_height?: number;
    submitted_at_ms?: number;
  };
};

type IrohaSubmitAndWaitOptions = {
  pollIntervalMs?: number;
  timeoutMs?: number;
};

type IrohaSubmitAndWaitResult = {
  hash: string;
  blockHeight: number | null;
  status: IrohaTransactionStatusBody;
};

class IrohaToriiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown,
    readonly code?: string
  ) {
    super(message);
    this.name = 'IrohaToriiError';
  }
}

// The transaction may or may not have reached the ledger. Callers must not sign a
// replacement until the original hash resolves.
class IrohaTransactionStatusUnknownError extends Error {
  constructor(readonly transactionHash: string) {
    super(`Transaction status is unknown after a timeout. Check transaction ${transactionHash} before retrying.`);
    this.name = 'IrohaTransactionStatusUnknownError';
  }
}

class IrohaTransactionRejectedError extends Error {
  constructor(
    readonly transactionHash: string,
    readonly kind: string,
    readonly reason?: string
  ) {
    super(`Transaction ${transactionHash} was ${kind.toLowerCase()}${reason ? `: ${reason}` : ''}.`);
    this.name = 'IrohaTransactionRejectedError';
  }
}

class IrohaToriiWalletClient {
  readonly network: IrohaNetworkKey;
  private readonly baseUrl: string;
  private readonly defaultHeaders: IrohaToriiRuntimeHeaders;
  private readonly fetchFn: FetchLike;
  private readonly maxResponseBytes: number;
  private readonly timeoutMs: number;

  constructor(options: IrohaToriiClientOptions = {}) {
    this.network = options.network ?? 'taira';
    this.baseUrl = normalizeToriiBaseUrl(options.baseUrl ?? UNIVERSAL_WALLET_IROHA_NETWORKS[this.network].toriiBaseUrl);
    this.defaultHeaders = normalizeRuntimeHeaders(options.headers ?? {});
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.maxResponseBytes = normalizeInteger(
      options.maxResponseBytes ?? MAX_RESPONSE_BYTES,
      'invalid_max_response_bytes',
      1,
      MAX_RESPONSE_BYTES
    );
    this.timeoutMs = normalizeInteger(options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS, 'invalid_timeout', 1, 300_000);
  }

  async getAccountAssets<TItem = JsonObject>(
    accountId: string,
    options: IrohaToriiPageOptions = {}
  ): Promise<IrohaToriiRouteResponse<IrohaToriiPage<TItem>>> {
    const account = encodeURIComponent(normalizeIrohaAccountId(accountId, this.network));

    return this.getPage<TItem>(`/v1/accounts/${account}/assets`, options);
  }

  async getAccountHistory<TItem = JsonObject>(
    accountId: string,
    options: IrohaToriiPageOptions = {}
  ): Promise<IrohaToriiRouteResponse<IrohaToriiPage<TItem>>> {
    const account = encodeURIComponent(normalizeIrohaAccountId(accountId, this.network));

    return this.getPage<TItem>(`/v1/accounts/${account}/history`, options);
  }

  async getAssetDefinitions<TItem = JsonObject>(
    options: IrohaToriiPageOptions = {}
  ): Promise<IrohaToriiRouteResponse<IrohaToriiPage<TItem>>> {
    return this.getPage<TItem>('/v1/assets/definitions', options);
  }

  async getAssetDefinition<TBody = JsonValue>(assetId: string): Promise<IrohaToriiRouteResponse<TBody>> {
    const id = encodeURIComponent(normalizeAssetDefinitionId(assetId, this.network));

    return this.getJson<TBody>(`/v1/assets/definitions/${id}`);
  }

  async getNodeCapabilities<TBody = JsonValue>(): Promise<IrohaToriiRouteResponse<TBody>> {
    return this.getJson<TBody>('/v1/node/capabilities');
  }

  async getParameters<TBody = JsonValue>(): Promise<IrohaToriiRouteResponse<TBody>> {
    return this.getJson<TBody>('/v1/parameters');
  }

  // The network identity is the hash of the genesis block header.
  async getNetworkId(): Promise<string> {
    const { body } = await this.getJson<unknown>('/v1/explorer/blocks/1');

    if (
      !isRecord(body) ||
      body.height !== 1 ||
      body.prev_block_hash !== null ||
      typeof body.hash !== 'string' ||
      !NETWORK_ID_LITERAL.test(body.hash)
    ) {
      throw new IrohaToriiError('invalid_iroha_genesis_block', undefined, body);
    }

    return body.hash;
  }

  async getTransactionStatus(
    hash: string,
    scope: IrohaToriiTransactionStatusScope = 'global'
  ): Promise<IrohaTransactionStatusBody | null> {
    const normalizedHash = normalizeTransactionHash(hash);
    const { response, body } = await this.request(
      'GET',
      `/v1/pipeline/transactions/status?hash=${normalizedHash}&scope=${normalizeStatusScope(scope)}`,
      { accept: 'application/json' }
    );

    if (response.status === 404 && isToriiErrorCode(body, 'pipeline_transaction_status_not_found')) return null;
    assertOk(response, body);
    requireJsonResponseMediaType(response, body);

    return normalizeTransactionStatus(body, normalizedHash);
  }

  async submitTransaction(signedTransaction: ArrayBuffer | ArrayBufferView, expectedHash: string): Promise<void> {
    const hash = normalizeTransactionHash(expectedHash);
    const payload = normalizeSignedTransaction(signedTransaction);
    const { response, body } = await this.request(
      'POST',
      '/v1/pipeline/transactions',
      { accept: 'application/json', 'content-type': 'application/x-norito' },
      payload
    );

    // Resubmitting the same signed bytes is idempotent.
    if (
      response.status === 409 &&
      (isToriiErrorCode(body, 'already_committed') || isToriiErrorCode(body, 'already_enqueued'))
    ) {
      return;
    }
    assertOk(response, body);

    const receipt = body as IrohaSubmissionReceipt | null;
    const receiptHash = receipt?.payload?.signed_transaction_hash ?? receipt?.payload?.entrypoint_hash;

    if (receiptHash !== undefined && hashLiteralToHex(receiptHash) !== hash) {
      throw new IrohaToriiError('iroha_transaction_receipt_mismatch', response.status, body);
    }
  }

  async waitForTransactionApplied(
    hash: string,
    options: IrohaSubmitAndWaitOptions = {}
  ): Promise<IrohaSubmitAndWaitResult> {
    const normalizedHash = normalizeTransactionHash(hash);
    const timeoutMs = normalizeInteger(
      options.timeoutMs ?? DEFAULT_SUBMIT_WAIT_TIMEOUT_MS,
      'invalid_timeout',
      1,
      600_000
    );
    const pollIntervalMs = normalizeInteger(
      options.pollIntervalMs ?? DEFAULT_SUBMIT_WAIT_POLL_INTERVAL_MS,
      'invalid_poll_interval',
      50,
      60_000
    );
    const deadline = Date.now() + timeoutMs;

    while (true) {
      // After submission a failed status read never means the transfer failed.
      const status = await this.getTransactionStatus(normalizedHash).catch(() => null);

      const kind = status?.status.kind;

      if (status && kind === 'Applied' && status.resolved_from === 'state') {
        const blockHeight = status.status.block_height;

        return {
          hash: normalizedHash,
          blockHeight: typeof blockHeight === 'number' && Number.isSafeInteger(blockHeight) ? blockHeight : null,
          status,
        };
      }
      if (status && (kind === 'Rejected' || kind === 'Expired')) {
        throw new IrohaTransactionRejectedError(normalizedHash, kind, extractRejectionReason(status));
      }
      if (Date.now() >= deadline) throw new IrohaTransactionStatusUnknownError(normalizedHash);

      await delay(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
    }
  }

  // Submits once, then waits for state-resolved finality. A submission whose request
  // outcome is unknown (timeout, dropped connection) is reconciled by status only.
  async submitTransactionAndWait(
    signedTransaction: ArrayBuffer | ArrayBufferView,
    expectedHash: string,
    options: IrohaSubmitAndWaitOptions = {}
  ): Promise<IrohaSubmitAndWaitResult> {
    const hash = normalizeTransactionHash(expectedHash);

    try {
      await this.submitTransaction(signedTransaction, hash);
    } catch (error) {
      if (!isAmbiguousSubmissionError(error)) throw error;
    }

    return this.waitForTransactionApplied(hash, options);
  }

  private async getPage<TItem>(
    path: string,
    { cursor, filter, limit = MAX_PAGE_LIMIT }: IrohaToriiPageOptions
  ): Promise<IrohaToriiRouteResponse<IrohaToriiPage<TItem>>> {
    const query = new URLSearchParams();

    query.set('limit', String(normalizeInteger(limit, 'invalid_limit', 1, MAX_PAGE_LIMIT)));
    if (cursor !== undefined) query.set('cursor', normalizeCursor(cursor));
    if (filter !== undefined) query.set('filter', normalizeFilter(filter));

    const response = await this.getJson<unknown>(`${path}?${query.toString()}`);
    const body = response.body;

    if (
      !isRecord(body) ||
      !Array.isArray(body.items) ||
      !(body.next_cursor === null || (typeof body.next_cursor === 'string' && isCursor(body.next_cursor)))
    ) {
      throw new IrohaToriiError('invalid_iroha_page_response', response.status, body);
    }

    return response as IrohaToriiRouteResponse<IrohaToriiPage<TItem>>;
  }

  private async getJson<TBody>(pathAndQuery: string): Promise<IrohaToriiRouteResponse<TBody>> {
    const { response, body } = await this.request('GET', pathAndQuery, { accept: 'application/json' });

    assertOk(response, body);
    requireJsonResponseMediaType(response, body);

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      contentType: response.headers.get('content-type'),
      body: body as TBody,
    };
  }

  private request(
    method: 'GET' | 'POST',
    pathAndQuery: string,
    contentHeaders: Record<string, string>,
    body?: Uint8Array
  ): Promise<{ response: Response; body: unknown }> {
    return requestJson(
      this.fetchFn,
      `${this.baseUrl}${pathAndQuery}`,
      {
        method,
        headers: { ...this.defaultHeaders, ...contentHeaders },
        ...(body ? { body: body as BodyInit } : {}),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      },
      this.timeoutMs,
      this.maxResponseBytes
    );
  }
}

function createIrohaToriiWalletClient(
  network: IrohaNetworkKey = 'taira',
  options: Omit<IrohaToriiClientOptions, 'network'> = {}
): IrohaToriiWalletClient {
  return new IrohaToriiWalletClient({ ...options, network });
}

function assertOk(response: Response, body: unknown): void {
  if (response.ok) return;

  const code = isRecord(body) && typeof body.code === 'string' ? body.code : undefined;
  const message = isRecord(body) && typeof body.message === 'string' ? body.message : undefined;

  throw new IrohaToriiError(message ?? `iroha_torii_http_${response.status}`, response.status, body, code);
}

function isToriiErrorCode(body: unknown, code: string): boolean {
  return isRecord(body) && body.code === code;
}

// Only failures where the request may still have reached Torii are ambiguous.
function isAmbiguousSubmissionError(error: unknown): boolean {
  if (!(error instanceof IrohaToriiError)) return false;

  return error.message === 'iroha_request_timeout' || error.message === 'iroha_network_error' ||
    error.status === 502 || error.status === 503 || error.status === 504;
}

function normalizeTransactionStatus(value: unknown, expectedHash: string): IrohaTransactionStatusBody {
  if (
    !isRecord(value) ||
    typeof value.hash !== 'string' ||
    value.hash.toLowerCase() !== expectedHash ||
    (value.scope !== 'global' && value.scope !== 'local') ||
    typeof value.resolved_from !== 'string' ||
    !isRecord(value.status) ||
    typeof value.status.kind !== 'string'
  ) {
    throw new IrohaToriiError('invalid_iroha_transaction_status', undefined, value);
  }

  return value as IrohaTransactionStatusBody;
}

function extractRejectionReason(status: IrohaTransactionStatusBody): string | undefined {
  for (const candidate of [status.status.reason, status.status.rejection_reason, status.rejection_reason]) {
    if (typeof candidate === 'string' && candidate) return candidate.slice(0, 500);
    if (isRecord(candidate)) return JSON.stringify(candidate).slice(0, 500);
  }

  return undefined;
}

function hashLiteralToHex(value: string): string {
  const match = /^hash:([0-9A-Fa-f]{64})#[0-9A-Fa-f]{4}$/u.exec(value);

  return (match ? match[1] : value).toLowerCase();
}

function requireJsonResponseMediaType(response: Response, body: unknown): void {
  const mediaType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();

  if (mediaType !== 'application/json') {
    throw new IrohaToriiError('invalid_json_content_type', response.status, body);
  }
  if (body instanceof NonJsonBody) throw new IrohaToriiError('invalid_json', response.status, body.text);
}

// A body that did not parse as JSON (gateway error pages, truncated replies). Kept so the
// HTTP status still decides how the failure is classified.
class NonJsonBody {
  constructor(readonly text: string) {}
}

function normalizeIrohaAccountId(accountId: string, network: IrohaNetworkKey): string {
  if (typeof accountId !== 'string' || !accountId.trim()) throw new IrohaToriiError('invalid_account_id');

  try {
    return parseIrohaI105Address(accountId, network).i105;
  } catch (error) {
    throw new IrohaToriiError('invalid_account_id', undefined, error);
  }
}

function normalizeAssetDefinitionId(value: unknown, network: IrohaNetworkKey): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value !== value.trim() ||
    value.length > 256 ||
    Array.from(value).some((char) => char.charCodeAt(0) <= 0x1f || char.charCodeAt(0) === 0x7f)
  ) {
    throw new IrohaToriiError('invalid_asset_id');
  }
  if (network === 'taira' && !/^[1-9A-HJ-NP-Za-km-z]{20,64}$/u.test(value)) {
    throw new IrohaToriiError('invalid_asset_id');
  }

  return value;
}

function normalizeTransactionHash(hash: unknown): string {
  if (typeof hash !== 'string' || !/^[0-9a-f]{63}[13579bdf]$/u.test(hash)) {
    throw new IrohaToriiError('invalid_hash');
  }

  return hash;
}

function normalizeStatusScope(scope: unknown): IrohaToriiTransactionStatusScope {
  if (scope === 'local' || scope === 'global') return scope;

  throw new IrohaToriiError('invalid_scope');
}

function normalizeSignedTransaction(payload: ArrayBuffer | ArrayBufferView): Uint8Array {
  const bytes = payload instanceof ArrayBuffer
    ? new Uint8Array(payload.slice(0))
    : ArrayBuffer.isView(payload)
      ? new Uint8Array(payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength))
      : undefined;

  if (!bytes || bytes.byteLength < 2 || bytes.byteLength > MAX_SIGNED_TRANSACTION_BYTES || bytes[0] !== 1) {
    throw new IrohaToriiError('invalid_signed_transaction');
  }

  return bytes;
}

function isCursor(value: string): boolean {
  return value.length > 0 && value.length <= MAX_CURSOR_LENGTH && /^[A-Za-z0-9_-]+$/u.test(value);
}

function normalizeCursor(value: unknown): string {
  if (typeof value !== 'string' || !isCursor(value)) throw new IrohaToriiError('invalid_cursor');

  return value;
}

function normalizeFilter(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > MAX_FILTER_LENGTH ||
    Array.from(value).some((char) => char.charCodeAt(0) <= 0x1f || char.charCodeAt(0) === 0x7f)
  ) {
    throw new IrohaToriiError('invalid_filter');
  }

  return value;
}

function normalizeRuntimeHeaders(headers: IrohaToriiRuntimeHeaders): Record<string, string> {
  const out: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    if (value == null) continue;

    const lower = name.toLowerCase();

    if (!ALLOWED_RUNTIME_HEADERS.has(lower)) throw new IrohaToriiError('invalid_header');
    out[lower] = value;
  }

  return out;
}

function normalizeToriiBaseUrl(baseUrl: string | null): string {
  if (!baseUrl) throw new IrohaToriiError('iroha_network_unavailable');

  let url: URL;

  try {
    url = new URL(baseUrl);
  } catch {
    throw new IrohaToriiError('invalid_base_url');
  }

  const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';

  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new IrohaToriiError('invalid_base_url');
  }

  // Older network records stored the MCP endpoint; Torii routes live at the origin root.
  url.pathname = url.pathname.replace(/\/+$/u, '').replace(/\/v1\/mcp$/u, '');

  return url.toString().replace(/\/+$/u, '');
}

function normalizeInteger(value: unknown, errorCode: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new IrohaToriiError(errorCode);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(
  fetchFn: FetchLike,
  input: string,
  init: RequestInit,
  timeoutMs: number,
  maxResponseBytes: number
): Promise<{ response: Response; body: unknown }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Enforced even if a fetch implementation ignores the abort signal.
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new IrohaToriiError('iroha_request_timeout'));
    }, timeoutMs);
  });

  try {
    let response: Response;

    try {
      response = await Promise.race([fetchFn(input, { ...init, redirect: 'error', signal: controller.signal }), timeout]);
    } catch (error) {
      if (error instanceof IrohaToriiError) throw error;
      if (controller.signal.aborted) throw new IrohaToriiError('iroha_request_timeout', undefined, error);

      throw new IrohaToriiError('iroha_network_error', undefined, error);
    }

    const body = await Promise.race([readResponseBody(response, maxResponseBytes), timeout]);

    return { response, body };
  } catch (error) {
    if (!(error instanceof IrohaToriiError) && controller.signal.aborted) {
      throw new IrohaToriiError('iroha_request_timeout', undefined, error);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readResponseBody(response: Response, maxResponseBytes: number): Promise<unknown> {
  const contentLength = response.headers.get('content-length');

  if (contentLength !== null && (!/^\d+$/u.test(contentLength) || Number(contentLength) > maxResponseBytes)) {
    throw new IrohaToriiError('iroha_response_too_large', response.status);
  }

  const bytes = await readBoundedResponseBytes(response, maxResponseBytes);
  let text: string;

  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new IrohaToriiError('invalid_json', response.status);
  }
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return new NonJsonBody(text.slice(0, 500));
  }
}

async function readBoundedResponseBytes(response: Response, maxResponseBytes: number): Promise<Uint8Array> {
  if (!response.body) {
    const bytes = new TextEncoder().encode(await response.text());

    if (bytes.byteLength > maxResponseBytes) throw new IrohaToriiError('iroha_response_too_large', response.status);

    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > maxResponseBytes) {
        await reader.cancel('iroha_response_too_large');
        throw new IrohaToriiError('iroha_response_too_large', response.status);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });

  return bytes;
}

const ALLOWED_RUNTIME_HEADERS = new Set(['authorization', 'x-api-token']);

export {
  IrohaToriiError,
  IrohaToriiWalletClient,
  IrohaTransactionRejectedError,
  IrohaTransactionStatusUnknownError,
  createIrohaToriiWalletClient,
  type IrohaSubmitAndWaitOptions,
  type IrohaSubmitAndWaitResult,
  type IrohaToriiClientOptions,
  type IrohaToriiPage,
  type IrohaToriiPageOptions,
  type IrohaToriiRouteResponse,
  type IrohaToriiRuntimeHeaders,
  type IrohaToriiTransactionStatusScope,
  type IrohaTransactionStatusBody,
};
