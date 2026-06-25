import { UNIVERSAL_WALLET_SOLANA_RPC_ENDPOINTS } from '@/consts/universalWallet';

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
  preflightCommitment?: SolanaRpcCommitment;
  skipPreflight?: boolean;
};

type SolanaRpcClientOptions = {
  fetchFn?: FetchLike;
  network?: SolanaRpcNetwork;
  rpcUrl?: string;
};

class SolanaRpcError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown
  ) {
    super(message);
    this.name = 'SolanaRpcError';
  }
}

class SolanaRpcClient {
  private nextId = 1;
  private readonly fetchFn: FetchLike;
  private readonly rpcUrl: string;

  constructor({
    fetchFn = globalThis.fetch.bind(globalThis),
    network = 'mainnet',
    rpcUrl,
  }: SolanaRpcClientOptions = {}) {
    this.fetchFn = fetchFn;
    this.rpcUrl = normalizeRpcUrl(rpcUrl ?? UNIVERSAL_WALLET_SOLANA_RPC_ENDPOINTS[normalizeNetwork(network)]);
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

  async sendRawTransaction(
    transactionBase64: string,
    {
      maxRetries,
      preflightCommitment = 'confirmed',
      skipPreflight = false,
    }: SolanaBroadcastOptions = {}
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

    return this.request(
      'sendTransaction',
      [normalizeTransactionBase64(transactionBase64), options],
      normalizeSignature
    );
  }

  private async request<T>(
    method: string,
    params: unknown[],
    normalizeResult: (value: unknown) => T
  ): Promise<T> {
    const id = this.nextId++;
    const response = await this.fetchFn(this.rpcUrl, {
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
    });
    const body = await readJson(response);

    if (!response.ok) throw new SolanaRpcError(`solana_rpc_http_${response.status}`, response.status, body);
    if (!isRecord(body) || body.jsonrpc !== '2.0' || body.id !== id) throw new SolanaRpcError('invalid_rpc_response');
    if (body.error !== undefined) throw new SolanaRpcError('solana_rpc_error', response.status, normalizeRpcError(body.error));
    if (!('result' in body)) throw new SolanaRpcError('invalid_rpc_response');

    return normalizeResult(body.result);
  }
}

function normalizeRpcUrl(rpcUrl: string): string {
  const url = new URL(rpcUrl);

  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new SolanaRpcError('invalid_rpc_url');
  }

  url.search = '';
  url.hash = '';

  return url.toString().replace(/\/+$/, '');
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
      replacementBlockhash: value.value.replacementBlockhash === undefined
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
const BASE58_32_TO_64 = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const BASE58_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;

export {
  SolanaRpcClient,
  SolanaRpcError,
  type SolanaBroadcastOptions,
  type SolanaFeeForMessageResponse,
  type SolanaJsonRpcErrorPayload,
  type SolanaLatestBlockhash,
  type SolanaLatestBlockhashResponse,
  type SolanaRpcCommitment,
  type SolanaRpcContext,
  type SolanaRpcNetwork,
  type SolanaSimulationOptions,
  type SolanaSimulationResponse,
  type SolanaSimulationValue,
};
