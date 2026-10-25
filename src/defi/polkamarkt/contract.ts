import type {
  PolkamarktClaimable,
  PolkamarktDisplayStatus,
  PolkamarktHistoryPoint,
  PolkamarktMarket,
  PolkamarktPosition,
  PolkamarktRuntimeCapabilities,
  PolkamarktTrade,
} from './types';

type RecordValue = Record<string, unknown>;

const INTEGER = /^(0|[1-9]\d*)$/;
const DECIMAL = /^(0|[1-9]\d*)(\.\d+)?$/;

export const isRecord = (value: unknown): value is RecordValue =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const asRecord = (value: unknown): RecordValue => (isRecord(value) ? value : {});

export function codecValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  const codec = value as { isSome?: boolean; unwrap?: () => unknown; toJSON?: () => unknown; toHuman?: () => unknown };
  if (typeof codec.isSome === 'boolean') {
    if (!codec.isSome) return null;
    return codecValue(typeof codec.unwrap === 'function' ? codec.unwrap() : value);
  }
  if (typeof codec.toJSON === 'function') return codec.toJSON();
  if (typeof codec.toHuman === 'function') return codec.toHuman();
  return value;
}

export function codecRecord(value: unknown): RecordValue {
  return asRecord(codecValue(value));
}

const normalizedKey = (value: string): string => value.replace(/_/g, '').toLowerCase();

export function recordValue(record: RecordValue, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
    const normalized = normalizedKey(key);
    const actual = Object.keys(record).find((candidate) => normalizedKey(candidate) === normalized);
    if (actual && record[actual] !== undefined && record[actual] !== null) return record[actual];
  }
  return undefined;
}

export function decimalString(value: unknown, fallback = '0'): string {
  if (typeof value === 'bigint') return value >= 0n ? value.toString() : fallback;
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value) : String(codecValue(value) ?? '');
  const normalized = raw.replace(/,/g, '').trim();
  return DECIMAL.test(normalized) ? normalized : fallback;
}

