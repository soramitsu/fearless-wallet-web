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
import { isIrohaI105Address } from '@/util/iroha';
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
  batchEntryIndex: number | null;
  from: string;
  to: string;
};

const BITCOIN_ESPLORA_HISTORY_PAGE_SIZE = 25;
const BITCOIN_HISTORY_ADDRESS_CONCURRENCY = 8;
const BITCOIN_HISTORY_MAX_PAGES = 12;
const MAX_IROHA_PRECISION = 28;
const MAX_IROHA_QUANTITY_DIGITS = 154;
const MAX_IROHA_QUANTITY = (1n << 511n) - 1n;
const MAX_IROHA_DATASPACE_ID = (1n << 64n) - 1n;
const IROHA_HISTORY_PER_PAGE = 100;
const MAX_IROHA_HISTORY_PAGES = 100;
const IROHA_EXPLORER_ASSET_TRANSFER_WIRE_ID = 'iroha_data_model::isi::transfer::TransferBox';
const IROHA_EXPLORER_ASSET_BATCH_WIRE_ID = 'iroha_data_model::isi::transfer::TransferAssetBatch';
const IROHA_TRANSFER_BOX_VARIANTS = new Set(['Asset', 'AssetDefinition', 'Domain', 'Nft']);

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
  const history: HistoryElement[] = [];
  let expectedTotalItems: number | null = null;
  let expectedTotalPages: number | null = null;

  for (let page = 1; page <= MAX_IROHA_HISTORY_PAGES; page += 1) {
    const { body } = await client.getInstructions<unknown>({
      account: address,
      kind: 'Transfer',
      page,
      perPage: IROHA_HISTORY_PER_PAGE,
      transactionStatus: 'committed',
    });
    const parsed = parseIrohaHistoryPage(body, page, IROHA_HISTORY_PER_PAGE);

    if (expectedTotalItems === null) {
      expectedTotalItems = parsed.totalItems;
      expectedTotalPages = parsed.totalPages;
      if (parsed.totalPages > MAX_IROHA_HISTORY_PAGES) throw new Error('iroha_history_page_limit_exceeded');
    } else if (parsed.totalItems !== expectedTotalItems || parsed.totalPages !== expectedTotalPages) {
      throw new Error('iroha_history_pagination_changed');
    }

    for (const item of parsed.items) {
      history.push(...toIrohaHistoryElements(item, address, assetId, precision, network));
    }

    if (page >= parsed.totalPages) break;
  }

  if (new Set(history.map(({ id }) => id)).size !== history.length) {
    throw new Error('duplicate_iroha_history_id');
  }

  return history;
}

