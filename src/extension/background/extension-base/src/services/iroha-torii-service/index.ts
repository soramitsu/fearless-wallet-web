import { UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';
import { parseIrohaI105Address } from '@/util/iroha';

const IROHA_MCP_PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_MCP_PATH = UNIVERSAL_WALLET_IROHA_NETWORKS.taira.mcpPath;
const MAX_BATCH_CALLS = 25;

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };
type JsonRpcId = string | number | null;
type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type IrohaNetworkKey = keyof typeof UNIVERSAL_WALLET_IROHA_NETWORKS;

type IrohaToriiRuntimeHeaders = Partial<{
  authorization: string;
  'x-api-token': string;
  'x-iroha-account': string;
  'x-iroha-signature': string;
  'x-iroha-api-version': string;
}>;

type IrohaToriiMcpClientOptions = {
  baseUrl?: string | null;
  endpointUrl?: string;
  fetchFn?: FetchLike;
  headers?: IrohaToriiRuntimeHeaders;
  requireIrohaToolPrefix?: boolean;
};

type IrohaToriiRequestOptions = {
  headers?: IrohaToriiRuntimeHeaders;
};

type IrohaToriiWalletReadOptions = IrohaToriiRequestOptions & {
  accept?: 'application/json';
};

type IrohaToriiAccountAssetsOptions = IrohaToriiWalletReadOptions & {
  assetId?: string;
  limit?: number;
  offset?: number;
  query?: JsonObject;
};

type IrohaToriiInstructionsListOptions = IrohaToriiWalletReadOptions & {
  account?: string;
  authority?: string;
  transactionHash?: string;
  transactionStatus?: 'committed' | 'rejected';
  block?: number;
  kind?: string;
  assetId?: string;
  page?: number;
  perPage?: number;
  query?: JsonObject;
};

type IrohaToriiDirectRequestOptions = IrohaToriiRequestOptions & {
  baseUrl?: string | null;
};

type IrohaToriiTransactionStatusScope = 'local' | 'auto' | 'global';

type IrohaToriiTransactionStatusOptions = IrohaToriiDirectRequestOptions & {
  scope?: IrohaToriiTransactionStatusScope;
};

type IrohaToriiSubmitTransactionOptions = IrohaToriiDirectRequestOptions & {
  accept?: 'application/json';
};

type IrohaMcpCapabilities = {
  protocolVersion: string;
  serverInfo: {
    name: string;
    version?: string;
  };
  capabilities: {
    tools: {
      count: number;
      listChanged: boolean;
      toolsetVersion: string;
    };
  };
};

type IrohaMcpToolDescriptor = {
  name: string;
  description?: string;
  inputSchema: JsonObject;
  outputSchema?: JsonObject;
};

type IrohaMcpToolsList = {
  tools: IrohaMcpToolDescriptor[];
  nextCursor: string | null;
  listChanged: boolean;
  toolsetVersion: string;
};

type IrohaMcpToolResult<TStructuredContent = JsonValue> = {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
  structuredContent: TStructuredContent;
};

type IrohaMcpBatchCall = {
  name: string;
  arguments?: JsonObject;
};

type IrohaMcpBatchResult<TStructuredContent = JsonValue> = {
  results: Array<{
    result?: IrohaMcpToolResult<TStructuredContent>;
    error?: JsonValue;
  }>;
};

type IrohaMcpAsyncJob = {
  job_id: string;
  status: 'pending';
};

type IrohaMcpJobState<TStructuredContent = JsonValue> = {
  job_id: string;
  state: {
    status: 'pending' | 'completed' | 'failed';
    result?: IrohaMcpToolResult<TStructuredContent>;
    error?: JsonValue;
  };
};

type IrohaToriiRouteStructuredContent<TBody = JsonValue> = {
  status: number;
  headers?: Record<string, string>;
  content_type?: string | null;
  body: TBody;
  error_code?: string;
};

type IrohaToriiRouteResponse<TBody = JsonValue> = {
  status: number;
  headers: Record<string, string>;
  contentType: string | null;
  body: TBody;
};

type JsonRpcResponse<T> = {
  jsonrpc?: '2.0';
  id?: JsonRpcId;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: JsonValue;
  };
};

class IrohaToriiMcpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown,
    readonly code?: number,
    readonly data?: unknown
  ) {
    super(message);
    this.name = 'IrohaToriiMcpError';
  }
}

class IrohaToriiMcpClient {
  readonly endpointUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly defaultHeaders: IrohaToriiRuntimeHeaders;
  private readonly requireIrohaToolPrefix: boolean;
  private nextRequestId = 1;

  constructor(options: IrohaToriiMcpClientOptions = {}) {
    const baseUrl = options.endpointUrl ?? options.baseUrl ?? UNIVERSAL_WALLET_IROHA_NETWORKS.taira.toriiBaseUrl;

    this.endpointUrl = normalizeMcpEndpoint(baseUrl);
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.defaultHeaders = options.headers ?? {};
    this.requireIrohaToolPrefix = options.requireIrohaToolPrefix ?? true;
  }

  getCapabilities(options: IrohaToriiRequestOptions = {}): Promise<IrohaMcpCapabilities> {
    return this.httpGet(options);
  }

  initialize(options: IrohaToriiRequestOptions = {}): Promise<IrohaMcpCapabilities> {
    return this.jsonRpc('initialize', {}, options);
  }

  async notifyInitialized(options: IrohaToriiRequestOptions = {}): Promise<void> {
    const response = await this.fetchFn(this.endpointUrl, {
      method: 'POST',
      headers: this.buildHeaders(options.headers, true),
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    });

    if (response.status === 202) return;

    const body = await readResponseBody(response);
    if (!response.ok) {
      throw new IrohaToriiMcpError(`iroha_mcp_http_${response.status}`, response.status, body);
    }

    throw new IrohaToriiMcpError('unexpected_initialized_notification_response', response.status, body);
  }

  ping(options: IrohaToriiRequestOptions = {}): Promise<JsonObject> {
    return this.jsonRpc('ping', {}, options);
  }

  listTools(
    params: { cursor?: string | null; toolsetVersion?: string | null } = {},
    options: IrohaToriiRequestOptions = {}
  ): Promise<IrohaMcpToolsList> {
    const rpcParams: JsonObject = {};

    if (params.cursor != null) {
      if (!/^\d+$/.test(params.cursor)) throw new IrohaToriiMcpError('invalid_cursor');
      rpcParams.cursor = params.cursor;
    }

    if (params.toolsetVersion != null) {
      if (!isNonEmptyString(params.toolsetVersion)) throw new IrohaToriiMcpError('invalid_toolset_version');
      rpcParams.toolsetVersion = params.toolsetVersion;
    }

    return this.jsonRpc('tools/list', rpcParams, options);
  }

  async callTool<TStructuredContent = JsonValue>(
    name: string,
    args: JsonObject = {},
    options: IrohaToriiRequestOptions = {}
  ): Promise<IrohaMcpToolResult<TStructuredContent>> {
    const result = await this.jsonRpc<IrohaMcpToolResult<TStructuredContent>>(
      'tools/call',
      {
        name: normalizeToolName(name, this.requireIrohaToolPrefix),
        arguments: normalizeJsonObject(args, 'invalid_tool_arguments'),
      },
      options
    );

    if (result.isError) {
      throw new IrohaToriiMcpError('iroha_mcp_tool_error', undefined, result, undefined, result.structuredContent);
    }

    return result;
  }

  callToolBatch<TStructuredContent = JsonValue>(
    calls: IrohaMcpBatchCall[],
    options: IrohaToriiRequestOptions = {}
  ): Promise<IrohaMcpBatchResult<TStructuredContent>> {
    if (!Array.isArray(calls) || calls.length === 0 || calls.length > MAX_BATCH_CALLS) {
      throw new IrohaToriiMcpError('invalid_batch_calls');
    }

    return this.jsonRpc(
      'tools/call_batch',
      {
        calls: calls.map((call) => ({
          name: normalizeToolName(call.name, this.requireIrohaToolPrefix),
          arguments: normalizeJsonObject(call.arguments ?? {}, 'invalid_tool_arguments'),
        })),
      },
      options
    );
  }

