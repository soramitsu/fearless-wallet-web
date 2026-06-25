import {
  BitcoinEsploraClient,
  type BitcoinEsploraUtxo,
  type BitcoinFeeEstimates,
} from '@extension-base/services/bitcoin-indexer-service';

import { isBitcoinAddress } from '@/util/bitcoin';
import { type BitcoinDerivationNetwork } from '@/util/bitcoinKeyring';
import {
  BITCOIN_P2WPKH_DUST_SAT,
  buildBitcoinP2wpkhTransaction,
  estimateP2wpkhTransactionVSize,
  type BitcoinUtxo,
  type BuildBitcoinTransactionResult,
} from '@/util/bitcoinTransaction';

const DEFAULT_FEE_TARGET_BLOCKS = 2;
const DEFAULT_MAX_INPUTS = 100;
const MAX_FEE_TARGET_BLOCKS = 1008;
const MAX_SATOSHI = 2_100_000_000_000_000;

type BitcoinSendClient = Pick<BitcoinEsploraClient, 'broadcastTransaction' | 'getFeeEstimates' | 'getUtxos'>;

type BitcoinSendSource = {
  address: string;
  derivationPath?: string;
};

type BitcoinOutpoint = {
  txid: string;
  vout: number;
};

type PrepareBitcoinSendParams = {
  amountSat: number;
  changeAddress?: string;
  client?: BitcoinSendClient;
  feeRateSatPerVbyte?: number;
  feeTargetBlocks?: number;
  includeUnconfirmed?: boolean;
  maxInputs?: number;
  mnemonicOrSeed: string;
  network?: BitcoinDerivationNetwork;
  selectedOutpoints?: BitcoinOutpoint[];
  sources: BitcoinSendSource[];
  toAddress: string;
};

type SendBitcoinTransactionParams = PrepareBitcoinSendParams;

type BitcoinPreparedSend = BuildBitcoinTransactionResult & {
  absorbedDustSat: number;
  amountSat: number;
  changeAddress?: string;
  feeRateSatPerVbyte: number;
  feeTargetBlocks?: number;
  network: BitcoinDerivationNetwork;
  recipientAddress: string;
  selectedUtxos: BitcoinUtxo[];
  sourceAddresses: string[];
};

type BitcoinSendResult = BitcoinPreparedSend & {
  broadcastTxid: string;
};

type CoinSelectionResult = {
  absorbedDustSat: number;
  changeAddress?: string;
  fee: number;
  selectedUtxos: BitcoinUtxo[];
};

export class BitcoinSendError extends Error {
  constructor(
    readonly code: string,
    message: string = code,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'BitcoinSendError';
  }
}

