import {
  BitcoinEsploraClient,
  type BitcoinEsploraUtxo,
  type BitcoinFeeEstimates,
} from '@extension-base/services/bitcoin-indexer-service';

import { decodeBitcoinRecipient, isBitcoinAddress, type BitcoinRecipientType } from '@/util/bitcoin';
import { type BitcoinDerivationNetwork } from '@/util/bitcoinKeyring';
import {
  BITCOIN_P2WPKH_DUST_SAT,
  BITCOIN_P2WPKH_INPUT_VBYTES,
  buildBitcoinP2wpkhTransaction,
  estimateBitcoinTransactionVSize,
  getBitcoinMinimumOutputSat,
  type BitcoinUtxo,
  type BuildBitcoinTransactionResult,
} from '@/util/bitcoinTransaction';

const DEFAULT_FEE_TARGET_BLOCKS = 2;
const DEFAULT_MAX_INPUTS = 100;
const MAX_SOURCE_ADDRESSES = 2_000;
const UTXO_FETCH_CONCURRENCY = 8;
const MAX_FEE_TARGET_BLOCKS = 1008;
const MAX_SATOSHI = 2_100_000_000_000_000;

// Fee rates are bounded on both sides. Below 1 sat/vB many nodes still refuse
// to relay; above 1,000 sat/vB a confirmation is already near-certain, so a
// higher estimate is capped instead of letting a faulty indexer drain fees.
// Anything above 10,000 sat/vB is malformed data and is rejected outright.
export const BITCOIN_MIN_FEE_RATE_SAT_PER_VBYTE = 1;
export const BITCOIN_MAX_FEE_RATE_SAT_PER_VBYTE = 1_000;
const MALFORMED_FEE_RATE_SAT_PER_VBYTE = 10_000;

type BitcoinSendClient = Pick<BitcoinEsploraClient, 'broadcastTransaction' | 'getFeeEstimates' | 'getUtxos'>;
type BitcoinPlanClient = Pick<BitcoinEsploraClient, 'getFeeEstimates' | 'getUtxos'>;

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
  client?: BitcoinSendClient | BitcoinPlanClient;
  feeRateSatPerVbyte?: number;
  feeTargetBlocks?: number;
  includeUnconfirmed?: boolean;
  maxInputs?: number;
  mnemonicOrSeed: string;
  network?: BitcoinDerivationNetwork;
  /**
   * Coins of an earlier transaction whose broadcast outcome is unknown. Every
   * one of them is spent again, so the new transaction conflicts with the
   * earlier one and the network can confirm at most one of the two.
   */
  requiredOutpoints?: BitcoinOutpoint[];
  selectedOutpoints?: BitcoinOutpoint[];
  sources: BitcoinSendSource[];
  toAddress: string;
};

type SendBitcoinTransactionParams = PrepareBitcoinSendParams & { client?: BitcoinSendClient };

type BitcoinPreparedSend = BuildBitcoinTransactionResult & {
  absorbedDustSat: number;
  amountSat: number;
  changeAddress?: string;
  feeRateSatPerVbyte: number;
  feeTargetBlocks?: number;
  network: BitcoinDerivationNetwork;
  recipientAddress: string;
  recipientType: BitcoinRecipientType;
  selectedUtxos: BitcoinUtxo[];
  sourceAddresses: string[];
};

type BitcoinSendResult = BitcoinPreparedSend & {
  broadcastTxid: string;
};

type BitcoinSpendableSummary = {
  /** Unconfirmed incoming coins; spendable once they confirm. */
  awaitingConfirmationSat: number;
  /** The largest amount one transaction can send to this recipient type. */
  maxSendableSat: number;
  /** Confirmed coins worth more than the fee to spend them. */
  spendableSat: number;
  /** Coins that cost more in fees to spend than they hold at this fee rate. */
  uneconomicalSat: number;
};

type BitcoinSendQuote = BitcoinSpendableSummary & {
  feeRateSatPerVbyte: number;
  /** Fee for the requested amount, when the wallet can cover it. */
  feeSat?: number;
  /** Why the requested amount cannot be sent, when it cannot. */
  unavailableReason?: string;
  vsize?: number;
};