  callToolAsync(name: string, args: JsonObject = {}, options: IrohaToriiRequestOptions = {}): Promise<IrohaMcpAsyncJob> {
    return this.jsonRpc(
      'tools/call_async',
      {
        name: normalizeToolName(name, this.requireIrohaToolPrefix),
        arguments: normalizeJsonObject(args, 'invalid_tool_arguments'),
      },
      options
    );
  }

  getJob<TStructuredContent = JsonValue>(
    jobId: string,
    options: IrohaToriiRequestOptions = {}
  ): Promise<IrohaMcpJobState<TStructuredContent>> {
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(jobId)) throw new IrohaToriiMcpError('invalid_job_id');

    return this.jsonRpc('tools/jobs/get', { job_id: jobId }, options);
  }

  private async httpGet<T>(options: IrohaToriiRequestOptions): Promise<T> {
    const response = await this.fetchFn(this.endpointUrl, {
      method: 'GET',
      headers: this.buildHeaders(options.headers, false),
    });
    const body = await readResponseBody(response);

    if (!response.ok) {
      throw new IrohaToriiMcpError(`iroha_mcp_http_${response.status}`, response.status, body);
    }

    return body as T;
  }

  private async jsonRpc<T>(method: string, params: JsonObject, options: IrohaToriiRequestOptions): Promise<T> {
    const response = await this.fetchFn(this.endpointUrl, {
      method: 'POST',
      headers: this.buildHeaders(options.headers, true),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: this.nextRequestId++,
        method,
        params,
      }),
    });
    const body = await readResponseBody(response);

    if (!response.ok) {
      throw new IrohaToriiMcpError(`iroha_mcp_http_${response.status}`, response.status, body);
    }

    if (!isRecord(body)) throw new IrohaToriiMcpError('invalid_jsonrpc_response', response.status, body);

    const rpcResponse = body as JsonRpcResponse<T>;
    if (rpcResponse.error) {
      throw new IrohaToriiMcpError(
        rpcResponse.error.message || `iroha_mcp_jsonrpc_${rpcResponse.error.code}`,
        response.status,
        body,
        rpcResponse.error.code,
        rpcResponse.error.data
      );
    }

    if (!Object.hasOwn(rpcResponse, 'result')) {
      throw new IrohaToriiMcpError('invalid_jsonrpc_response', response.status, body);
    }

    return rpcResponse.result as T;
  }

  private buildHeaders(headers: IrohaToriiRuntimeHeaders | undefined, includeJson: boolean): HeadersInit {
    const out: Record<string, string> = {};

    if (includeJson) out['content-type'] = 'application/json';

    for (const [name, value] of Object.entries({ ...this.defaultHeaders, ...(headers ?? {}) })) {
      if (value == null) continue;

      const lower = name.toLowerCase();
      if (!ALLOWED_RUNTIME_HEADERS.has(lower)) throw new IrohaToriiMcpError('invalid_header');

      out[lower] = value;
    }

    return out;
  }
}

class IrohaToriiWalletClient {
  private readonly client: IrohaToriiMcpClient;
  private readonly defaultHeaders: IrohaToriiRuntimeHeaders;
  private readonly fetchFn: FetchLike;
  private readonly toriiBaseUrl: string | null;
  private readonly network: IrohaNetworkKey;

  constructor(
    options: (Omit<IrohaToriiMcpClientOptions, 'baseUrl'> & {
      baseUrl?: string | null;
      client?: IrohaToriiMcpClient;
      network?: IrohaNetworkKey;
    }) = {}
  ) {
    this.network = options.network ?? 'taira';
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.defaultHeaders = options.headers ?? {};
    this.toriiBaseUrl = options.baseUrl ?? UNIVERSAL_WALLET_IROHA_NETWORKS[this.network].toriiBaseUrl;
    this.client = options.client ?? createIrohaToriiMcpClient(this.network, options);
  }

  async getAccount<TBody = JsonValue>(
    accountId: string,
    options: IrohaToriiWalletReadOptions = {}
  ): Promise<IrohaToriiRouteResponse<TBody>> {
    return this.callReadRoute<TBody>(
      'iroha.accounts.get',
      {
        account_id: normalizeIrohaAccountId(accountId, this.network),
        ...jsonAcceptArg(options),
      },
      options
    );
  }