export async function prepareBitcoinSend({
  amountSat,
  changeAddress,
  client,
  feeRateSatPerVbyte,
  feeTargetBlocks = DEFAULT_FEE_TARGET_BLOCKS,
  includeUnconfirmed = false,
  maxInputs = DEFAULT_MAX_INPUTS,
  mnemonicOrSeed,
  network = 'mainnet',
  selectedOutpoints,
  sources,
  toAddress,
}: PrepareBitcoinSendParams): Promise<BitcoinPreparedSend> {
  const normalizedNetwork = normalizeNetwork(network);
  const normalizedSources = normalizeSources(sources, normalizedNetwork);
  const normalizedAmount = normalizeSatoshiAmount(amountSat, 'invalid_amount');
  if (normalizedAmount < BITCOIN_P2WPKH_DUST_SAT) throw new BitcoinSendError('amount_below_dust');
  if (!mnemonicOrSeed.trim()) throw new BitcoinSendError('mnemonic_required');
  if (!isBitcoinAddress(toAddress, normalizedNetwork)) throw new BitcoinSendError('invalid_recipient_address');

  const normalizedChangeAddress = changeAddress ?? normalizedSources[0].address;
  if (!isBitcoinAddress(normalizedChangeAddress, normalizedNetwork)) {
    throw new BitcoinSendError('invalid_change_address');
  }

  const normalizedFeeTargetBlocks = normalizeFeeTargetBlocks(feeTargetBlocks);
  const maxSelectedInputs = normalizeMaxInputs(maxInputs);
  const indexer = client ?? new BitcoinEsploraClient({ network: normalizedNetwork });
  const resolvedFeeRate = feeRateSatPerVbyte ?? await fetchFeeRate(indexer, normalizedFeeTargetBlocks);
  validateFeeRate(resolvedFeeRate);

  const selectedOutpointKeys = normalizeSelectedOutpoints(selectedOutpoints);
  const fetchedUtxos = await fetchSpendableUtxos(
    indexer,
    normalizedSources,
    includeUnconfirmed,
    selectedOutpointKeys !== undefined
  );
  const utxos = applySelectedOutpoints(fetchedUtxos, selectedOutpointKeys);
  const selection = selectBitcoinUtxos({
    amountSat: normalizedAmount,
    changeAddress: normalizedChangeAddress,
    feeRateSatPerVbyte: resolvedFeeRate,
    maxInputs: maxSelectedInputs,
    spendAll: selectedOutpointKeys !== undefined,
    utxos,
  });
  const built = buildBitcoinP2wpkhTransaction({
    changeAddress: selection.changeAddress,
    feeSat: selection.fee,
    inputs: selection.selectedUtxos,
    mnemonicOrSeed,
    network: normalizedNetwork,
    outputs: [{ address: toAddress, value: normalizedAmount }],
  });

  return {
    ...built,
    absorbedDustSat: selection.absorbedDustSat,
    amountSat: normalizedAmount,
    changeAddress: selection.changeAddress,
    feeRateSatPerVbyte: resolvedFeeRate,
    feeTargetBlocks: feeRateSatPerVbyte === undefined ? normalizedFeeTargetBlocks : undefined,
    network: normalizedNetwork,
    recipientAddress: toAddress,
    selectedUtxos: selection.selectedUtxos,
    sourceAddresses: normalizedSources.map(({ address }) => address),
  };
}

export async function sendBitcoinTransaction(params: SendBitcoinTransactionParams): Promise<BitcoinSendResult> {
  const network = normalizeNetwork(params.network ?? 'mainnet');
  const client = params.client ?? new BitcoinEsploraClient({ network });
  const prepared = await prepareBitcoinSend({ ...params, client, network });
  const broadcastTxid = await client.broadcastTransaction(prepared.txHex);

  if (broadcastTxid !== prepared.txid) throw new BitcoinSendError('broadcast_txid_mismatch');

  return {
    ...prepared,
    broadcastTxid,
  };
}

export function selectBitcoinFeeRateSatPerVbyte(
  estimates: BitcoinFeeEstimates,
  targetBlocks = DEFAULT_FEE_TARGET_BLOCKS
): number {
  const target = normalizeFeeTargetBlocks(targetBlocks);
  const entries = Object.entries(estimates)
    .map(([blocks, feeRate]) => [Number(blocks), feeRate] as const)
    .filter(([blocks, feeRate]) => Number.isInteger(blocks) && blocks > 0 && Number.isFinite(feeRate) && feeRate > 0)
    .sort(([left], [right]) => left - right);

  if (entries.length === 0) throw new BitcoinSendError('fee_estimates_unavailable');

  const selected = entries.find(([blocks]) => blocks >= target) ?? entries.at(-1);
  if (!selected) throw new BitcoinSendError('fee_estimates_unavailable');

  validateFeeRate(selected[1]);

  return selected[1];
}

async function fetchFeeRate(
  client: BitcoinSendClient,
  feeTargetBlocks: number
): Promise<number> {
  return selectBitcoinFeeRateSatPerVbyte(await client.getFeeEstimates(), feeTargetBlocks);
}

async function fetchSpendableUtxos(
  client: BitcoinSendClient,
  sources: BitcoinSendSource[],
  includeUnconfirmed: boolean,
  allowEmpty = false
): Promise<BitcoinUtxo[]> {
  const results = await Promise.all(
    sources.map(async (source) => {
      const utxos = await client.getUtxos(source.address);

      return utxos.map((utxo) => normalizeSpendableUtxo(utxo, source));
    })
  );
  const spendable = results.flat().filter((utxo) => includeUnconfirmed || utxo.status?.confirmed);

  if (spendable.length === 0 && !allowEmpty) throw new BitcoinSendError('no_spendable_utxos');

  return spendable.map(({ status: _status, ...utxo }) => utxo);
}