type CoinSelectionResult = {
  absorbedDustSat: number;
  changeAddress?: string;
  fee: number;
  selectedUtxos: BitcoinUtxo[];
  vsize: number;
};

type WalletUtxo = BitcoinUtxo & { confirmed: boolean };

type BitcoinSendPlan = {
  amountSat: number;
  feeRateSatPerVbyte: number;
  feeTargetBlocks?: number;
  network: BitcoinDerivationNetwork;
  recipientType: BitcoinRecipientType;
  selection: CoinSelectionResult;
  sources: BitcoinSendSource[];
  toAddress: string;
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

export async function prepareBitcoinSend(params: PrepareBitcoinSendParams): Promise<BitcoinPreparedSend> {
  if (!params.mnemonicOrSeed.trim()) {
    // Validate the cheap inputs first so callers see the most specific error.
    validateSendInputs(params);
    throw new BitcoinSendError('mnemonic_required');
  }

  const plan = await planBitcoinSend(params);
  const built = buildBitcoinP2wpkhTransaction({
    changeAddress: plan.selection.changeAddress,
    feeSat: plan.selection.fee,
    inputs: plan.selection.selectedUtxos,
    mnemonicOrSeed: params.mnemonicOrSeed,
    network: plan.network,
    outputs: [{ address: plan.toAddress, value: plan.amountSat }],
  });

  return {
    ...built,
    absorbedDustSat: plan.selection.absorbedDustSat,
    amountSat: plan.amountSat,
    changeAddress: plan.selection.changeAddress,
    feeRateSatPerVbyte: plan.feeRateSatPerVbyte,
    feeTargetBlocks: plan.feeTargetBlocks,
    network: plan.network,
    recipientAddress: plan.toAddress,
    recipientType: plan.recipientType,
    selectedUtxos: plan.selection.selectedUtxos,
    sourceAddresses: plan.sources.map(({ address }) => address),
  };
}

export async function sendBitcoinTransaction(params: SendBitcoinTransactionParams): Promise<BitcoinSendResult> {
  const network = normalizeNetwork(params.network ?? 'mainnet');
  const client = params.client ?? new BitcoinEsploraClient({ network });
  const prepared = await prepareBitcoinSend({ ...params, client, network });
  const broadcastTxid = await client.broadcastTransaction(prepared.txHex, prepared.txid);

  if (broadcastTxid !== prepared.txid) throw new BitcoinSendError('broadcast_txid_mismatch');

  return {
    ...prepared,
    broadcastTxid,
  };
}

/**
 * Fee, spendable balance and maximum send for the confirm screen. The
 * requested amount may be missing (the user has not typed one yet) or too
 * large; the summary is still returned so Max and the fee row stay useful.
 */
export async function quoteBitcoinSend({
  amountSat,
  client,
  feeRateSatPerVbyte,
  feeTargetBlocks = DEFAULT_FEE_TARGET_BLOCKS,
  includeUnconfirmed = false,
  maxInputs = DEFAULT_MAX_INPUTS,
  network = 'mainnet',
  requiredOutpoints,
  sources,
  toAddress,
}: Omit<PrepareBitcoinSendParams, 'amountSat' | 'changeAddress' | 'mnemonicOrSeed' | 'selectedOutpoints'> & {
  amountSat?: number;
}): Promise<BitcoinSendQuote> {
  const normalizedNetwork = normalizeNetwork(network);
  const normalizedSources = normalizeSources(sources, normalizedNetwork);
  const recipientType = decodeBitcoinRecipient(toAddress, normalizedNetwork)?.type ?? 'p2wpkh';
  const indexer = client ?? new BitcoinEsploraClient({ network: normalizedNetwork });
  const feeRate = await resolveFeeRate(indexer, feeRateSatPerVbyte, normalizeFeeTargetBlocks(feeTargetBlocks));
  const walletUtxos = await fetchWalletUtxos(indexer, normalizedSources);
  const summary = summarizeBitcoinSpendable({
    feeRateSatPerVbyte: feeRate,
    includeUnconfirmed,
    maxInputs: normalizeMaxInputs(maxInputs),
    recipientType,
    utxos: walletUtxos,
  });
  const quote: BitcoinSendQuote = { ...summary, feeRateSatPerVbyte: feeRate };
  const requiredOutpointKeys = normalizeOutpointList(requiredOutpoints, 'invalid_required_outpoint');

  if (amountSat === undefined) {
    // Nothing is selected without an amount, but a coin of an earlier send that
    // the indexer no longer lists already rules out sending.
    const listed = new Set(walletUtxos.map(({ txid, vout }) => normalizeOutpoint(txid, vout)));

    return requiredOutpointKeys.every((outpoint) => listed.has(outpoint))
      ? quote
      : { ...quote, unavailableReason: 'pending_outpoint_required' };
  }

  try {
    const amount = normalizeAmount(amountSat, recipientType);
    const selection = selectBitcoinUtxos({
      amountSat: amount,
      changeAddress: normalizedSources[0].address,
      feeRateSatPerVbyte: feeRate,
      maxInputs: normalizeMaxInputs(maxInputs),
      recipientType,
      requiredOutpoints: requiredOutpointKeys,
      utxos: spendableUtxos(walletUtxos, includeUnconfirmed, requiredOutpointKeys),
    });

    return { ...quote, feeSat: selection.fee, vsize: selection.vsize };
  } catch (error) {
    if (!(error instanceof BitcoinSendError)) throw error;

    return {
      ...quote,
      feeSat: Math.ceil(estimateBitcoinTransactionVSize(1, [recipientType, 'p2wpkh']) * feeRate),
      unavailableReason: error.code,
    };
  }
}

export function summarizeBitcoinSpendable({
  feeRateSatPerVbyte,
  includeUnconfirmed = false,
  maxInputs = DEFAULT_MAX_INPUTS,
  recipientType,
  utxos,
}: {
  feeRateSatPerVbyte: number;
  includeUnconfirmed?: boolean;
  maxInputs?: number;
  recipientType: BitcoinRecipientType;
  utxos: WalletUtxo[];
}): BitcoinSpendableSummary {
  const eligible = utxos.filter(({ confirmed }) => includeUnconfirmed || confirmed);
  const economical = eligible.filter((utxo) => isEconomical(utxo, feeRateSatPerVbyte)).sort(compareUtxos);
  const usable = economical.slice(0, maxInputs);
  const spendableSat = sumValues(economical);
  const usableSat = sumValues(usable);
  const maxFee = usable.length
    ? Math.ceil(estimateBitcoinTransactionVSize(usable.length, [recipientType]) * feeRateSatPerVbyte)
    : 0;
  const maxSendable = usableSat - maxFee;

  return {
    awaitingConfirmationSat: includeUnconfirmed ? 0 : sumValues(utxos.filter(({ confirmed }) => !confirmed)),
    maxSendableSat: maxSendable >= getBitcoinMinimumOutputSat(recipientType) ? maxSendable : 0,
    spendableSat,
    uneconomicalSat: sumValues(eligible) - spendableSat,
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
  if (selected[1] > MALFORMED_FEE_RATE_SAT_PER_VBYTE) throw new BitcoinSendError('invalid_fee_rate');

  return Math.min(BITCOIN_MAX_FEE_RATE_SAT_PER_VBYTE, Math.max(BITCOIN_MIN_FEE_RATE_SAT_PER_VBYTE, selected[1]));
}

async function planBitcoinSend({
  amountSat,
  changeAddress,
  client,
  feeRateSatPerVbyte,
  feeTargetBlocks = DEFAULT_FEE_TARGET_BLOCKS,
  includeUnconfirmed = false,
  maxInputs = DEFAULT_MAX_INPUTS,
  network = 'mainnet',
  requiredOutpoints,
  selectedOutpoints,
  sources,
  toAddress,
}: PrepareBitcoinSendParams): Promise<BitcoinSendPlan> {
  const { normalizedAmount, normalizedChangeAddress, normalizedNetwork, normalizedSources, recipientType } =
    validateSendInputs({ amountSat, changeAddress, network, sources, toAddress });
  const normalizedFeeTargetBlocks = normalizeFeeTargetBlocks(feeTargetBlocks);
  const maxSelectedInputs = normalizeMaxInputs(maxInputs);
  const indexer = client ?? new BitcoinEsploraClient({ network: normalizedNetwork });
  const resolvedFeeRate = await resolveFeeRate(indexer, feeRateSatPerVbyte, normalizedFeeTargetBlocks);
  const selectedOutpointKeys = normalizeSelectedOutpoints(selectedOutpoints);
  const requiredOutpointKeys = normalizeOutpointList(requiredOutpoints, 'invalid_required_outpoint');
  const walletUtxos = await fetchWalletUtxos(indexer, normalizedSources);
  const spendable = spendableUtxos(walletUtxos, includeUnconfirmed, requiredOutpointKeys);

  // With required coins, coin selection reports the more specific missing-coin error.
  if (spendable.length === 0 && selectedOutpointKeys === undefined && requiredOutpointKeys.length === 0) {
    throw new BitcoinSendError('no_spendable_utxos');
  }

  const selection =
    selectedOutpointKeys === undefined
      ? selectBitcoinUtxos({
          amountSat: normalizedAmount,
          changeAddress: normalizedChangeAddress,
          feeRateSatPerVbyte: resolvedFeeRate,
          maxInputs: maxSelectedInputs,
          recipientType,
          requiredOutpoints: requiredOutpointKeys,
          utxos: spendable,
        })
      : spendExactly({
          amountSat: normalizedAmount,
          changeAddress: normalizedChangeAddress,
          feeRateSatPerVbyte: resolvedFeeRate,
          maxInputs: maxSelectedInputs,
          recipientType,
          requiredOutpoints: requiredOutpointKeys,
          utxos: applySelectedOutpoints(spendable, selectedOutpointKeys),
        });

  return {
    amountSat: normalizedAmount,
    feeRateSatPerVbyte: resolvedFeeRate,
    feeTargetBlocks: feeRateSatPerVbyte === undefined ? normalizedFeeTargetBlocks : undefined,
    network: normalizedNetwork,
    recipientType,
    selection,
    sources: normalizedSources,
    toAddress,
  };
}

function validateSendInputs({
  amountSat,
  changeAddress,
  network = 'mainnet',
  sources,
  toAddress,
}: Pick<PrepareBitcoinSendParams, 'amountSat' | 'changeAddress' | 'network' | 'sources' | 'toAddress'>) {
  const normalizedNetwork = normalizeNetwork(network);
  const normalizedSources = normalizeSources(sources, normalizedNetwork);
  const recipient = decodeBitcoinRecipient(toAddress, normalizedNetwork);
  const normalizedAmount = normalizeAmount(amountSat, recipient?.type ?? 'p2wpkh');

  if (!recipient) throw new BitcoinSendError('invalid_recipient_address');

  const normalizedChangeAddress = changeAddress ?? normalizedSources[0].address;
  if (!isBitcoinAddress(normalizedChangeAddress, normalizedNetwork)) {
    throw new BitcoinSendError('invalid_change_address');
  }

  return {
    normalizedAmount,
    normalizedChangeAddress,
    normalizedNetwork,
    normalizedSources,
    recipientType: recipient.type,
  };
}

async function resolveFeeRate(
  client: BitcoinPlanClient,
  feeRateSatPerVbyte: number | undefined,
  feeTargetBlocks: number
): Promise<number> {
  if (feeRateSatPerVbyte !== undefined) {
    validateFeeRate(feeRateSatPerVbyte);

    return feeRateSatPerVbyte;
  }

  return selectBitcoinFeeRateSatPerVbyte(await client.getFeeEstimates(), feeTargetBlocks);
}

async function fetchWalletUtxos(client: BitcoinPlanClient, sources: BitcoinSendSource[]): Promise<WalletUtxo[]> {
  const results: WalletUtxo[][] = [];

  for (let offset = 0; offset < sources.length; offset += UTXO_FETCH_CONCURRENCY) {
    const batch = sources.slice(offset, offset + UTXO_FETCH_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (source) => {
        const utxos = await client.getUtxos(source.address);

        return utxos.map((utxo) => normalizeWalletUtxo(utxo, source));
      })
    );

    results.push(...batchResults);
  }

  const seenOutpoints = new Set<string>();
  const utxos = results.flat();

  utxos.forEach(({ txid, vout }) => {
    const outpoint = `${txid.toLowerCase()}:${vout}`;

    if (seenOutpoints.has(outpoint)) throw new BitcoinSendError('duplicate_utxo');
    seenOutpoints.add(outpoint);
  });

  return utxos;
}

// A coin of a possibly-broadcast earlier transaction stays eligible while it is
// unconfirmed: the new transaction has to spend it again.
function spendableUtxos(
  utxos: WalletUtxo[],
  includeUnconfirmed: boolean,
  requiredOutpoints: string[] = []
): BitcoinUtxo[] {
  const required = new Set(requiredOutpoints);

  return utxos
    .filter(
      ({ confirmed, txid, vout }) => includeUnconfirmed || confirmed || required.has(normalizeOutpoint(txid, vout))
    )
    .map(({ confirmed: _confirmed, ...utxo }) => utxo);
}

function normalizeWalletUtxo({ status, txid, value, vout }: BitcoinEsploraUtxo, source: BitcoinSendSource): WalletUtxo {
  return {
    address: source.address,
    confirmed: status?.confirmed === true,
    derivationPath: source.derivationPath,
    txid,
    value: normalizeSatoshiAmount(value, 'invalid_utxo_value'),
    vout,
  };
}

/**
 * Largest-first selection over coins worth spending at this fee rate. Coins of
 * a possibly-broadcast earlier transaction are always included first so the
 * new transaction conflicts with it.
 */
function selectBitcoinUtxos({
  amountSat,
  changeAddress,
  feeRateSatPerVbyte,
  maxInputs,
  recipientType,
  requiredOutpoints = [],
  utxos,
}: {
  amountSat: number;
  changeAddress: string;
  feeRateSatPerVbyte: number;
  maxInputs: number;
  recipientType: BitcoinRecipientType;
  requiredOutpoints?: string[];
  utxos: BitcoinUtxo[];
}): CoinSelectionResult {
  const required = new Set(requiredOutpoints);
  const selected = utxos.filter((utxo) => required.has(normalizeOutpoint(utxo.txid, utxo.vout)));

  // A coin the indexer no longer lists may already be spent by the earlier
  // transaction; building from other coins would let both confirm.
  if (selected.length !== required.size) throw new BitcoinSendError('pending_outpoint_required');

  const candidates = utxos
    .filter((utxo) => !required.has(normalizeOutpoint(utxo.txid, utxo.vout)) && isEconomical(utxo, feeRateSatPerVbyte))
    .sort(compareUtxos);
  let total = sumValues(selected);

  if (selected.length > maxInputs) throw new BitcoinSendError('too_many_inputs_required');

  if (selected.length > 0) {
    const result = tryFinalize({ amountSat, changeAddress, feeRateSatPerVbyte, recipientType, selectedUtxos: selected, total });

    if (result) return result;
  }

  for (const utxo of candidates) {
    selected.push(utxo);
    total += utxo.value;
    if (selected.length > maxInputs) throw new BitcoinSendError('too_many_inputs_required');

    const result = tryFinalize({ amountSat, changeAddress, feeRateSatPerVbyte, recipientType, selectedUtxos: selected, total });

    if (result) return result;
  }

  throw new BitcoinSendError('insufficient_funds');
}

function spendExactly({
  amountSat,
  changeAddress,
  feeRateSatPerVbyte,
  maxInputs,
  recipientType,
  requiredOutpoints = [],
  utxos,
}: {
  amountSat: number;
  changeAddress: string;
  feeRateSatPerVbyte: number;
  maxInputs: number;
  recipientType: BitcoinRecipientType;
  requiredOutpoints?: string[];
  utxos: BitcoinUtxo[];
}): CoinSelectionResult {
  const selectedKeys = new Set(utxos.map(({ txid, vout }) => normalizeOutpoint(txid, vout)));

  // Coin control may not leave out a coin of a possibly-broadcast transaction.
  if (requiredOutpoints.some((outpoint) => !selectedKeys.has(outpoint))) {
    throw new BitcoinSendError('pending_outpoint_required');
  }
  if (utxos.length > maxInputs) throw new BitcoinSendError('too_many_inputs_required');

  const result = tryFinalize({
    amountSat,
    changeAddress,
    feeRateSatPerVbyte,
    recipientType,
    selectedUtxos: [...utxos],
    total: sumValues(utxos),
  });

  if (!result) throw new BitcoinSendError('insufficient_funds');

  return result;
}

function tryFinalize({
  amountSat,
  changeAddress,
  feeRateSatPerVbyte,
  recipientType,
  selectedUtxos,
  total,
}: {
  amountSat: number;
  changeAddress: string;
  feeRateSatPerVbyte: number;
  recipientType: BitcoinRecipientType;
  selectedUtxos: BitcoinUtxo[];
  total: number;
}): CoinSelectionResult | null {
  const noChangeVSize = estimateBitcoinTransactionVSize(selectedUtxos.length, [recipientType]);
  const noChangeFee = Math.ceil(noChangeVSize * feeRateSatPerVbyte);
  const noChangeRemainder = total - amountSat - noChangeFee;

  if (noChangeRemainder === 0) {
    return { absorbedDustSat: 0, fee: noChangeFee, selectedUtxos: [...selectedUtxos], vsize: noChangeVSize };
  }

  if (noChangeRemainder > 0 && noChangeRemainder < BITCOIN_P2WPKH_DUST_SAT) {
    return {
      absorbedDustSat: noChangeRemainder,
      fee: noChangeFee + noChangeRemainder,
      selectedUtxos: [...selectedUtxos],
      vsize: noChangeVSize,
    };
  }

  const withChangeVSize = estimateBitcoinTransactionVSize(selectedUtxos.length, [recipientType, 'p2wpkh']);
  const withChangeFee = Math.ceil(withChangeVSize * feeRateSatPerVbyte);
  const change = total - amountSat - withChangeFee;

  if (change >= BITCOIN_P2WPKH_DUST_SAT) {
    return {
      absorbedDustSat: 0,
      changeAddress,
      fee: withChangeFee,
      selectedUtxos: [...selectedUtxos],
      vsize: withChangeVSize,
    };
  }

  return null;
}

/** A coin is worth spending only when it holds more than the fee to spend it. */
function isEconomical({ value }: Pick<BitcoinUtxo, 'value'>, feeRateSatPerVbyte: number): boolean {
  return value > Math.ceil(BITCOIN_P2WPKH_INPUT_VBYTES * feeRateSatPerVbyte);
}

function normalizeAmount(amountSat: number, recipientType: BitcoinRecipientType): number {
  const normalizedAmount = normalizeSatoshiAmount(amountSat, 'invalid_amount');

  if (normalizedAmount < getBitcoinMinimumOutputSat(recipientType)) {
    throw new BitcoinSendError('amount_below_dust');
  }

  return normalizedAmount;
}

function normalizeSources(sources: BitcoinSendSource[], network: BitcoinDerivationNetwork): BitcoinSendSource[] {
  if (!Array.isArray(sources) || sources.length === 0) throw new BitcoinSendError('sources_required');
  if (sources.length > MAX_SOURCE_ADDRESSES) throw new BitcoinSendError('too_many_sources');

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

function normalizeOutpointList(outpoints: BitcoinOutpoint[] | undefined, code: string): string[] {
  if (outpoints === undefined) return [];
  if (!Array.isArray(outpoints) || outpoints.length > DEFAULT_MAX_INPUTS) throw new BitcoinSendError(code);

  return [...new Set(outpoints.map(({ txid, vout }) => normalizeOutpoint(txid, vout, code)))];
}

function applySelectedOutpoints(utxos: BitcoinUtxo[], selectedOutpoints: string[]): BitcoinUtxo[] {
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
    feeRateSatPerVbyte < BITCOIN_MIN_FEE_RATE_SAT_PER_VBYTE ||
    feeRateSatPerVbyte > BITCOIN_MAX_FEE_RATE_SAT_PER_VBYTE
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

function sumValues(items: Array<{ value: number }>): number {
  return items.reduce((total, { value }) => total + value, 0);
}

export {
  type BitcoinPreparedSend,
  type BitcoinSendClient,
  type BitcoinSendQuote,
  type BitcoinSendResult,
  type BitcoinSendSource,
  type BitcoinSpendableSummary,
  type BitcoinOutpoint,
  type PrepareBitcoinSendParams,
  type SendBitcoinTransactionParams,
  type WalletUtxo as BitcoinWalletUtxo,
};