  async getAccountAssets<TBody = JsonValue>(
    accountId: string,
    options: IrohaToriiAccountAssetsOptions = {}
  ): Promise<IrohaToriiRouteResponse<TBody>> {
    return this.callReadRoute<TBody>(
      'iroha.accounts.assets',
      {
        account_id: normalizeIrohaAccountId(accountId, this.network),
        ...jsonAcceptArg(options),
        ...accountAssetsArgs(options),
      },
      options
    );
  }

  async getAccountSnapshot<TAccountBody = JsonValue, TAssetsBody = JsonValue>(
    accountId: string,
    options: IrohaToriiAccountAssetsOptions = {}
  ): Promise<{
    account: IrohaToriiRouteResponse<TAccountBody>;
    assets: IrohaToriiRouteResponse<TAssetsBody>;
  }> {
    const normalizedAccountId = normalizeIrohaAccountId(accountId, this.network);
    const result = await this.client.callToolBatch<IrohaToriiRouteStructuredContent>(
      [
        {
          name: 'iroha.accounts.get',
          arguments: {
            account_id: normalizedAccountId,
            ...jsonAcceptArg(options),
          },
        },
        {
          name: 'iroha.accounts.assets',
          arguments: {
            account_id: normalizedAccountId,
            ...jsonAcceptArg(options),
            ...accountAssetsArgs(options),
          },
        },
      ],
      options
    );

    return {
      account: normalizeBatchRouteResponse<TAccountBody>(result.results[0], 'iroha.accounts.get'),
      assets: normalizeBatchRouteResponse<TAssetsBody>(result.results[1], 'iroha.accounts.assets'),
    };
  }

  async getInstructions<TBody = JsonValue>(
    options: IrohaToriiInstructionsListOptions = {}
  ): Promise<IrohaToriiRouteResponse<TBody>> {
    return this.callReadRoute<TBody>(
      'iroha.instructions.list',
      {
        ...jsonAcceptArg(options),
        ...instructionsListArgs(options, this.network),
      },
      options
    );
  }

  async getAssetDefinitions<TBody = JsonValue>(
    options: IrohaToriiDirectRequestOptions = {}
  ): Promise<TBody> {
    return this.directHttp<TBody>('GET', '/v1/assets/definitions', options);
  }

  async getTransactionStatus<TBody = JsonValue>(
    hash: string,
    options: IrohaToriiTransactionStatusOptions = {}
  ): Promise<TBody> {
    const normalizedHash = normalizeTransactionHash(hash);
    const scope = normalizeTransactionStatusScope(options.scope ?? 'auto');

    return this.directHttp<TBody>(
      'GET',
      `/v1/pipeline/transactions/status?hash=${normalizedHash}&scope=${scope}`,
      options
    );
  }

  async submitTransaction<TBody = JsonValue>(
    noritoPayload: unknown,
    options: IrohaToriiSubmitTransactionOptions = {}
  ): Promise<TBody> {
    if (options.accept !== undefined && options.accept !== 'application/json') {
      throw new IrohaToriiMcpError('invalid_accept');
    }

    return this.directHttp<TBody>(
      'POST',
      '/v1/pipeline/transactions',
      options,
      normalizeNoritoPayload(noritoPayload),
      {
        accept: 'application/json',
        'content-type': 'application/x-norito',
      }
    );
  }

  private async callReadRoute<TBody>(
    toolName: string,
    args: JsonObject,
    options: IrohaToriiRequestOptions
  ): Promise<IrohaToriiRouteResponse<TBody>> {
    const result = await this.client.callTool<IrohaToriiRouteStructuredContent<TBody>>(toolName, args, options);

    return normalizeRouteResponse<TBody>(result.structuredContent, toolName);
  }

  private async directHttp<TBody>(
    method: 'GET' | 'POST',
    pathAndQuery: string,
    options: IrohaToriiDirectRequestOptions,
    body?: BodyInit,
    contentHeaders: Record<string, string> = {}
  ): Promise<TBody> {
    const response = await this.fetchFn(`${this.resolveToriiBaseUrl(options.baseUrl)}${pathAndQuery}`, {
      method,
      headers: this.buildHeaders(options.headers, contentHeaders),
      body,
    });
    const responseBody = await readResponseBody(response);

    if (!response.ok) {
      throw new IrohaToriiMcpError(`iroha_torii_http_${response.status}`, response.status, responseBody);
    }

    return responseBody as TBody;
  }

