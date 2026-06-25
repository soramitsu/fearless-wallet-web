import { UNIVERSAL_WALLET_INDEXERS } from '@/consts/universalWallet';

type SolanaTokenProgram = 'spl-token' | 'token-2022';
type SolanaTransactionStatus = 'success' | 'failed';
type SpotRoute = 'batch' | 'dlmm' | 'rfq';

type SolanaNativeBalance = {
  type: 'native';
  mint: 'SOL';
  lamports: string;
  decimals: 9;
  uiAmountString: string;
};

type SolanaTokenBalance = {
  type: 'token';
  accountAddress: string;
  mint: string;
  owner: string;
  program: SolanaTokenProgram;
  programId: string;
  amount: string;
  decimals: number;
  uiAmountString: string;
  state: string | null;
  isNative: boolean;
  delegatedAmount: string | null;
  rentExemptReserve: string | null;
};

type SolanaWalletBalancesResponse = {
  wallet: string;
  native: SolanaNativeBalance;
  tokens: SolanaTokenBalance[];
  total: number;
  syncedAt: number;
};

type SolanaWalletAsset = SolanaNativeBalance | SolanaTokenBalance;

type SolanaWalletAssetsResponse = {
  wallet: string;
  assets: SolanaWalletAsset[];
  total: number;
  syncedAt: number;
};

type SolanaWalletStateResponse = {
  wallet: string;
  exists: boolean;
  lamports: string;
  owner: string | null;
  executable: boolean;
  rentEpoch: string | null;
  dataLength: number;
  syncedAt: number;
};

type SolanaTokenBalanceChange = {
  mint: string;
  preAmount: string;
  postAmount: string;
  amountDelta: string;
  decimals: number;
  uiAmountDeltaString: string;
};

type SolanaWalletTransactionRecord = {
  signature: string;
  slot: number;
  timestamp: number;
  status: SolanaTransactionStatus;
  feeLamports: string | null;
  nativeBalanceChangeLamports: string | null;
  tokenBalanceChanges: SolanaTokenBalanceChange[];
  programIds: string[];
  solswapRoute: SpotRoute | null;
};

type SolanaWalletTransactionsResponse = {
  wallet: string;
  before: string | null;
  nextBefore: string | null;
  limit: number;
  total: number;
  syncedAt: number;
  transactions: SolanaWalletTransactionRecord[];
};

type SolanaTokenMetadata = {
  mint: string;
  exists: boolean;
  program: SolanaTokenProgram | 'unknown';
  programId: string | null;
  extensions: string[];
  transferFeeConfig: SolanaTokenTransferFeeConfig | null;
  transferHook: SolanaTokenTransferHook | null;
  decimals: number | null;
  supply: string | null;
  uiSupplyString: string | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  isInitialized: boolean | null;
  name: string | null;
  symbol: string | null;
  uri: string | null;
  syncedAt: number;
};

type SolanaTokenTransferFee = {
  epoch: string | null;
  maximumFee: string | null;
  transferFeeBasisPoints: number | null;
};

type SolanaTokenTransferFeeConfig = {
  transferFeeConfigAuthority: string | null;
  withdrawWithheldAuthority: string | null;
  withheldAmount: string | null;
  olderTransferFee: SolanaTokenTransferFee | null;
  newerTransferFee: SolanaTokenTransferFee | null;
};

type SolanaTokenTransferHook = {
  authority: string | null;
  programId: string | null;
  extraAccountMetasAddress: string | null;
};

type SolanaTokenMetadataBatchResponse = {
  total: number;
  syncedAt: number;
  tokens: SolanaTokenMetadata[];
};

type SolanaTransactionQuery = {
  before?: string | null;
  limit?: number;
};

type SolanaIndexerServiceInfo = {
  schemaVersion: number;
  serviceId: string;
  serviceName: string;
  ecosystem: string;
  chainId: string;
  network: string;
  publicBaseUrl: string;
  readOnly: boolean;
  capabilities: string[];
  endpoints: Record<string, string>;
};

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

class SolanaIndexerError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown
  ) {
    super(message);
    this.name = 'SolanaIndexerError';
  }
}

class SolanaIndexerClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string = UNIVERSAL_WALLET_INDEXERS.solana, private readonly fetchFn: FetchLike = globalThis.fetch.bind(globalThis)) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  getServiceInfo(): Promise<SolanaIndexerServiceInfo> {
    return this.request('/api/indexer/v1/service-info');
  }

  async verifyServiceInfo(): Promise<SolanaIndexerServiceInfo> {
    const info = await this.getServiceInfo();
    if (!isExpectedSolanaIndexerServiceInfo(info)) {
      throw new SolanaIndexerError('unexpected_service_info', undefined, info);
    }

    return info;
  }

  getBalances(wallet: string): Promise<SolanaWalletBalancesResponse> {
    return this.request(`/api/indexer/v1/accounts/${normalizePublicKey(wallet, 'wallet')}/balances`);
  }

  getAssets(wallet: string): Promise<SolanaWalletAssetsResponse> {
    return this.request(`/api/indexer/v1/accounts/${normalizePublicKey(wallet, 'wallet')}/assets`);
  }

  getState(wallet: string): Promise<SolanaWalletStateResponse> {
    return this.request(`/api/indexer/v1/accounts/${normalizePublicKey(wallet, 'wallet')}/state`);
  }

  getTransactions(wallet: string, query: SolanaTransactionQuery = {}): Promise<SolanaWalletTransactionsResponse> {
    const url = new URL(`${this.baseUrl}/api/indexer/v1/accounts/${normalizePublicKey(wallet, 'wallet')}/txs`);

    if (query.limit !== undefined) {
      if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 250) {
        throw new SolanaIndexerError('invalid_limit');
      }
      url.searchParams.set('limit', query.limit.toString());
    }

    if (query.before != null) {
      url.searchParams.set('before', normalizeSignature(query.before));
    }

    return this.request(url);
  }

  getTokenMetadata(mint: string): Promise<SolanaTokenMetadata> {
    return this.request(`/api/indexer/v1/tokens/${normalizePublicKey(mint, 'mint')}/metadata`);
  }

  getTokenMetadataBatch(mints: string[]): Promise<SolanaTokenMetadataBatchResponse> {
    if (!Array.isArray(mints) || mints.length === 0 || mints.length > 100) {
      throw new SolanaIndexerError('invalid_mints');
    }

    return this.request('/api/indexer/v1/tokens/metadata', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mints: mints.map((mint) => normalizePublicKey(mint, 'mint')),
      }),
    });
  }

  private async request<T>(pathOrUrl: string | URL, init?: RequestInit): Promise<T> {
    const url = typeof pathOrUrl === 'string' ? `${this.baseUrl}${pathOrUrl}` : pathOrUrl.toString();
    const response = await this.fetchFn(url, init);
    const body = await readJson(response);

    if (!response.ok) {
      throw new SolanaIndexerError(`solana_indexer_http_${response.status}`, response.status, body);
    }

    return body as T;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);

  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new SolanaIndexerError('invalid_base_url');
  }

  return url.toString().replace(/\/+$/, '');
}

function normalizePublicKey(value: string, label: 'wallet' | 'mint'): string {
  if (!BASE58_PUBLIC_KEY.test(value)) {
    throw new SolanaIndexerError(`invalid_${label}`);
  }

  return encodeURIComponent(value);
}

function normalizeSignature(value: string): string {
  if (!BASE58_SIGNATURE.test(value)) {
    throw new SolanaIndexerError('invalid_before');
  }

  return value;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new SolanaIndexerError('invalid_json', response.status, text);
  }
}

function isExpectedSolanaIndexerServiceInfo(value: SolanaIndexerServiceInfo): boolean {
  return (
    value.schemaVersion === 1 &&
    value.serviceId === 'si.soramitsu.io' &&
    value.ecosystem === 'solana' &&
    value.chainId === 'solana:mainnet' &&
    value.publicBaseUrl === 'https://si.soramitsu.io' &&
    value.readOnly
  );
}

const BASE58_PUBLIC_KEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BASE58_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;

export {
  SolanaIndexerClient,
  SolanaIndexerError,
  isExpectedSolanaIndexerServiceInfo,
  type SolanaNativeBalance,
  type SolanaIndexerServiceInfo,
  type SolanaTokenBalance,
  type SolanaWalletBalancesResponse,
  type SolanaWalletAsset,
  type SolanaWalletAssetsResponse,
  type SolanaWalletStateResponse,
  type SolanaWalletTransactionRecord,
  type SolanaWalletTransactionsResponse,
  type SolanaTokenMetadata,
  type SolanaTokenMetadataBatchResponse,
  type SolanaTokenTransferFee,
  type SolanaTokenTransferFeeConfig,
  type SolanaTokenTransferHook,
};
