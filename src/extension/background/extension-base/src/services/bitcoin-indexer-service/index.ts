import { UNIVERSAL_WALLET_INDEXERS } from '@/consts/universalWallet';
import { isBitcoinAddress, type BitcoinNetworkKind } from '@/util/bitcoin';

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

type BitcoinEsploraStats = {
  funded_txo_count: number;
  funded_txo_sum: number;
  spent_txo_count: number;
  spent_txo_sum: number;
  tx_count: number;
};

type BitcoinEsploraAddress = {
  address: string;
  chain_stats: BitcoinEsploraStats;
  mempool_stats: BitcoinEsploraStats;
};

type BitcoinAddressBalance = {
  confirmedSats: number;
  mempoolSats: number;
  totalSats: number;
};

type BitcoinEsploraTxStatus = {
  block_hash?: string;
  block_height?: number;
  block_time?: number;
  confirmed: boolean;
};

type BitcoinEsploraUtxo = {
  status: BitcoinEsploraTxStatus;
  txid: string;
  value: number;
  vout: number;
};

type BitcoinEsploraTransaction = {
  fee?: number;
  locktime?: number;
  size?: number;
  status: BitcoinEsploraTxStatus;
  txid: string;
  version?: number;
  vin?: unknown[];
  vout?: unknown[];
  weight?: number;
};

type BitcoinFeeEstimates = Record<string, number>;

type BitcoinTransactionQuery = {
  lastSeenTxid?: string | null;
  mempool?: boolean;
};

type BitcoinEsploraClientOptions = {
  baseUrl?: string;
  fetchFn?: FetchLike;
  network?: BitcoinNetworkKind;
};

class BitcoinIndexerError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown
  ) {
    super(message);
    this.name = 'BitcoinIndexerError';
  }
}

class BitcoinEsploraClient {
  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly network: BitcoinNetworkKind;

  constructor({ baseUrl, fetchFn = globalThis.fetch.bind(globalThis), network = 'mainnet' }: BitcoinEsploraClientOptions = {}) {
    this.network = network;
    this.baseUrl = normalizeBaseUrl(baseUrl ?? UNIVERSAL_WALLET_INDEXERS.bitcoin[network]);
    this.fetchFn = fetchFn;
  }

  async getAddress(address: string): Promise<BitcoinEsploraAddress> {
    return normalizeAddressResponse(await this.requestJson(`/address/${normalizeAddress(address, this.network)}`), address);
  }

  async getBalance(address: string): Promise<BitcoinAddressBalance> {
    const { chain_stats: chainStats, mempool_stats: mempoolStats } = await this.getAddress(address);
    const confirmedSats = chainStats.funded_txo_sum - chainStats.spent_txo_sum;
    const mempoolSats = mempoolStats.funded_txo_sum - mempoolStats.spent_txo_sum;

    return {
      confirmedSats,
      mempoolSats,
      totalSats: confirmedSats + mempoolSats,
    };
  }

  async getUtxos(address: string): Promise<BitcoinEsploraUtxo[]> {
    const response = await this.requestJson(`/address/${normalizeAddress(address, this.network)}/utxo`);

    if (!Array.isArray(response)) throw new BitcoinIndexerError('invalid_utxo_response');

    return response.map(normalizeUtxo);
  }

  async getTransactions(
    address: string,
    { lastSeenTxid, mempool = false }: BitcoinTransactionQuery = {}
  ): Promise<BitcoinEsploraTransaction[]> {
    const normalizedAddress = normalizeAddress(address, this.network);
    const path = mempool
      ? `/address/${normalizedAddress}/txs/mempool`
      : lastSeenTxid
        ? `/address/${normalizedAddress}/txs/chain/${normalizeTxid(lastSeenTxid)}`
        : `/address/${normalizedAddress}/txs`;
    const response = await this.requestJson(path);

    if (!Array.isArray(response)) throw new BitcoinIndexerError('invalid_transactions_response');

    return response.map(normalizeTransaction);
  }

  async getFeeEstimates(): Promise<BitcoinFeeEstimates> {
    const response = await this.requestJson('/fee-estimates');

    if (!isRecord(response)) throw new BitcoinIndexerError('invalid_fee_estimates_response');

    return Object.entries(response).reduce<BitcoinFeeEstimates>((result, [target, value]) => {
      if (!/^\d+$/.test(target) || typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new BitcoinIndexerError('invalid_fee_estimates_response');
      }
      result[target] = value;

      return result;
    }, {});
  }

  async broadcastTransaction(txHex: string): Promise<string> {
    const response = await this.fetchFn(`${this.baseUrl}/tx`, {
      body: normalizeTxHex(txHex),
      headers: { 'content-type': 'text/plain' },
      method: 'POST',
    });
    const body = await response.text();

    if (!response.ok) throw new BitcoinIndexerError(`bitcoin_indexer_http_${response.status}`, response.status, body);

    return normalizeTxid(body.trim());
  }

  private async requestJson(path: string): Promise<unknown> {
    const response = await this.fetchFn(`${this.baseUrl}${path}`);
    const body = await readJson(response);

    if (!response.ok) throw new BitcoinIndexerError(`bitcoin_indexer_http_${response.status}`, response.status, body);

    return body;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);

  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new BitcoinIndexerError('invalid_base_url');
  }

  url.search = '';
  url.hash = '';

  return url.toString().replace(/\/+$/, '');
}