  private resolveToriiBaseUrl(baseUrl?: string | null): string {
    const resolved = baseUrl ?? this.toriiBaseUrl;

    if (!resolved) throw new IrohaToriiMcpError('iroha_network_unavailable');

    return normalizeToriiBaseUrl(resolved);
  }

  private buildHeaders(
    headers: IrohaToriiRuntimeHeaders | undefined,
    contentHeaders: Record<string, string>
  ): HeadersInit {
    const out: Record<string, string> = { ...contentHeaders };

    for (const [name, value] of Object.entries({ ...this.defaultHeaders, ...(headers ?? {}) })) {
      if (value == null) continue;

      const lower = name.toLowerCase();
      if (!ALLOWED_RUNTIME_HEADERS.has(lower)) throw new IrohaToriiMcpError('invalid_header');

      out[lower] = value;
    }

    return out;
  }
}

function createIrohaToriiMcpClient(
  network: IrohaNetworkKey = 'taira',
  options: Omit<IrohaToriiMcpClientOptions, 'baseUrl'> & { baseUrl?: string | null } = {}
): IrohaToriiMcpClient {
  const registry = UNIVERSAL_WALLET_IROHA_NETWORKS[network];
  const baseUrl = options.baseUrl ?? registry.toriiBaseUrl;

  if (!baseUrl) {
    throw new IrohaToriiMcpError('iroha_network_unavailable');
  }

  return new IrohaToriiMcpClient({ ...options, baseUrl });
}

function createIrohaToriiWalletClient(
  network: IrohaNetworkKey = 'taira',
  options: Omit<IrohaToriiMcpClientOptions, 'baseUrl'> & { baseUrl?: string | null } = {}
): IrohaToriiWalletClient {
  return new IrohaToriiWalletClient({ ...options, network });
}

function normalizeIrohaAccountId(accountId: string, network: IrohaNetworkKey): string {
  if (!isNonEmptyString(accountId)) throw new IrohaToriiMcpError('invalid_account_id');

  try {
    return parseIrohaI105Address(accountId, network).i105;
  } catch (error) {
    throw new IrohaToriiMcpError('invalid_account_id', undefined, undefined, undefined, error);
  }
}

function jsonAcceptArg(options: IrohaToriiWalletReadOptions): JsonObject {
  if (options.accept !== undefined && options.accept !== 'application/json') {
    throw new IrohaToriiMcpError('invalid_accept');
  }

  return { accept: 'application/json' };
}

function accountAssetsArgs(options: IrohaToriiAccountAssetsOptions): JsonObject {
  const args: JsonObject = {};

  if (options.assetId !== undefined) args.asset_id = normalizeRouteString(options.assetId, 'invalid_asset_id');
  if (options.limit !== undefined) args.limit = normalizeInteger(options.limit, 'invalid_limit', 1, 500);
  if (options.offset !== undefined) args.offset = normalizeInteger(options.offset, 'invalid_offset', 0, 1_000_000);
  if (options.query !== undefined) args.query = normalizeJsonObject(options.query, 'invalid_query');

  return args;
}

function instructionsListArgs(options: IrohaToriiInstructionsListOptions, network: IrohaNetworkKey): JsonObject {
  const args: JsonObject = {};

  if (options.account !== undefined) args.account = normalizeIrohaAccountId(options.account, network);
  if (options.authority !== undefined) args.authority = normalizeIrohaAccountId(options.authority, network);
  if (options.transactionHash !== undefined) args.transaction_hash = normalizeTransactionHash(options.transactionHash);
  if (options.transactionStatus !== undefined) {
    args.transaction_status = normalizeTransactionStatusFilter(options.transactionStatus);
  }
  if (options.block !== undefined) args.block = normalizeInteger(options.block, 'invalid_block', 1, 1_000_000_000);
  if (options.kind !== undefined) args.kind = normalizeRouteString(options.kind, 'invalid_instruction_kind');
  if (options.assetId !== undefined) args.asset_id = normalizeRouteString(options.assetId, 'invalid_asset_id');
  if (options.page !== undefined) args.page = normalizeInteger(options.page, 'invalid_page', 0, 1_000_000);
  if (options.perPage !== undefined) args.per_page = normalizeInteger(options.perPage, 'invalid_per_page', 1, 500);
  if (options.query !== undefined) args.query = normalizeJsonObject(options.query, 'invalid_query');

  return args;
}

