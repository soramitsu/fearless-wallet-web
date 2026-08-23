import axios from 'axios';
import { FPNumber } from '@sora-substrate/util';
import { formatEther, formatUnits } from 'ethers';
import {
  SolanaIndexerClient,
  type SolanaWalletTransactionRecord,
} from '@extension-base/services/solana-indexer-service';
import { BitcoinEsploraClient, type BitcoinEsploraTransaction } from '@extension-base/services/bitcoin-indexer-service';
import { IrohaToriiWalletClient } from '@extension-base/services/iroha-torii-service';
import type {
  SubqueryHistory,
  GiantsquidHistoryItem,
  HistoryElement,
  HistoryServiceType,
  NetworkName,
  EthereumHistoryResponse,
  EthereumTokenHistoryData,
  SoraHistoryElement,
  X1HistoryElement,
  ZetaHistory,
} from '@/interfaces';
import { isBitcoinAddress, type BitcoinNetworkKind } from '@/util/bitcoin';
import BaseApi from '@/util/BaseApi';
import { getEthereumExplorerApiKey } from '@/helpers/history';
import { SEC1 } from '@/consts/time';
import { UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';
import {
  computedGiantSquidRequest,
  computedSoraRequest,
  computedSubqueryRequest,
  computedSubsquidRequest,
} from '@/history/requests';

type BitcoinParsedOutput = {
  address: string;
  value: number;
};

type IrohaNetworkKind = 'taira' | 'nexus';

type IrohaTransferInstruction = {
  amount: string;
  from: string;
  to: string;
};

const BITCOIN_ESPLORA_HISTORY_PAGE_SIZE = 25;
const BITCOIN_HISTORY_ADDRESS_CONCURRENCY = 8;
const BITCOIN_HISTORY_MAX_PAGES = 12;
const MAX_IROHA_PRECISION = 28;
const MAX_IROHA_QUANTITY_DIGITS = 256;

async function fetchSubqueryHistory(
  url: string,
  address: string,
  pageSize = 100,
  cursor: string | null = null
): Promise<SubqueryHistory> {
  const res = await axios
    .post(url, { query: computedSubqueryRequest(cursor, pageSize, address) })
    .catch((e) => console.info(e));

  if (res && res.data) return res.data?.historyElements;

  return { nodes: [], timestamp: Date.now(), pageInfo: { startCursor: '0', endCursor: '0' } };
}

async function fetchGiantsquidHistory(url: string, address: string): Promise<GiantsquidHistoryItem[]> {
  const {
    data: { data },
  } = await axios.post(url, { query: computedGiantSquidRequest(address) }).catch(() => {
    return {
      data: { transfers: [] },
    };
  });

  return data?.transfers;
}

async function fetchSubsquidHistory(url: string, address: string): Promise<HistoryElement[]> {
  const {
    data: { data },
  } = await axios.post(url, { query: computedSubsquidRequest(address) }).catch(() => {
    return {
      data: { historyElements: [], timestamp: Date.now() },
    };
  });

  return data?.historyElements;
}

async function fetchEthereumHistory(url: string, address: string, contractAddress?: string): Promise<HistoryElement[]> {
  const abort = new AbortController();
  const signal = abort.signal;
  const apikey = getEthereumExplorerApiKey(url);
  const params: Record<string, unknown> = {
    module: 'account',
    action: contractAddress ? 'tokentx' : 'txlist',
    contractAddress: contractAddress,
    address,
    page: 1,
    offset: 300,
    sort: 'desc',
  };

  if (!url.includes('optimistic')) {
    params.apikey = apikey;
  }

  const res = await axios.get<EthereumHistoryResponse<EthereumTokenHistoryData>>(url, {
    params,
    signal,
  });

  if (res.status !== 200) {
    abort.abort();

    return [];
  }

  return res.data.result.map(({ timeStamp, value: amount, gasUsed: fee, gasPrice, from, to, hash }, index) => {
    const calcFee = new FPNumber(formatUnits(fee, 'gwei'))
      .mul(new FPNumber(formatUnits(gasPrice, 'gwei')))
      .toCodecString();

    return {
      address,
      id: String(index),
      timestamp: (+timeStamp * SEC1).toString(),
      success: true,
      blockHash: hash,
      transfer: {
        amount,
        fee: formatEther(calcFee),
        from,
        to,
      },
    };
  });
}

export async function fetchX1History(url: string, address: string): Promise<HistoryElement[]> {
  const prepUrl = `${url}&address=${address}`;
  const headers = { 'OK-ACCESS-KEY': process.env.VUE_APP_FL_WEB_X1_TESTNET_API_KEY };
  const res = await axios.get<X1HistoryElement>(prepUrl, { headers });
  const result: HistoryElement[] = [];

  res.data.data[0].transactionLists.forEach((el, index) => {
    result.push({
      address,
      id: String(index),
      timestamp: (new Date(+el.transactionTime).getTime() / 1000).toString(),
      success: el.state === 'success',
      blockHash: el.txId,
      transfer: {
        amount: el.amount,
        from: el.from,
        to: el.to,
        fee: el.txFee,
      },
    });
  });

  return result;
}

async function fetchSoraHistory(url: string, address: string) {
  const {
    data: { data },
  } = await axios.post<{ data: { historyElements: SoraHistoryElement[] } }>(url, {
    query: computedSoraRequest(address),
  });

  return data?.historyElements;
}

async function fetchZetaHistory(url: string, address: string) {
  const prepUrl = `${url}${address}/transactions`;
  const headers = { 'OK-ACCESS-KEY': process.env.VUE_APP_FL_WEB_X1_TESTNET_API_KEY };
  const res = await axios.get<ZetaHistory>(prepUrl, { headers });
  const result: HistoryElement[] = [];

  res.data.items.forEach((el, index) => {
    result.push({
      address,
      id: String(index),
      timestamp: (new Date(el.timestamp).getTime() / 1000).toString(), //to seconds
      success: el.status === 'ok',
      blockHash: el.hash,
      transfer: {
        amount: el.value,
        from: el.from.hash,
        to: el.to.hash,
        fee: el.fee.value,
      },
    });
  });

  return result;
}

async function fetchSolanaHistory(
  url: string,
  address: string,
  assetId: string,
  isUtility: boolean
): Promise<HistoryElement[]> {
  const client = new SolanaIndexerClient(url);

  await client.verifyServiceInfo();

  const { transactions } = await client.getTransactions(address, { limit: 100 });

  return transactions.reduce<HistoryElement[]>((result, transaction) => {
    const historyElement = toSolanaHistoryElement(transaction, address, assetId, isUtility);

    if (historyElement) result.push(historyElement);

    return result;
  }, []);
}

function toSolanaHistoryElement(
  transaction: SolanaWalletTransactionRecord,
  address: string,
  assetId: string,
  isUtility: boolean
): HistoryElement | null {
  const amount = getSolanaTransactionAmount(transaction, assetId, isUtility);

  if (!amount) return null;

  const isOutgoing = amount.startsWith('-');
  const absoluteAmount = getAbsoluteIntegerString(amount);

  return {
    address,
    blockHash: transaction.signature,
    extrinsicHash: transaction.signature,
    id: transaction.signature,
    success: transaction.status === 'success',
    timestamp: transaction.timestamp.toString(),
    transfer: {
      amount: absoluteAmount,
      fee: transaction.feeLamports ?? '0',
      from: isOutgoing ? address : '',
      to: isOutgoing ? '' : address,
    },
  };
}

function getSolanaTransactionAmount(
  transaction: SolanaWalletTransactionRecord,
  assetId: string,
  isUtility: boolean
): string | null {
  if (isUtility) return normalizeSolanaAmountDelta(transaction.nativeBalanceChangeLamports);

  const tokenDelta = transaction.tokenBalanceChanges.reduce<bigint | null>((result, { mint, amountDelta }) => {
    if (mint !== assetId) return result;

    const delta = toBigIntOrNull(amountDelta);

    if (delta === null) return result;

    return (result ?? 0n) + delta;
  }, null);

  if (tokenDelta === null || tokenDelta === 0n) return null;

  return tokenDelta.toString();
}

function normalizeSolanaAmountDelta(value: string | null | undefined): string | null {
  const amount = toBigIntOrNull(value);

  if (amount === null || amount === 0n) return null;

  return amount.toString();
}

function getAbsoluteIntegerString(value: string): string {
  const amount = BigInt(value);

  return (amount < 0n ? -amount : amount).toString();
}

function toBigIntOrNull(value: string | null | undefined): bigint | null {
  if (value == null) return null;

  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

async function fetchBitcoinHistory(
  url: string,
  addresses: readonly string[],
  networkName: NetworkName,
  assetId: string,
  isUtility: boolean
): Promise<HistoryElement[]> {
  if (!isUtility || assetId !== 'BTC') return [];

  const network = getBitcoinNetworkKind(networkName);
  const normalizedAddresses = Array.from(new Set(addresses.map((address) => address.toLowerCase())));

  if (!normalizedAddresses.length || normalizedAddresses.some((address) => !isBitcoinAddress(address, network)))
    return [];
  if (normalizedAddresses.length > 2_000) throw new Error('too_many_bitcoin_history_addresses');

  const client = new BitcoinEsploraClient({ baseUrl: url, network });
  const transactionPages = await fetchBitcoinAddressTransactionPages(client, normalizedAddresses);
  const transactions = Array.from(
    transactionPages
      .reduce<Map<string, BitcoinEsploraTransaction>>((result, page) => {
        page.forEach((transaction) => {
          const existing = result.get(transaction.txid);

          if (existing && JSON.stringify(existing) !== JSON.stringify(transaction)) {
            throw new Error('bitcoin_history_transaction_mismatch');
          }

          result.set(transaction.txid, transaction);
        });

        return result;
      }, new Map())
      .values()
  ).sort((left, right) => (right.status.block_time ?? 0) - (left.status.block_time ?? 0));

  return transactions.reduce<HistoryElement[]>((result, transaction) => {
    const historyElement = toBitcoinHistoryElement(transaction, normalizedAddresses);

    if (historyElement) result.push(historyElement);

    return result;
  }, []);
}

async function fetchBitcoinAddressTransactionPages(
  client: BitcoinEsploraClient,
  addresses: readonly string[]
): Promise<BitcoinEsploraTransaction[][]> {
  const transactionPages: BitcoinEsploraTransaction[][] = [];

  for (let offset = 0; offset < addresses.length; offset += BITCOIN_HISTORY_ADDRESS_CONCURRENCY) {
    const batch = addresses.slice(offset, offset + BITCOIN_HISTORY_ADDRESS_CONCURRENCY);

    transactionPages.push(
      ...(await Promise.all(batch.map((address) => fetchBitcoinTransactionPages(client, address))))
    );
  }

  return transactionPages;
}

async function fetchBitcoinTransactionPages(
  client: BitcoinEsploraClient,
  address: string
): Promise<BitcoinEsploraTransaction[]> {
  const transactions: BitcoinEsploraTransaction[] = [];
  const seenTxids = new Set<string>();
  const seenCursors = new Set<string>();
  let lastSeenTxid: string | null = null;

  for (let pageIndex = 0; pageIndex < BITCOIN_HISTORY_MAX_PAGES; pageIndex++) {
    const page = await client.getTransactions(address, lastSeenTxid ? { lastSeenTxid } : undefined);

    if (page.length === 0) break;

    let hasNewTransaction = false;

    page.forEach((transaction) => {
      if (seenTxids.has(transaction.txid)) return;

      seenTxids.add(transaction.txid);
      transactions.push(transaction);
      hasNewTransaction = true;
    });

    if (page.length < BITCOIN_ESPLORA_HISTORY_PAGE_SIZE) break;

    const nextCursor = page[page.length - 1]?.txid ?? null;

    if (!nextCursor || seenCursors.has(nextCursor) || nextCursor === lastSeenTxid || !hasNewTransaction) break;

    seenCursors.add(nextCursor);
    lastSeenTxid = nextCursor;
  }

  return transactions;
}

function toBitcoinHistoryElement(
  transaction: BitcoinEsploraTransaction,
  addresses: readonly string[]
): HistoryElement | null {
  const address = addresses[0];
  const walletAddresses = new Set(addresses.map((walletAddress) => walletAddress.toLowerCase()));
  const inputs = getBitcoinInputPrevouts(transaction);
  const outputs = getBitcoinOutputs(transaction);
  const sent = sumBitcoinValues(inputs, ({ address }) => walletAddresses.has(address.toLowerCase()));
  const received = sumBitcoinValues(outputs, ({ address }) => walletAddresses.has(address.toLowerCase()));

  if (sent === null || received === null || (sent === 0 && received === 0)) return null;

  const isOutgoing = sent > 0;
  const fee = transaction.fee ?? 0;
  const amount = isOutgoing ? sent - received - fee : received;

  if (!Number.isSafeInteger(fee) || fee < 0 || !Number.isSafeInteger(amount) || amount <= 0) return null;

  const counterparty = isOutgoing
    ? outputs.find((output) => !walletAddresses.has(output.address.toLowerCase()) && output.value > 0)?.address
    : inputs.find((input) => !walletAddresses.has(input.address.toLowerCase()) && input.value > 0)?.address;

  return {
    address,
    blockHash: transaction.status.block_hash ?? transaction.txid,
    blockHeight: transaction.status.block_height,
    extrinsicHash: transaction.txid,
    id: transaction.txid,
    success: true,
    timestamp: (transaction.status.block_time ?? 0).toString(),
    transfer: {
      amount: amount.toString(),
      fee: isOutgoing ? fee.toString() : '0',
      from: isOutgoing ? address : (counterparty ?? ''),
      to: isOutgoing ? (counterparty ?? '') : address,
    },
  };
}

function getBitcoinNetworkKind(networkName: NetworkName): BitcoinNetworkKind {
  return networkName.toLowerCase().includes('testnet') ? 'testnet' : 'mainnet';
}

function getBitcoinInputPrevouts(transaction: BitcoinEsploraTransaction): BitcoinParsedOutput[] {
  return (transaction.vin ?? []).reduce<BitcoinParsedOutput[]>((result, input) => {
    if (!isRecord(input)) return result;

    const prevout = parseBitcoinOutput(input.prevout);

    if (prevout) result.push(prevout);

    return result;
  }, []);
}

function getBitcoinOutputs(transaction: BitcoinEsploraTransaction): BitcoinParsedOutput[] {
  return (transaction.vout ?? []).reduce<BitcoinParsedOutput[]>((result, output) => {
    const parsed = parseBitcoinOutput(output);

    if (parsed) result.push(parsed);

    return result;
  }, []);
}

function parseBitcoinOutput(value: unknown): BitcoinParsedOutput | null {
  if (!isRecord(value)) return null;

  const address = value.scriptpubkey_address;
  const amount = value.value;

  if (typeof address !== 'string' || !address) return null;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0) return null;

  return { address, value: amount };
}

function sumBitcoinValues(
  outputs: BitcoinParsedOutput[],
  predicate: (output: BitcoinParsedOutput) => boolean
): number | null {
  return outputs.reduce<number | null>((result, output) => {
    if (result === null || !predicate(output)) return result;
    if (result > Number.MAX_SAFE_INTEGER - output.value) return null;

    return result + output.value;
  }, 0);
}

async function fetchIrohaHistory(
  url: string,
  address: string,
  chainId: string | undefined,
  assetId: string,
  isUtility: boolean
): Promise<HistoryElement[]> {
  if (!isUtility && !assetId) return [];

  const network = getIrohaNetworkKind(chainId);
  const baseUrl = getIrohaHistoryBaseUrl(url, network);

  if (!baseUrl) return [];

  const client = new IrohaToriiWalletClient({ baseUrl, network });
  const precision = await validateIrohaHistoryAssetDefinition(client, network, assetId, isUtility);
  const { body } = await client.getInstructions<{ items?: unknown[] }>({
    account: address,
    assetId,
    kind: 'Transfer',
    page: 0,
    perPage: 100,
    transactionStatus: 'committed',
  });
  if (!isRecord(body) || !Array.isArray(body.items)) {
    throw new Error('invalid_iroha_history_response');
  }
  const items = body.items;

  return items.reduce<HistoryElement[]>((result, item) => {
    result.push(...toIrohaHistoryElements(item, address, assetId, precision));

    return result;
  }, []);
}

async function validateIrohaHistoryAssetDefinition(
  client: IrohaToriiWalletClient,
  network: IrohaNetworkKind,
  assetId: string,
  isUtility: boolean
): Promise<number> {
  const nativeAsset = network === 'taira' ? UNIVERSAL_WALLET_IROHA_NETWORKS.taira.nativeAsset : undefined;

  if (network === 'taira' && isUtility && assetId !== nativeAsset?.id) {
    throw new Error('iroha_taira_native_asset_id_mismatch');
  }

  const { body } = await client.getAssetDefinitions<{ has_more?: boolean; hasMore?: boolean; items?: unknown[] }>({
    assetId,
    limit: 2,
    offset: 0,
  });
  const items = isRecord(body) && Array.isArray(body.items) ? body.items : [];
  const definitions = items.filter((item): item is Record<string, unknown> => isRecord(item) && item.id === assetId);
  const definition = definitions[0];
  const spec = definition && isRecord(definition.spec) ? definition.spec : undefined;
  const scale = spec?.scale;
  const hasMore = isRecord(body) ? (body.has_more ?? body.hasMore) : undefined;

  if (
    hasMore !== false ||
    items.length !== 1 ||
    definitions.length !== 1 ||
    typeof scale !== 'number' ||
    !Number.isInteger(scale) ||
    scale < 0 ||
    scale > MAX_IROHA_PRECISION ||
    (nativeAsset?.id === assetId && scale !== nativeAsset.decimals)
  ) {
    throw new Error('iroha_asset_definition_mismatch');
  }

  return scale;
}

function toIrohaHistoryElements(item: unknown, address: string, assetId: string, precision: number): HistoryElement[] {
  if (!isRecord(item)) return [];

  const hash = getCanonicalIrohaHistoryString(item, 'transaction_hash', ['transactionHash', 'hash']);
  const timestamp = parseIrohaTimestamp(
    getCanonicalIrohaHistoryString(item, 'created_at', ['createdAt', 'timestamp'])
  );
  const payload = getIrohaInstructionPayload(item);

  if (!hash || !timestamp || !payload) return [];

  const transactionStatus = getCanonicalIrohaHistoryString(item, 'transaction_status', [
    'transactionStatus',
    'status',
  ]);
  if (transactionStatus !== 'Committed') throw new Error('invalid_iroha_history_transaction_status');

  const transfers = parseIrohaTransferPayload(payload, address, assetId, precision);
  const blockHeight = parseSafeInteger(item.block);

  return transfers.map(({ amount, from, to }, index) => ({
    address,
    blockHash: hash,
    blockHeight,
    extrinsicHash: hash,
    id: transfers.length === 1 ? hash : `${hash}:${index}`,
    success: true,
    timestamp,
    transfer: {
      amount,
      fee: null,
      from,
      to,
    },
  }));
}

function getIrohaInstructionPayload(item: Record<string, unknown>): unknown {
  const box = item.box;

  if (!isRecord(box)) return null;

  const json = box.json;

  if (!isRecord(json)) return null;

  return json.payload;
}

function parseIrohaTransferPayload(
  payload: unknown,
  address: string,
  assetId: string,
  precision: number
): IrohaTransferInstruction[] {
  if (!isRecord(payload)) return [];

  const variant = getRecordString(payload, ['variant']);
  const value = payload.value;

  if (variant === 'Asset') {
    const transfer = parseIrohaAssetTransfer(value, address, assetId, precision);

    return transfer ? [transfer] : [];
  }

  if (variant === 'AssetBatch') {
    const entries = getIrohaBatchEntries(value);

    return entries.reduce<IrohaTransferInstruction[]>((result, entry) => {
      const transfer = parseIrohaAssetTransfer(entry, address, assetId, precision);

      if (transfer) result.push(transfer);

      return result;
    }, []);
  }

  return [];
}

function parseIrohaAssetTransfer(
  value: unknown,
  address: string,
  assetId: string,
  precision: number
): IrohaTransferInstruction | null {
  if (!isRecord(value)) return null;

  const source = getRecordString(value, ['source', 'source_id', 'asset', 'asset_id']);
  const destination = getRecordString(value, ['destination', 'destination_id', 'to', 'account_id']);
  const amount = normalizeIrohaAmount(value.object ?? value.amount ?? value.quantity ?? value.value, precision);

  if (!destination || !amount) return null;
  if (source && assetId && !irohaAssetMatches(source, assetId)) return null;

  const sourceAccount =
    getRecordString(value, ['source_account', 'from', 'account']) ?? extractIrohaAssetAccount(source);
  const isIncoming = isSameIrohaLiteral(destination, address);
  const isOutgoing = isSameIrohaLiteral(sourceAccount, address);

  if (!isIncoming && !isOutgoing) return null;

  return {
    amount,
    from: isOutgoing ? address : (sourceAccount ?? ''),
    to: isIncoming ? address : destination,
  };
}

function getIrohaBatchEntries(value: unknown): unknown[] {
  if (!isRecord(value)) return [];

  for (const key of ['entries', 'transfers', 'items']) {
    const candidate = value[key];

    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function normalizeIrohaAmount(value: unknown, precision: number): string | null {
  if (!Number.isInteger(precision) || precision < 0 || precision > MAX_IROHA_PRECISION) return null;

  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0
      ? decimalIrohaQuantityToBaseUnits(value.toString(), precision)
      : null;
  }

  if (typeof value === 'string') {
    return decimalIrohaQuantityToBaseUnits(value, precision);
  }

  if (isRecord(value)) {
    const scale = value.scale;
    const amount = value.value ?? value.amount ?? value.mantissa;

    if (scale === undefined) return normalizeIrohaAmount(amount, precision);

    return normalizeIrohaScaledAmount(amount, scale, precision);
  }

  return null;
}

function normalizeIrohaScaledAmount(amount: unknown, scaleValue: unknown, precision: number): string | null {
  const scale =
    typeof scaleValue === 'string' && /^(?:0|[1-9]\d*)$/u.test(scaleValue) ? Number(scaleValue) : scaleValue;
  const mantissa = typeof amount === 'number' && Number.isSafeInteger(amount) ? amount.toString() : amount;

  if (
    typeof scale !== 'number' ||
    !Number.isInteger(scale) ||
    scale < 0 ||
    scale > MAX_IROHA_PRECISION ||
    typeof mantissa !== 'string' ||
    !/^[1-9]\d*$/u.test(mantissa) ||
    mantissa.length > MAX_IROHA_QUANTITY_DIGITS
  ) {
    return null;
  }

  return scaledIrohaIntegerToBaseUnits(mantissa, scale, precision);
}

function decimalIrohaQuantityToBaseUnits(value: string, precision: number): string | null {
  if (value !== value.trim() || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) return null;

  const [whole, fraction = ''] = value.split('.');
  const mantissa = `${whole}${fraction}`;

  if (mantissa.length > MAX_IROHA_QUANTITY_DIGITS) return null;

  return scaledIrohaIntegerToBaseUnits(mantissa, fraction.length, precision);
}

function scaledIrohaIntegerToBaseUnits(mantissa: string, scale: number, precision: number): string | null {
  const value = BigInt(mantissa);

  if (value <= 0n) return null;
  if (scale < precision) return (value * 10n ** BigInt(precision - scale)).toString();
  if (scale === precision) return value.toString();

  const divisor = 10n ** BigInt(scale - precision);

  if (value % divisor !== 0n) return null;

  return (value / divisor).toString();
}

function irohaAssetMatches(source: string, assetId: string): boolean {
  return source === assetId || source.startsWith(`${assetId}#`);
}

function extractIrohaAssetAccount(source: string | null): string | null {
  if (!source) return null;

  const separatorIndex = source.lastIndexOf('#');

  if (separatorIndex < 0 || separatorIndex === source.length - 1) return null;

  return source.slice(separatorIndex + 1);
}

function parseIrohaTimestamp(value: string | null): string | null {
  if (!value) return null;

  if (/^\d+$/u.test(value)) return value;

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) return null;

  return Math.floor(timestamp / SEC1).toString();
}

function getRecordString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim().length > 0) return value;
  }

  return null;
}