function normalizeAddress(address: string, network: BitcoinNetworkKind): string {
  if (!isBitcoinAddress(address, network)) throw new BitcoinIndexerError('invalid_address');

  return encodeURIComponent(address.toLowerCase());
}

function normalizeTxid(txid: string): string {
  if (!/^[0-9a-f]{64}$/iu.test(txid)) throw new BitcoinIndexerError('invalid_txid');

  return txid.toLowerCase();
}

function normalizeTxHex(txHex: string): string {
  if (!/^(?:[0-9a-f]{2})+$/iu.test(txHex) || txHex.length > 800_000) throw new BitcoinIndexerError('invalid_tx_hex');

  return txHex.toLowerCase();
}

function normalizeAddressResponse(response: unknown, requestedAddress: string): BitcoinEsploraAddress {
  if (!isRecord(response)) throw new BitcoinIndexerError('invalid_address_response');

  const address = requireString(response.address, 'invalid_address_response');
  if (address.toLowerCase() !== requestedAddress.toLowerCase()) throw new BitcoinIndexerError('address_mismatch');

  return {
    address,
    chain_stats: normalizeStats(response.chain_stats),
    mempool_stats: normalizeStats(response.mempool_stats),
  };
}

function normalizeUtxo(response: unknown): BitcoinEsploraUtxo {
  if (!isRecord(response)) throw new BitcoinIndexerError('invalid_utxo_response');

  return {
    status: normalizeStatus(response.status),
    txid: normalizeTxid(requireString(response.txid, 'invalid_utxo_response')),
    value: requireSafeInteger(response.value, 'invalid_utxo_response'),
    vout: requireVout(response.vout, 'invalid_utxo_response'),
  };
}

function normalizeTransaction(response: unknown): BitcoinEsploraTransaction {
  if (!isRecord(response)) throw new BitcoinIndexerError('invalid_transactions_response');

  return {
    fee: optionalSafeInteger(response.fee, 'invalid_transactions_response'),
    locktime: optionalSafeInteger(response.locktime, 'invalid_transactions_response'),
    size: optionalSafeInteger(response.size, 'invalid_transactions_response'),
    status: normalizeStatus(response.status),
    txid: normalizeTxid(requireString(response.txid, 'invalid_transactions_response')),
    version: optionalSafeInteger(response.version, 'invalid_transactions_response'),
    vin: Array.isArray(response.vin) ? response.vin : undefined,
    vout: Array.isArray(response.vout) ? response.vout : undefined,
    weight: optionalSafeInteger(response.weight, 'invalid_transactions_response'),
  };
}

function normalizeStats(value: unknown): BitcoinEsploraStats {
  if (!isRecord(value)) throw new BitcoinIndexerError('invalid_stats_response');

  return {
    funded_txo_count: requireSafeInteger(value.funded_txo_count, 'invalid_stats_response'),
    funded_txo_sum: requireSafeInteger(value.funded_txo_sum, 'invalid_stats_response'),
    spent_txo_count: requireSafeInteger(value.spent_txo_count, 'invalid_stats_response'),
    spent_txo_sum: requireSafeInteger(value.spent_txo_sum, 'invalid_stats_response'),
    tx_count: requireSafeInteger(value.tx_count, 'invalid_stats_response'),
  };
}

function normalizeStatus(value: unknown): BitcoinEsploraTxStatus {
  if (!isRecord(value)) throw new BitcoinIndexerError('invalid_status_response');

  const confirmed = value.confirmed;
  if (typeof confirmed !== 'boolean') throw new BitcoinIndexerError('invalid_status_response');

  return {
    block_hash: optionalString(value.block_hash, 'invalid_status_response'),
    block_height: optionalSafeInteger(value.block_height, 'invalid_status_response'),
    block_time: optionalSafeInteger(value.block_time, 'invalid_status_response'),
    confirmed,
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new BitcoinIndexerError('invalid_json', response.status, text);
  }
}

function requireString(value: unknown, errorCode: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new BitcoinIndexerError(errorCode);

  return value;
}

function optionalString(value: unknown, errorCode: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new BitcoinIndexerError(errorCode);

  return value;
}

function requireSafeInteger(value: unknown, errorCode: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new BitcoinIndexerError(errorCode);

  return value as number;
}

function optionalSafeInteger(value: unknown, errorCode: string): number | undefined {
  if (value === undefined || value === null) return undefined;

  return requireSafeInteger(value, errorCode);
}

function requireVout(value: unknown, errorCode: string): number {
  const vout = requireSafeInteger(value, errorCode);
  if (vout > 0xffffffff) throw new BitcoinIndexerError(errorCode);

  return vout;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export {
  BitcoinEsploraClient,
  BitcoinIndexerError,
  type BitcoinAddressBalance,
  type BitcoinEsploraAddress,
  type BitcoinEsploraStats,
  type BitcoinEsploraTransaction,
  type BitcoinEsploraTxStatus,
  type BitcoinEsploraUtxo,
  type BitcoinFeeEstimates,
  type BitcoinTransactionQuery,
};