export function integerString(value: unknown): string | undefined {
  const raw = String(codecValue(value) ?? '').replace(/,/g, '').trim();
  if (/^0x[0-9a-f]+$/i.test(raw)) return BigInt(raw).toString();
  const normalized = decimalString(raw, '').replace(/\.0+$/, '');
  return INTEGER.test(normalized) ? normalized : undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function decodeText(value: unknown): string | undefined {
  const normalized = codecValue(value);
  if (Array.isArray(normalized) || normalized instanceof Uint8Array) {
    const bytes = Array.from(normalized as ArrayLike<number>).map(Number);
    const decoded = new TextDecoder().decode(new Uint8Array(bytes)).replace(/\0/g, '').trim();
    return decoded && !decoded.includes('\uFFFD') ? decoded : undefined;
  }
  const stringValue = String(normalized ?? '').trim();
  if (!stringValue) return undefined;
  if (!/^0x[0-9a-f]+$/i.test(stringValue)) return stringValue;
  const pairs = stringValue.slice(2).match(/.{1,2}/g) ?? [];
  const decoded = new TextDecoder().decode(new Uint8Array(pairs.map((pair) => Number.parseInt(pair, 16)))).replace(/\0/g, '').trim();
  return decoded && !decoded.includes('\uFFFD') ? decoded : undefined;
}

function decimalParts(value: string): { whole: string; fraction: string } {
  const [whole = '0', fraction = ''] = decimalString(value).split('.');
  return { whole: whole.replace(/^0+(?=\d)/, ''), fraction: fraction.replace(/0+$/, '') };
}

export function compareUnsignedDecimals(left: string, right: string): number {
  const a = decimalParts(left);
  const b = decimalParts(right);
  if (a.whole.length !== b.whole.length) return a.whole.length > b.whole.length ? 1 : -1;
  if (a.whole !== b.whole) return a.whole > b.whole ? 1 : -1;
  const width = Math.max(a.fraction.length, b.fraction.length);
  const af = a.fraction.padEnd(width, '0');
  const bf = b.fraction.padEnd(width, '0');
  return af === bf ? 0 : af > bf ? 1 : -1;
}

export function toCodecAmount(value: string, precision = 18): string {
  const normalized = value.trim();
  if (!DECIMAL.test(normalized)) throw new Error('Enter a non-negative decimal amount.');
  const [whole, fraction = ''] = normalized.split('.');
  if (fraction.length > precision) throw new Error(`Amount supports at most ${precision} decimal places.`);
  const result = `${whole}${fraction.padEnd(precision, '0')}`.replace(/^0+(?=\d)/, '');
  return result || '0';
}

export function fromCodecAmount(value: string, precision = 18): string {
  if (!INTEGER.test(value.trim())) return '0';
  const digits = value.trim().padStart(precision + 1, '0');
  const whole = digits.slice(0, -precision).replace(/^0+(?=\d)/, '') || '0';
  const fraction = digits.slice(-precision).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

export function minimumAfterSlippage(codecAmount: string, slippageBps = 100): string {
  if (!INTEGER.test(codecAmount) || !Number.isSafeInteger(slippageBps) || slippageBps < 0 || slippageBps >= 10_000) {
    throw new Error('Invalid quoted amount or slippage.');
  }
  return ((BigInt(codecAmount) * BigInt(10_000 - slippageBps)) / 10_000n).toString();
}

export function deriveMarketStatus(status: unknown, closeBlock: unknown, currentBlock: string): PolkamarktDisplayStatus {
  const normalized = String(status ?? '').replace(/[_\s-]/g, '').toLowerCase();
  if (normalized === 'resolved') return 'resolved';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  if (normalized === 'locked' || normalized === 'earlyreportlocked') return 'locked';
  const close = integerString(closeBlock);
  if (close && BigInt(currentBlock || '0') >= BigInt(close)) return 'closed';
  if (normalized === 'closed') return 'closed';
  return 'open';
}

function probabilityString(value: unknown): string | null {
  const parsed = decimalString(value, '');
  if (!parsed) return null;
  if (compareUnsignedDecimals(parsed, '1') <= 0) {
    const [whole, fraction = ''] = parsed.split('.');
    if (whole === '1') return '100';
    const scaled = `${fraction.padEnd(2, '0').slice(0, 2)}.${fraction.padEnd(4, '0').slice(2, 4)}`.replace(/\.?0+$/, '');
    return scaled || '0';
  }
  return compareUnsignedDecimals(parsed, '100') <= 0 ? parsed : null;
}

export function parseIndexedMarket(input: RecordValue, currentBlock: string): PolkamarktMarket | null {
  const id = integerString(recordValue(input, 'marketId')) ?? integerString(input.id);
  const title = text(input.title);
  if (!id || !title) return null;
  return {
    id,
    conditionId: integerString(recordValue(input, 'conditionId')),
    creator: text(input.creator),
    title,
    description: text(input.description) ?? 'Review the SORA oracle and resolution source before trading.',
    category: text(input.category) ?? 'Other',
    oracle: text(input.oracle),
    resolutionSource: text(recordValue(input, 'resolutionSource')),
    closeBlock: integerString(recordValue(input, 'closeBlock')),
    status: text(input.status),
    mechanism: text(input.mechanism),
    collateralAsset: text(recordValue(input, 'collateralAsset')),
    liquidityUsd: decimalString(recordValue(input, 'liquidityUsd', 'liquidityUSD', 'liquidity', 'dpmCollateral')),
    volumeUsd: decimalString(recordValue(input, 'volumeUsd', 'volumeUSD', 'volume', 'marketVolume')),
    probability: probabilityString(recordValue(input, 'probability', 'priceYes')),
    displayStatus: deriveMarketStatus(input.status, recordValue(input, 'closeBlock'), currentBlock),
    runtimeOnly: false,
  };
}

export async function parseRuntimeMarket(
  storage: RecordValue,
  rpc: RecordValue,
  marketId: string,
  value: unknown,
  currentBlock: string
): Promise<PolkamarktMarket | null> {
  const market = codecRecord(value);
  const conditionId = integerString(recordValue(market, 'conditionId'));
  const call = async (name: string, ...args: unknown[]): Promise<unknown> => {
    const candidate = recordValue(storage, name) as ((...params: unknown[]) => Promise<unknown>) | undefined;
    return typeof candidate === 'function' ? candidate(...args) : null;
  };
  const condition = conditionId ? codecRecord(await call('conditions', conditionId)) : {};
  const details = conditionId ? codecRecord(await call('conditionDetails', conditionId)) : {};
  const stateFactory = recordValue(rpc, 'marketState') as ((id: string) => Promise<unknown>) | undefined;
  let state: RecordValue = {};
  if (typeof stateFactory === 'function') {
    try {
      state = codecRecord(await stateFactory(marketId));
    } catch {
      state = {};
    }
  }
  const title = decodeText(recordValue(condition, 'question'));
  if (!title) return null;
  const closeBlock = integerString(recordValue(market, 'closeBlock'));
  const oracle = decodeText(recordValue(condition, 'oracle'));
  const resolutionSource = decodeText(recordValue(condition, 'resolutionSource'));
  const collateral = decimalString(recordValue(state, 'dpmCollateral'));
  const volume = decimalString(codecValue(await call('marketVolume', marketId)));
  const impliedYesBps = integerString(recordValue(state, 'impliedYesProbabilityBps'));
  return {
    id: marketId,
    conditionId,
    creator: text(String(recordValue(market, 'creator') ?? '')),
    title,
    description: [oracle ? `Resolved by ${oracle}` : '', resolutionSource ? `Source: ${resolutionSource}` : '']
      .filter(Boolean)
      .join('. ') || 'Read directly from SORA runtime storage.',
    category: decodeText(recordValue(details, 'category')) ?? 'Other',
    oracle,
    resolutionSource,
    closeBlock,
    status: text(String(recordValue(market, 'status') ?? '')),
    mechanism: text(String(recordValue(state, 'mechanism') ?? recordValue(market, 'mechanism') ?? '')),
    collateralAsset: 'KUSD',
    liquidityUsd: collateral,
    volumeUsd: volume,
    probability: impliedYesBps ? decimalString(`${impliedYesBps.slice(0, -2) || '0'}.${impliedYesBps.slice(-2).padStart(2, '0')}`) : null,
    displayStatus: deriveMarketStatus(recordValue(market, 'status'), closeBlock, currentBlock),
    runtimeOnly: true,
  };
}

export function mergeAndSortMarkets(indexed: PolkamarktMarket[], runtime: PolkamarktMarket[]): PolkamarktMarket[] {
  const byId = new Map(indexed.map((market) => [market.id, market]));
  runtime.forEach((runtimeMarket) => {
    const indexedMarket = byId.get(runtimeMarket.id);
    byId.set(
      runtimeMarket.id,
      indexedMarket
        ? {
            ...indexedMarket,
            status: runtimeMarket.status ?? indexedMarket.status,
            displayStatus: runtimeMarket.displayStatus,
            mechanism: runtimeMarket.mechanism ?? indexedMarket.mechanism,
          }
        : runtimeMarket
    );
  });
  const statusRank: Record<PolkamarktDisplayStatus, number> = { open: 0, locked: 1, closed: 2, resolved: 3, cancelled: 4 };
  return [...byId.values()].sort((left, right) => {
    const state = statusRank[left.displayStatus] - statusRank[right.displayStatus];
    if (state) return state;
    const volume = compareUnsignedDecimals(right.volumeUsd, left.volumeUsd);
    if (volume) return volume;
    return BigInt(right.id) > BigInt(left.id) ? 1 : BigInt(right.id) < BigInt(left.id) ? -1 : 0;
  });
}

function nodes(value: unknown): RecordValue[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  const edges = asRecord(value).edges;
  return Array.isArray(edges) ? edges.map((edge) => asRecord(edge).node).filter(isRecord) : [];
}

export function parseHistory(payload: unknown): PolkamarktHistoryPoint[] {
  return nodes(asRecord(payload).marketSnapshots).flatMap((point) => {
    const id = text(point.id);
    const marketId = integerString(recordValue(point, 'marketId'));
    const probability = probabilityString(recordValue(point, 'probability', 'priceYes'));
    return id && marketId && probability !== null
      ? [{
          id,
          marketId,
          timestamp: integerString(point.timestamp),
          blockHeight: integerString(recordValue(point, 'blockHeight')),
          probability,
          priceYes: decimalString(recordValue(point, 'priceYes'), '') || undefined,
          priceNo: decimalString(recordValue(point, 'priceNo'), '') || undefined,
          liquidityUsd: decimalString(recordValue(point, 'liquidityUsd', 'liquidityUSD'), '') || undefined,
          volumeUsd: decimalString(recordValue(point, 'volumeUsd', 'volumeUSD'), '') || undefined,
          status: text(point.status),
        }]
      : [];
  });
}

export function parseActivity(payload: unknown): { positions: PolkamarktPosition[]; trades: PolkamarktTrade[] } {
  const root = asRecord(payload);
  const positions = nodes(root.accountPositions ?? root.positions).flatMap((position, index) => {
    const market = asRecord(position.market);
    const marketId = integerString(recordValue(position, 'marketId')) ?? integerString(recordValue(market, 'marketId', 'id'));
    if (!marketId) return [];
    const outcome = String(position.outcome ?? '').toUpperCase();
    return [{
      id: text(position.id) ?? `${marketId}-${index}`,
      marketId,
      marketTitle: text(recordValue(position, 'marketTitle')) ?? text(market.title),
      outcome: outcome === 'YES' || outcome === 'NO' ? outcome : undefined,
      shares: decimalString(recordValue(position, 'shares', 'sharesAmount'), '') || undefined,
      yesShares: decimalString(recordValue(position, 'yesShares'), '') || undefined,
      noShares: decimalString(recordValue(position, 'noShares'), '') || undefined,
      netCollateralPaid: decimalString(recordValue(position, 'netCollateralPaid'), '') || undefined,
      claimablePayout: decimalString(recordValue(position, 'claimablePayout', 'claimablePayoutUsd'), '') || undefined,
      isCreator: Boolean(position.isCreator),
      status: text(position.status) ?? text(market.status),
      updatedAt: text(position.updatedAt),
    } satisfies PolkamarktPosition];
  });
  const trades = nodes(root.accountTrades ?? root.trades).flatMap((trade, index) => {
    const marketId = integerString(recordValue(trade, 'marketId'));
    if (!marketId) return [];
    const side = String(recordValue(trade, 'side', 'action') ?? '').toLowerCase();
    const outcome = String(trade.outcome ?? '').toUpperCase();
    return [{
      id: text(trade.id) ?? text(trade.extrinsicHash) ?? `${marketId}-${index}`,
      marketId,
      side: side === 'buy' || side === 'sell' || side === 'claim' ? side : undefined,
      outcome: outcome === 'YES' || outcome === 'NO' ? outcome : undefined,
      collateral: decimalString(recordValue(trade, 'collateral', 'collateralUsd', 'collateralAmountUsd'), '') || undefined,
      sharesIn: decimalString(recordValue(trade, 'sharesIn'), '') || undefined,
      sharesOut: decimalString(recordValue(trade, 'sharesOut'), '') || undefined,
      fee: decimalString(recordValue(trade, 'fee', 'feeUsd', 'feeAmountUsd'), '') || undefined,
      timestamp: text(trade.timestamp),
      blockNumber: integerString(recordValue(trade, 'blockNumber', 'blockHeight')),
      extrinsicHash: text(recordValue(trade, 'extrinsicHash', 'txHash')),
    } satisfies PolkamarktTrade];
  });
  return { positions, trades };
}

export function parseClaimable(value: unknown, account: string, marketId: string): PolkamarktClaimable | null {
  const record = codecRecord(value);
  if (!Object.keys(record).length) return null;
  const outcome = String(recordValue(record, 'resolutionOutcome') ?? '').toLowerCase();
  return {
    marketId: integerString(recordValue(record, 'marketId')) ?? marketId,
    account: text(record.account) ?? account,
    status: text(record.status) ?? '',
    resolutionOutcome: outcome === 'yes' ? 'Yes' : outcome === 'no' ? 'No' : undefined,
    yesShares: decimalString(recordValue(record, 'yesShares')),
    noShares: decimalString(recordValue(record, 'noShares')),
    netCollateralPaid: decimalString(recordValue(record, 'netCollateralPaid')),
    traderPayout: decimalString(recordValue(record, 'traderPayout')),
    claimablePayout: recordValue(record, 'claimablePayout') == null ? undefined : decimalString(recordValue(record, 'claimablePayout')),
    creatorFees: decimalString(recordValue(record, 'creatorFees')),
    isCreator: Boolean(recordValue(record, 'isCreator')),
  };
}

export function negotiateCapabilities(api: RecordValue): PolkamarktRuntimeCapabilities {
  const query = asRecord(asRecord(api.query).polkamarkt);
  const rpc = asRecord(asRecord(api.rpc).polkamarkt);
  const tx = asRecord(asRecord(api.tx).polkamarkt);
  const has = (record: RecordValue, ...keys: string[]): boolean => typeof recordValue(record, ...keys) === 'function';
  const browse = Boolean(asRecord(query.markets).entries || typeof query.markets === 'function');
  const capabilities: PolkamarktRuntimeCapabilities = {
    browse,
    quoteBuy: has(rpc, 'quoteBuy'),
    quoteSell: has(rpc, 'quoteSell'),
    marketState: has(rpc, 'marketState'),
    buy: has(tx, 'buy'),
    sell: has(tx, 'sell'),
    claimMarket: has(tx, 'claimMarket', 'claim_market'),
    claimCreatorFees: has(tx, 'claimCreatorFees', 'claim_creator_fees'),
    reasons: [],
  };
  if (!browse) capabilities.reasons.push('Connected SORA runtime does not expose Polkamarkt storage.');
  if (!capabilities.marketState) capabilities.reasons.push('Live market state is unavailable; trading is disabled.');
  if (!capabilities.quoteBuy || !capabilities.quoteSell) capabilities.reasons.push('Authoritative runtime quotes are unavailable.');
  return capabilities;
}

export interface RawInteger { readonly rawInteger: string }
export type RawRpcParam = string | number | boolean | null | RawInteger;

export function rawInteger(value: string): RawInteger {
  if (!INTEGER.test(value.trim())) throw new Error('RPC integer parameters must be non-negative integer strings.');
  return { rawInteger: value.trim() };
}

export function rawRpcPayload(id: number, method: string, params: RawRpcParam[]): string {
  const serialized = params.map((value) => {
    if (isRecord(value) && typeof value.rawInteger === 'string') return value.rawInteger;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('RPC numeric parameters must be finite.');
      return String(value);
    }
    return JSON.stringify(value);
  });
  return `{"jsonrpc":"2.0","id":${id},"method":${JSON.stringify(method)},"params":[${serialized.join(',')}]}`;
}