function normalizeSpendableUtxo(
  { status, txid, value, vout }: BitcoinEsploraUtxo,
  source: BitcoinSendSource
): BitcoinUtxo & { status?: BitcoinEsploraUtxo['status'] } {
  return {
    address: source.address,
    derivationPath: source.derivationPath,
    status,
    txid,
    value: normalizeSatoshiAmount(value, 'invalid_utxo_value'),
    vout,
  };
}

function selectBitcoinUtxos({
  amountSat,
  changeAddress,
  feeRateSatPerVbyte,
  maxInputs,
  spendAll = false,
  utxos,
}: {
  amountSat: number;
  changeAddress: string;
  feeRateSatPerVbyte: number;
  maxInputs: number;
  spendAll?: boolean;
  utxos: BitcoinUtxo[];
}): CoinSelectionResult {
  const sorted = spendAll ? [...utxos] : [...utxos].sort(compareUtxos);
  const selected: BitcoinUtxo[] = [];
  let total = 0;

  if (spendAll) {
    if (sorted.length > maxInputs) throw new BitcoinSendError('too_many_inputs_required');

    for (const utxo of sorted) {
      selected.push(utxo);
      total += utxo.value;
    }

    return finalizeCoinSelection({
      amountSat,
      changeAddress,
      feeRateSatPerVbyte,
      selectedUtxos: selected,
      total,
    });
  }

  for (const utxo of sorted) {
    selected.push(utxo);
    total += utxo.value;
    if (selected.length > maxInputs) throw new BitcoinSendError('too_many_inputs_required');

    try {
      return finalizeCoinSelection({
        amountSat,
        changeAddress,
        feeRateSatPerVbyte,
        selectedUtxos: selected,
        total,
      });
    } catch (error) {
      if (!(error instanceof BitcoinSendError) || error.code !== 'insufficient_funds') throw error;
    }
  }

  throw new BitcoinSendError('insufficient_funds');
}

function finalizeCoinSelection({
  amountSat,
  changeAddress,
  feeRateSatPerVbyte,
  selectedUtxos,
  total,
}: {
  amountSat: number;
  changeAddress: string;
  feeRateSatPerVbyte: number;
  selectedUtxos: BitcoinUtxo[];
  total: number;
}): CoinSelectionResult {
  const noChangeFee = estimateFee(selectedUtxos.length, 1, feeRateSatPerVbyte);
  const noChangeRemainder = total - amountSat - noChangeFee;

  if (noChangeRemainder === 0) {
    return { absorbedDustSat: 0, fee: noChangeFee, selectedUtxos };
  }

  if (noChangeRemainder > 0 && noChangeRemainder < BITCOIN_P2WPKH_DUST_SAT) {
    return {
      absorbedDustSat: noChangeRemainder,
      fee: noChangeFee + noChangeRemainder,
      selectedUtxos,
    };
  }

  const withChangeFee = estimateFee(selectedUtxos.length, 2, feeRateSatPerVbyte);
  const change = total - amountSat - withChangeFee;

  if (change >= BITCOIN_P2WPKH_DUST_SAT) {
    return {
      absorbedDustSat: 0,
      changeAddress,
      fee: withChangeFee,
      selectedUtxos,
    };
  }

  throw new BitcoinSendError('insufficient_funds');
}

function estimateFee(inputCount: number, outputCount: number, feeRateSatPerVbyte: number): number {
  return Math.ceil(estimateP2wpkhTransactionVSize(inputCount, outputCount) * feeRateSatPerVbyte);
}