function normalizeTransactionStatusFilter(value: unknown): 'committed' | 'rejected' {
  if (value === 'committed' || value === 'rejected') return value;

  throw new IrohaToriiMcpError('invalid_transaction_status');
}

function normalizeBatchRouteResponse<TBody>(
  entry: IrohaMcpBatchResult<IrohaToriiRouteStructuredContent>['results'][number] | undefined,
  toolName: string
): IrohaToriiRouteResponse<TBody> {
  if (!entry) throw new IrohaToriiMcpError('invalid_batch_result');
  if (entry.error) throw new IrohaToriiMcpError('iroha_mcp_batch_tool_error', undefined, entry, undefined, entry.error);
  if (!entry.result) throw new IrohaToriiMcpError('invalid_batch_result');
  if (entry.result.isError) {
    throw new IrohaToriiMcpError(
      'iroha_mcp_tool_error',
      undefined,
      entry.result,
      undefined,
      entry.result.structuredContent
    );
  }

  return normalizeRouteResponse<TBody>(entry.result.structuredContent, toolName);
}

function normalizeRouteResponse<TBody>(
  structuredContent: unknown,
  toolName: string
): IrohaToriiRouteResponse<TBody> {
  if (!isRecord(structuredContent) || Array.isArray(structuredContent)) {
    throw new IrohaToriiMcpError('invalid_route_response', undefined, structuredContent, undefined, { toolName });
  }

  const {
    status: statusValue,
    headers,
    content_type: contentType,
    body,
    error_code: errorCodeValue,
  } = structuredContent;
  if (
    typeof statusValue !== 'number' ||
    !Number.isInteger(statusValue) ||
    statusValue < 100 ||
    statusValue > 599
  ) {
    throw new IrohaToriiMcpError('invalid_route_response', undefined, structuredContent, undefined, { toolName });
  }

  const status = statusValue;
  if (status >= 400) {
    const errorCode = typeof errorCodeValue === 'string' ? errorCodeValue : undefined;

    throw new IrohaToriiMcpError('iroha_mcp_route_error', status, structuredContent, undefined, errorCode);
  }

  if (!Object.hasOwn(structuredContent, 'body')) {
    throw new IrohaToriiMcpError('invalid_route_response', status, structuredContent, undefined, { toolName });
  }

  return {
    status,
    headers: normalizeRouteHeaders(headers),
    contentType: normalizeRouteContentType(contentType, structuredContent),
    body: body as TBody,
  };
}

function normalizeRouteHeaders(value: unknown): Record<string, string> {
  if (value == null) return {};
  if (!isRecord(value) || Array.isArray(value)) throw new IrohaToriiMcpError('invalid_route_response');

  const headers: Record<string, string> = {};
  for (const [name, headerValue] of Object.entries(value)) {
    if (typeof headerValue !== 'string') throw new IrohaToriiMcpError('invalid_route_response');
    headers[name.toLowerCase()] = headerValue;
  }

  return headers;
}

function normalizeRouteContentType(value: unknown, body: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw new IrohaToriiMcpError('invalid_route_response', undefined, body);

  return value;
}

function normalizeInteger(value: unknown, errorCode: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new IrohaToriiMcpError(errorCode);
  }

  return value;
}

function normalizeRouteString(value: unknown, errorCode: string): string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim() || value.length > 256) {
    throw new IrohaToriiMcpError(errorCode);
  }

  if (Array.from(value).some((char) => {
    const code = char.charCodeAt(0);

    return code <= 0x1f || code === 0x7f;
  })) {
    throw new IrohaToriiMcpError(errorCode);
  }

  return value;
}