function getCanonicalIrohaHistoryString(
  record: Record<string, unknown>,
  canonicalKey: string,
  aliases: string[]
): string | null {
  if (aliases.some((alias) => Object.hasOwn(record, alias))) {
    throw new Error('noncanonical_iroha_history_field');
  }

  const value = record[canonicalKey];

  return typeof value === 'string' && value.length > 0 && value === value.trim() ? value : null;
}

function parseSafeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function isSameIrohaLiteral(left: string | null | undefined, right: string): boolean {
  return typeof left === 'string' && left === right;
}

function getIrohaNetworkKind(chainId: string | undefined): IrohaNetworkKind {
  if (chainId === UNIVERSAL_WALLET_IROHA_NETWORKS.taira.chainId) return 'taira';
  if (chainId === UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.chainId) return 'nexus';

  throw new Error(`unsupported_iroha_chain_id:${chainId ?? 'missing'}`);
}

function getIrohaHistoryBaseUrl(url: string, network: IrohaNetworkKind): string | null {
  if (url.trim()) return url;

  return UNIVERSAL_WALLET_IROHA_NETWORKS[network].toriiBaseUrl;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function fetchHistory(
  url: string,
  address: string,
  type: HistoryServiceType,
  networkName: NetworkName,
  assetId: string,
  isUtility: boolean,
  bitcoinAddresses?: readonly string[],
  networkChainId?: string
) {
  try {
    if (type === 'ton') {
      const { getHistory } = await import('@/extension/messaging');

      return await getHistory(address, networkName);
    }

    if (type === 'sora') return await fetchSoraHistory(url, address);

    if (type === 'oklink') return await fetchX1History(url, address);

    if (type === 'zeta') return await fetchZetaHistory(url, address);

    if (type === 'solana') return await fetchSolanaHistory(url, address, assetId, isUtility);

    if (type === 'bitcoin') {
      return await fetchBitcoinHistory(
        url,
        bitcoinAddresses?.length ? bitcoinAddresses : [address],
        networkName,
        assetId,
        isUtility
      );
    }

    if (type === 'iroha') return await fetchIrohaHistory(url, address, networkChainId, assetId, isUtility);

    if (type === 'subquery') return await fetchSubqueryHistory(url, address);

    if (type === 'subsquid') return await fetchSubsquidHistory(url, address);

    if (type === 'giantsquid') {
      const formattedAddress = BaseApi.isEthereumNetwork(networkName) ? address.toLowerCase() : address;

      return await fetchGiantsquidHistory(url, formattedAddress);
    }

    if (type === 'etherscan') {
      const contractAddress = isUtility ? undefined : assetId;

      return await fetchEthereumHistory(url, address, contractAddress);
    }

    return [];
  } catch (error) {
    console.info(
      `%c failed to load history for [[${networkName}]]-[[${address}]] `,
      'background:orange;color:#fff',
      error
    );

    if (type === 'bitcoin' || type === 'iroha') return undefined;

    return [];
  }
}