function normalizeSources(sources: BitcoinSendSource[], network: BitcoinDerivationNetwork): BitcoinSendSource[] {
  if (!Array.isArray(sources) || sources.length === 0) throw new BitcoinSendError('sources_required');
  if (sources.length > 100) throw new BitcoinSendError('too_many_sources');

  const seen = new Set<string>();

  return sources.map(({ address, derivationPath }) => {
    if (!isBitcoinAddress(address, network)) throw new BitcoinSendError('invalid_source_address');
    if (derivationPath !== undefined && !/^m(?:\/\d+'?)+$/u.test(derivationPath)) {
      throw new BitcoinSendError('invalid_derivation_path');
    }

    const key = address.toLowerCase();
    if (seen.has(key)) throw new BitcoinSendError('duplicate_source_address');
    seen.add(key);

    return {
      address,
      derivationPath,
    };
  });
}

function normalizeNetwork(network: BitcoinDerivationNetwork): BitcoinDerivationNetwork {
  if (network !== 'mainnet' && network !== 'testnet') throw new BitcoinSendError('invalid_network');

  return network;
}

function normalizeFeeTargetBlocks(targetBlocks: number): number {
  if (
    !Number.isInteger(targetBlocks) ||
    targetBlocks <= 0 ||
    targetBlocks > MAX_FEE_TARGET_BLOCKS
  ) {
    throw new BitcoinSendError('invalid_fee_target');
  }

  return targetBlocks;
}

function normalizeMaxInputs(maxInputs: number): number {
  if (!Number.isInteger(maxInputs) || maxInputs <= 0 || maxInputs > DEFAULT_MAX_INPUTS) {
    throw new BitcoinSendError('invalid_max_inputs');
  }

  return maxInputs;
}

function normalizeSelectedOutpoints(selectedOutpoints?: BitcoinOutpoint[]): string[] | undefined {
  if (selectedOutpoints === undefined) return undefined;
  if (!Array.isArray(selectedOutpoints) || selectedOutpoints.length === 0) {
    throw new BitcoinSendError('selected_outpoints_required');
  }
  if (selectedOutpoints.length > DEFAULT_MAX_INPUTS) throw new BitcoinSendError('too_many_selected_outpoints');

  const seen = new Set<string>();
  const outpoints: string[] = [];

  for (const { txid, vout } of selectedOutpoints) {
    const outpoint = normalizeOutpoint(txid, vout, 'invalid_selected_outpoint');
    if (seen.has(outpoint)) throw new BitcoinSendError('duplicate_selected_outpoint');
    seen.add(outpoint);
    outpoints.push(outpoint);
  }

  return outpoints;
}

function applySelectedOutpoints(utxos: BitcoinUtxo[], selectedOutpoints?: string[]): BitcoinUtxo[] {
  if (selectedOutpoints === undefined) return utxos;

  const spendableByOutpoint = new Map(utxos.map((utxo) => [normalizeOutpoint(utxo.txid, utxo.vout), utxo]));

  return selectedOutpoints.map((outpoint) => {
    const utxo = spendableByOutpoint.get(outpoint);
    if (!utxo) throw new BitcoinSendError('selected_utxo_unavailable', 'selected_utxo_unavailable', { outpoint });

    return utxo;
  });
}

function normalizeOutpoint(txid: string, vout: number, code = 'invalid_outpoint'): string {
  if (!/^[0-9a-f]{64}$/iu.test(txid) || !Number.isInteger(vout) || vout < 0 || vout > 0xffffffff) {
    throw new BitcoinSendError(code);
  }

  return `${txid.toLowerCase()}:${vout}`;
}

function normalizeSatoshiAmount(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > MAX_SATOSHI) {
    throw new BitcoinSendError(code);
  }

  return value as number;
}

function validateFeeRate(feeRateSatPerVbyte: number): void {
  if (
    typeof feeRateSatPerVbyte !== 'number' ||
    !Number.isFinite(feeRateSatPerVbyte) ||
    feeRateSatPerVbyte <= 0 ||
    feeRateSatPerVbyte > 10_000
  ) {
    throw new BitcoinSendError('invalid_fee_rate');
  }
}

function compareUtxos(left: BitcoinUtxo, right: BitcoinUtxo): number {
  if (left.value !== right.value) return right.value - left.value;
  const txidOrder = left.txid.localeCompare(right.txid);
  if (txidOrder !== 0) return txidOrder;

  return left.vout - right.vout;
}

export {
  type BitcoinPreparedSend,
  type BitcoinSendClient,
  type BitcoinSendResult,
  type BitcoinSendSource,
  type BitcoinOutpoint,
  type PrepareBitcoinSendParams,
  type SendBitcoinTransactionParams,
};