function normalizeMcpEndpoint(baseUrl: string | null): string {
  if (!baseUrl) throw new IrohaToriiMcpError('invalid_base_url');

  const url = new URL(baseUrl);

  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new IrohaToriiMcpError('invalid_base_url');
  }

  let path = url.pathname.replace(/\/+$/, '');
  if (!path) path = DEFAULT_MCP_PATH;
  else if (!path.endsWith(DEFAULT_MCP_PATH)) path = `${path}${DEFAULT_MCP_PATH}`;

  url.pathname = path;
  url.search = '';
  url.hash = '';

  return url.toString();
}

function normalizeToriiBaseUrl(baseUrl: string | null): string {
  if (!baseUrl) throw new IrohaToriiMcpError('invalid_base_url');

  const url = new URL(baseUrl);

  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new IrohaToriiMcpError('invalid_base_url');
  }

  let path = url.pathname.replace(/\/+$/, '');
  if (path.endsWith(DEFAULT_MCP_PATH)) path = path.slice(0, -DEFAULT_MCP_PATH.length);

  url.pathname = path;
  url.search = '';
  url.hash = '';

  return url.toString().replace(/\/+$/, '');
}

function normalizeTransactionHash(hash: unknown): string {
  if (typeof hash !== 'string') throw new IrohaToriiMcpError('invalid_hash');

  const normalized = hash.trim().replace(/^0x/u, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(normalized)) throw new IrohaToriiMcpError('invalid_hash');

  return normalized;
}

function normalizeTransactionStatusScope(scope: unknown): IrohaToriiTransactionStatusScope {
  if (scope === 'local' || scope === 'auto' || scope === 'global') return scope;

  throw new IrohaToriiMcpError('invalid_scope');
}

function normalizeNoritoPayload(payload: unknown): BodyInit {
  if (payload instanceof ArrayBuffer && payload.byteLength > 0) return payload;

  if (ArrayBuffer.isView(payload) && payload.byteLength > 0) return payload as BodyInit;

  if (typeof Blob !== 'undefined' && payload instanceof Blob && payload.size > 0) return payload;

  throw new IrohaToriiMcpError('invalid_norito_payload');
}

function normalizeToolName(name: string, requireIrohaToolPrefix: boolean): string {
  if (!/^iroha\.[a-z0-9][a-z0-9_.-]*$/u.test(name) && requireIrohaToolPrefix) {
    throw new IrohaToriiMcpError('invalid_tool_name');
  }

  if (!requireIrohaToolPrefix && !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/u.test(name)) {
    throw new IrohaToriiMcpError('invalid_tool_name');
  }

  return name;
}

function normalizeJsonObject(value: unknown, errorCode: string): JsonObject {
  if (!isRecord(value) || Array.isArray(value)) throw new IrohaToriiMcpError(errorCode);

  return value as JsonObject;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new IrohaToriiMcpError('invalid_json', response.status, text);
  }
}

const ALLOWED_RUNTIME_HEADERS = new Set([
  'authorization',
  'x-api-token',
  'x-iroha-account',
  'x-iroha-signature',
  'x-iroha-api-version',
]);

export {
  IROHA_MCP_PROTOCOL_VERSION,
  IrohaToriiMcpClient,
  IrohaToriiMcpError,
  IrohaToriiWalletClient,
  createIrohaToriiMcpClient,
  createIrohaToriiWalletClient,
  type IrohaMcpAsyncJob,
  type IrohaMcpBatchCall,
  type IrohaMcpBatchResult,
  type IrohaMcpCapabilities,
  type IrohaMcpJobState,
  type IrohaMcpToolDescriptor,
  type IrohaMcpToolResult,
  type IrohaMcpToolsList,
  type IrohaToriiAccountAssetsOptions,
  type IrohaToriiDirectRequestOptions,
  type IrohaToriiInstructionsListOptions,
  type IrohaToriiMcpClientOptions,
  type IrohaToriiRequestOptions,
  type IrohaToriiRouteResponse,
  type IrohaToriiRouteStructuredContent,
  type IrohaToriiRuntimeHeaders,
  type IrohaToriiSubmitTransactionOptions,
  type IrohaToriiTransactionStatusOptions,
  type IrohaToriiTransactionStatusScope,
  type IrohaToriiWalletReadOptions,
};