function parseIrohaHistoryPage(
  body: unknown,
  requestedPage: number,
  requestedPerPage: number
): { items: unknown[]; totalItems: number; totalPages: number } {
  if (
    !isRecord(body) ||
    !hasExactRecordKeys(body, ['pagination', 'items']) ||
    !Array.isArray(body.items) ||
    !isRecord(body.pagination) ||
    !hasExactRecordKeys(body.pagination, ['page', 'per_page', 'total_pages', 'total_items'])
  ) {
    throw new Error('invalid_iroha_history_response');
  }

  const page = parseSafeInteger(body.pagination.page);
  const perPage = parseSafeInteger(body.pagination.per_page);
  const totalPages = parseSafeInteger(body.pagination.total_pages);
  const totalItems = parseSafeInteger(body.pagination.total_items);

  if (
    page !== requestedPage ||
    perPage !== requestedPerPage ||
    totalPages === undefined ||
    totalItems === undefined ||
    totalPages !== Math.ceil(totalItems / requestedPerPage)
  ) {
    throw new Error('invalid_iroha_history_pagination');
  }

  const start = (requestedPage - 1) * requestedPerPage;
  const expectedItems = start >= totalItems ? 0 : Math.min(requestedPerPage, totalItems - start);

  if (!Number.isSafeInteger(start) || body.items.length !== expectedItems) {
    throw new Error('truncated_iroha_history_page');
  }

  return { items: body.items, totalItems, totalPages };
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

  const { body } = await client.getAssetDefinition<unknown>(assetId);
  const definition = isRecord(body) ? body : undefined;
  const spec = definition && isRecord(definition.spec) ? definition.spec : undefined;
  const scale = spec?.scale;

  if (
    definition?.id !== assetId ||
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

function toIrohaHistoryElements(
  item: unknown,
  address: string,
  assetId: string,
  precision: number,
  network: IrohaNetworkKind
): HistoryElement[] {
  if (!isRecord(item)) throw new Error('invalid_iroha_history_item');
  if (
    !hasExactRecordKeys(item, [
      'authority',
      'created_at',
      'kind',
      'r#box',
      'transaction_hash',
      'transaction_status',
      'block',
      'index',
    ]) ||
    typeof item.authority !== 'string' ||
    !isIrohaI105Address(item.authority, network)
  ) {
    throw new Error('invalid_iroha_history_item');
  }

  const hash = parseCanonicalIrohaHash(
    getCanonicalIrohaHistoryString(item, 'transaction_hash', ['transactionHash', 'hash'])
  );
  const timestamp = parseIrohaTimestamp(
    getCanonicalIrohaHistoryString(item, 'created_at', ['createdAt', 'timestamp'])
  );
  const payload = getIrohaInstructionPayload(item);
  const instructionIndex = parseIrohaInstructionIndex(item.index);
  const blockHeight = parseSafeInteger(item.block);

  if (!hash || !timestamp || instructionIndex === null || blockHeight === undefined || blockHeight < 1) {
    throw new Error('invalid_iroha_history_item');
  }

  const transactionStatus = getCanonicalIrohaHistoryString(item, 'transaction_status', [
    'transactionStatus',
    'status',
  ]);
  if (transactionStatus !== 'Committed') throw new Error('invalid_iroha_history_transaction_status');

  const transfers = parseIrohaTransferPayload(payload, address, assetId, precision, network);
  return transfers.map(({ amount, batchEntryIndex, from, to }) => ({
    address,
    blockHash: hash,
    blockHeight,
    extrinsicHash: hash,
    id:
      batchEntryIndex === null
        ? `${hash}:${instructionIndex}`
        : `${hash}:${instructionIndex}:${batchEntryIndex}`,
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

function getIrohaInstructionPayload(item: Record<string, unknown>): Record<string, unknown> {
  if (item.kind !== 'Transfer') throw new Error('invalid_iroha_instruction_kind');
  const box = item['r#box'];

  if (!isRecord(box) || !hasExactRecordKeys(box, ['encoded', 'framed_sha256', 'json'])) {
    throw new Error('invalid_iroha_instruction_box');
  }

  const json = box.json;

  if (!isRecord(json) || !hasExactRecordKeys(json, ['kind', 'payload', 'wire_id', 'encoded'])) {
    throw new Error('invalid_iroha_instruction_json');
  }
  if (json.kind !== 'Transfer' || typeof json.encoded !== 'string' || !/^(?:[0-9a-f]{2})+$/u.test(json.encoded)) {
    throw new Error('invalid_iroha_instruction_json');
  }
  if (
    box.encoded !== `0x${json.encoded}` ||
    typeof box.framed_sha256 !== 'string' ||
    !/^0x[0-9a-f]{64}$/u.test(box.framed_sha256)
  ) {
    throw new Error('invalid_iroha_instruction_box');
  }

  const payload = json.payload;

  if (!isRecord(payload) || !hasExactRecordKeys(payload, ['variant', 'value'])) {
    throw new Error('invalid_iroha_instruction_payload');
  }
  if (
    typeof payload.variant === 'string' &&
    IROHA_TRANSFER_BOX_VARIANTS.has(payload.variant) &&
    json.wire_id !== IROHA_EXPLORER_ASSET_TRANSFER_WIRE_ID
  ) {
    throw new Error('invalid_iroha_instruction_wire_id');
  }
  if (payload.variant === 'AssetBatch' && json.wire_id !== IROHA_EXPLORER_ASSET_BATCH_WIRE_ID) {
    throw new Error('invalid_iroha_instruction_wire_id');
  }

  return payload;
}

function parseIrohaTransferPayload(
  payload: unknown,
  address: string,
  assetId: string,
  precision: number,
  network: IrohaNetworkKind
): IrohaTransferInstruction[] {
  if (!isRecord(payload)) throw new Error('invalid_iroha_transfer_payload');

  const variant = getRecordString(payload, ['variant']);
  const value = payload.value;

  if (variant === 'Asset') {
    const transfer = parseIrohaAssetTransfer(value, address, assetId, precision, network);

    return transfer ? [transfer] : [];
  }

  if (variant === 'AssetBatch') {
    return parseIrohaAssetBatch(value, address, assetId, precision, network);
  }

  if (variant === 'Domain' || variant === 'AssetDefinition' || variant === 'Nft') {
    validateIrohaNonAssetTransfer(value, variant, address, network);

    return [];
  }

  throw new Error('invalid_iroha_transfer_variant');
}

function validateIrohaNonAssetTransfer(
  value: unknown,
  variant: 'Domain' | 'AssetDefinition' | 'Nft',
  address: string,
  network: IrohaNetworkKind
): void {
  if (!isRecord(value) || !hasExactRecordKeys(value, ['source', 'object', 'destination'])) {
    throw new Error('invalid_iroha_non_asset_transfer');
  }

  const source = getCanonicalRecordString(value, 'source');
  const object = typeof value.object === 'string' && value.object.length > 0 ? value.object : null;
  const destination = getCanonicalRecordString(value, 'destination');
  const validObject =
    variant === 'Domain'
      ? isCanonicalIrohaDomainIdLiteral(object)
      : variant === 'AssetDefinition'
        ? isCanonicalIrohaAssetDefinitionIdLiteral(object)
        : isCanonicalIrohaNftIdLiteral(object);

  if (
    !source ||
    !destination ||
    !isIrohaI105Address(source, network) ||
    !isIrohaI105Address(destination, network) ||
    (!isSameIrohaLiteral(source, address) && !isSameIrohaLiteral(destination, address)) ||
    !validObject
  ) {
    throw new Error('invalid_iroha_non_asset_transfer');
  }
}

function parseIrohaAssetTransfer(
  value: unknown,
  address: string,
  assetId: string,
  precision: number,
  network: IrohaNetworkKind
): IrohaTransferInstruction | null {
  if (!isRecord(value) || !hasExactRecordKeys(value, ['source', 'object', 'destination'])) {
    throw new Error('invalid_iroha_asset_transfer');
  }

  const source = getCanonicalRecordString(value, 'source');
  const destination = getCanonicalRecordString(value, 'destination');
  const quantity = parseCanonicalIrohaQuantity(value.object);
  const sourceParts = source ? parseIrohaAssetIdLiteral(source) : null;
  const sourceAccount = sourceParts?.account ?? null;

  if (!source || !sourceAccount || !destination || !quantity) throw new Error('invalid_iroha_asset_transfer');
  if (sourceParts?.definition !== assetId) return null;
  if (!isIrohaI105Address(sourceAccount, network) || !isIrohaI105Address(destination, network)) {
    throw new Error('invalid_iroha_asset_transfer_account');
  }

  const amount = scaledIrohaIntegerToBaseUnits(quantity.mantissa, quantity.scale, precision);

  if (!amount) throw new Error('invalid_iroha_asset_transfer_amount');

  const isIncoming = isSameIrohaLiteral(destination, address);
  const isOutgoing = isSameIrohaLiteral(sourceAccount, address);

  if (!isIncoming && !isOutgoing) return null;

  return {
    amount,
    batchEntryIndex: null,
    from: isOutgoing ? address : (sourceAccount ?? ''),
    to: isIncoming ? address : destination,
  };
}

function parseIrohaAssetBatch(
  value: unknown,
  address: string,
  assetId: string,
  precision: number,
  network: IrohaNetworkKind
): IrohaTransferInstruction[] {
  if (!isRecord(value) || !hasExactRecordKeys(value, ['mode', 'entries'])) {
    throw new Error('invalid_iroha_asset_batch');
  }
  const mode = value.mode;

  if (
    !isRecord(mode) ||
    !hasExactRecordKeys(mode, ['mode', 'value']) ||
    (mode.mode !== 'Atomic' && mode.mode !== 'Independent') ||
    mode.value !== null
  ) {
    throw new Error('invalid_iroha_asset_batch_mode');
  }
  if (!Array.isArray(value.entries) || value.entries.length === 0) {
    throw new Error('invalid_iroha_asset_batch');
  }

  const transfers: IrohaTransferInstruction[] = [];
  const legIds = new Set<string>();
  const includeTransfers = mode.mode === 'Atomic';

  for (const [entryIndex, entry] of value.entries.entries()) {
    const parsed = parseIrohaAssetBatchEntry(
      entry,
      entryIndex,
      address,
      assetId,
      precision,
      network,
      includeTransfers
    );

    if (!parsed.canonical) throw new Error('invalid_iroha_asset_batch_entry');
    if (parsed.legId === null || legIds.has(parsed.legId)) throw new Error('duplicate_iroha_asset_batch_leg');
    legIds.add(parsed.legId);
    if (parsed.transfer) transfers.push(parsed.transfer);
  }

  return transfers;
}

function parseIrohaAssetBatchEntry(
  value: unknown,
  entryIndex: number,
  address: string,
  assetId: string,
  precision: number,
  network: IrohaNetworkKind,
  includeTransfer: boolean
): { canonical: boolean; legId: string | null; transfer: IrohaTransferInstruction | null } {
  if (!isRecord(value) || !hasExactRecordKeys(value, ['leg_id', 'from', 'to', 'asset_definition', 'amount'])) {
    return { canonical: false, legId: null, transfer: null };
  }

  const legId = getCanonicalIrohaBatchLegId(value.leg_id);
  const from = getCanonicalRecordString(value, 'from');
  const to = getCanonicalRecordString(value, 'to');
  const definition = getCanonicalRecordString(value, 'asset_definition');
  const quantity = parseCanonicalIrohaQuantity(value.amount);

  if (!legId || !from || !to || !isCanonicalIrohaAssetDefinitionIdLiteral(definition) || !quantity) {
    return { canonical: false, legId: null, transfer: null };
  }
  if (!isIrohaI105Address(from, network) || !isIrohaI105Address(to, network)) {
    return { canonical: false, legId: null, transfer: null };
  }
  if (!includeTransfer) return { canonical: true, legId, transfer: null };
  if (definition !== assetId) return { canonical: true, legId, transfer: null };

  const amount = scaledIrohaIntegerToBaseUnits(quantity.mantissa, quantity.scale, precision);

  if (!amount) return { canonical: false, legId: null, transfer: null };

  const isIncoming = isSameIrohaLiteral(to, address);
  const isOutgoing = isSameIrohaLiteral(from, address);

  if (!isIncoming && !isOutgoing) return { canonical: true, legId, transfer: null };

  return {
    canonical: true,
    legId,
    transfer: {
      amount,
      batchEntryIndex: entryIndex,
      from: isOutgoing ? address : from,
      to: isIncoming ? address : to,
    },
  };
}

function parseCanonicalIrohaQuantity(value: unknown): { mantissa: string; scale: number } | null {
  if (typeof value !== 'string' || value !== value.trim() || !/^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u.test(value)) {
    return null;
  }

  const [whole, fraction = ''] = value.split('.');
  const mantissa = `${whole}${fraction}`;

  if (fraction.length > MAX_IROHA_PRECISION || mantissa.length > MAX_IROHA_QUANTITY_DIGITS) return null;
  const quantity = BigInt(mantissa);

  if (quantity <= 0n || quantity > MAX_IROHA_QUANTITY) return null;

  return { mantissa, scale: fraction.length };
}

function scaledIrohaIntegerToBaseUnits(mantissa: string, scale: number, precision: number): string | null {
  if (!Number.isInteger(precision) || precision < 0 || precision > MAX_IROHA_PRECISION) return null;

  const value = BigInt(mantissa);

  if (value <= 0n) return null;
  if (scale < precision) return (value * 10n ** BigInt(precision - scale)).toString();
  if (scale === precision) return value.toString();

  const divisor = 10n ** BigInt(scale - precision);

  if (value % divisor !== 0n) return null;

  return (value / divisor).toString();
}

function parseIrohaTimestamp(value: string | null): string | null {
  const match = value?.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{0,8}[1-9]))?Z$/u
  );

  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = ''] = match;
  const [year, month, day, hour, minute, second] = [
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
  ].map(Number);

  if (year < 1970 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;

  const milliseconds = Number(fraction.padEnd(3, '0').slice(0, 3));
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second, milliseconds);
  const parsed = new Date(timestamp);

  if (
    !Number.isFinite(timestamp) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute ||
    parsed.getUTCSeconds() !== second
  ) {
    return null;
  }

  const seconds = Math.floor(timestamp / SEC1);

  return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds.toString() : null;
}

function parseCanonicalIrohaHash(value: string | null): string | null {
  return value && /^[0-9a-f]{63}[13579bdf]$/u.test(value) ? value : null;
}

function parseIrohaInstructionIndex(value: unknown): number | null {
  const parsed = parseSafeInteger(value);

  return parsed !== undefined && parsed <= 0xffff_ffff ? parsed : null;
}

function parseIrohaAssetIdLiteral(value: string): { account: string; definition: string } | null {
  const parts = value.split('#');

  if (parts.length !== 2 && parts.length !== 3) return null;

  const [definition, account, scope] = parts;

  if (!definition || !account || (scope !== undefined && !isCanonicalIrohaDataspaceScope(scope))) return null;

  return { account, definition };
}

function isCanonicalIrohaDataspaceScope(value: string): boolean {
  const match = value.match(/^dataspace:(0|[1-9]\d*)$/u);

  return Boolean(match && match[1].length <= 20 && BigInt(match[1]) <= MAX_IROHA_DATASPACE_ID);
}

function isCanonicalIrohaAssetDefinitionIdLiteral(value: string | null): boolean {
  return Boolean(value && /^[1-9A-HJ-NP-Za-km-z]{20,64}$/u.test(value));
}

function isCanonicalIrohaDomainIdLiteral(value: string | null): boolean {
  if (!value || value.length > 511 || value !== value.toLowerCase()) return false;

  const labels = value.split('.');

  return (
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length <= 63 && /^(?:[a-z0-9_]|[a-z0-9_][a-z0-9_-]*[a-z0-9_])$/u.test(label)
    )
  );
}

function isCanonicalIrohaNftIdLiteral(value: string | null): boolean {
  if (!value) return false;

  const parts = value.split('$');

  return parts.length === 2 && isCanonicalIrohaName(parts[0]) && isCanonicalIrohaDomainIdLiteral(parts[1]);
}

function isCanonicalIrohaName(value: string): boolean {
  return (
    value.length > 0 &&
    new TextEncoder().encode(value).length <= 255 &&
    value.normalize('NFC') === value &&
    !/[@#$]/u.test(value) &&
    !Array.from(value).some((character) => {
      const code = character.charCodeAt(0);

      return (
        isRustWhitespace(character) ||
        code <= 0x1f ||
        (code >= 0x7f && code <= 0x9f) ||
        code === 0x061c ||
        code === 0x200e ||
        code === 0x200f ||
        (code >= 0x202a && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069)
      );
    })
  );
}

function getCanonicalIrohaBatchLegId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;

  const characters = Array.from(value);

  return isRustWhitespace(characters[0]) || isRustWhitespace(characters[characters.length - 1]) ? null : value;
}

function isRustWhitespace(value: string): boolean {
  const code = value.codePointAt(0) ?? -1;

  return (
    (code >= 0x0009 && code <= 0x000d) ||
    code === 0x0020 ||
    code === 0x0085 ||
    code === 0x00a0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000
  );
}

function getRecordString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim().length > 0) return value;
  }

  return null;
}

function getCanonicalRecordString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];

  return typeof value === 'string' && value.length > 0 && value === value.trim() ? value : null;
}

function hasExactRecordKeys(record: Record<string, unknown>, keys: string[]): boolean {
  const actualKeys = Object.keys(record);

  return actualKeys.length === keys.length && keys.every((key) => Object.hasOwn(record, key));
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
