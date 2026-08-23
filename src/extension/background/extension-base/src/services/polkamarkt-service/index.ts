import type {
  PolkamarktClaimable,
  PolkamarktMarket,
  PolkamarktMutationRequest,
  PolkamarktMutationResponse,
  PolkamarktQuote,
  PolkamarktQuoteRequest,
  PolkamarktRuntimeCapabilities,
  PolkamarktSnapshot,
} from '@/defi/polkamarkt/types';
import {
  asRecord,
  codecRecord,
  codecValue,
  deriveMarketStatus,
  fromCodecAmount,
  integerString,
  isRecord,
  mergeAndSortMarkets,
  minimumAfterSlippage,
  negotiateCapabilities,
  parseActivity,
  parseClaimable,
  parseHistory,
  parseIndexedMarket,
  parseRuntimeMarket,
  rawInteger,
  rawRpcPayload,
  recordValue,
  toCodecAmount,
} from '@/defi/polkamarkt/contract';

type UnknownRecord = Record<string, unknown>;
type Callable = (...params: unknown[]) => Promise<unknown>;
type TxFactory = (...params: unknown[]) => unknown;

export interface PolkamarktFinalAuthorizationContext {
  accountAddress: string;
  request: PolkamarktMutationRequest;
  extrinsic: unknown;
  networkFeeCodec: string;
}

export interface PolkamarktServiceOptions {
  apiRoot: UnknownRecord;
  endpoint?: string;
  indexerUrl?: string;
  accountAddress?: string;
  signable: boolean;
  isDisclaimerAccepted?: () => boolean;
  authorizeBeforeSubmit: (context: PolkamarktFinalAuthorizationContext) => Promise<void>;
  submit: (extrinsic: unknown) => Promise<{ hash?: string }>;
  estimateFee: (extrinsic: unknown) => Promise<string>;
  fetchFn?: typeof fetch;
  rawRpc?: (method: string, params: Array<string | number | boolean | null | { rawInteger: string }>) => Promise<unknown>;
}

const KUSD_ASSET_ID = '0x02000c0000000000000000000000000000000000000000000000000000000000';
const XOR_ASSET_ID = '0x0200000000000000000000000000000000000000000000000000000000000000';
const COLLATERAL_PRECISION = 18;
const RPC_TIMEOUT_MS = 12_000;
const MAX_MARKETS = 96;
let rpcRequestId = 0;

const LATEST_MARKETS_QUERY = `
  query PolkamarktLatestMarkets($limit: Int = 96) {
    markets(first: $limit, orderBy: [VOLUME_USD_DESC]) {
      edges { node {
        id marketId conditionId creator title description category oracle resolutionSource closeBlock status mechanism
        collateralAsset liquidityUsd: liquidityUSD volumeUsd: volumeUSD probability priceYes dpmCollateral
      } }
    }
  }
`;

const LEGACY_MARKETS_QUERY = `
  query PolkamarktLegacyMarkets($limit: Int = 96) {
    markets(first: $limit) {
      edges { node {
        id marketId conditionId creator title description category oracle resolutionSource closeBlock status mechanism
        collateralAsset liquidityUsd: liquidityUSD volumeUsd: volumeUSD probability priceYes
      } }
    }
  }
`;

const HISTORY_QUERY = `
  query PolkamarktMarketHistory($marketId: Int!, $limit: Int = 96) {
    marketSnapshots(first: $limit, orderBy: [TIMESTAMP_ASC], filter: { marketId: { equalTo: $marketId } }) {
      edges { node { id marketId timestamp blockHeight probability priceYes priceNo liquidityUsd: liquidityUSD volumeUsd: volumeUSD status } }
    }
  }
`;

const ACTIVITY_QUERY = `
  query PolkamarktAccountActivity($account: String!, $limit: Int = 50) {
    accountPositions(first: $limit, orderBy: [UPDATED_AT_DESC], filter: { account: { equalTo: $account } }) {
      edges { node {
        id marketId outcome shares yesShares noShares netCollateralPaid claimablePayout isCreator status updatedAt
        market { id marketId title status }
      } }
    }
    accountTrades(first: $limit, orderBy: [TIMESTAMP_DESC], filter: { account: { equalTo: $account } }) {
      edges { node { id marketId side outcome collateralAmount sharesIn sharesOut feeAmount timestamp blockNumber extrinsicHash } }
    }
  }
`;

const LEGACY_ACTIVITY_QUERY = `
  query PolkamarktLegacyAccountActivity($account: String!, $limit: Int = 50) {
    accountPositions(first: $limit, filter: { account: { equalTo: $account } }) {
      edges { node { id marketId outcome shares yesShares noShares netCollateralPaid isCreator status updatedAt } }
    }
    accountTrades(first: $limit, filter: { account: { equalTo: $account } }) {
      edges { node { id marketId side outcome sharesIn sharesOut timestamp blockNumber extrinsicHash } }
    }
  }
`;

function graphNodes(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  const edges = asRecord(value).edges;
  return Array.isArray(edges) ? edges.map((edge) => asRecord(edge).node).filter(isRecord) : [];
}

function runtimeId(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('Invalid Polkamarkt market id.');
  return parsed;
}

function callable(record: UnknownRecord, ...keys: string[]): Callable | undefined {
  const value = recordValue(record, ...keys);
  return typeof value === 'function' ? (value as Callable) : undefined;
}

function txFactory(record: UnknownRecord, ...keys: string[]): TxFactory | undefined {
  const value = recordValue(record, ...keys);
  return typeof value === 'function' ? (value as TxFactory) : undefined;
}

function integerField(record: UnknownRecord, ...keys: string[]): string {
  return integerString(recordValue(record, ...keys)) ?? '0';
}

function exactOutcome(value: unknown, fallback: 'Yes' | 'No'): 'Yes' | 'No' {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'yes') return 'Yes';
  if (normalized === 'no') return 'No';
  throw new Error('SORA runtime returned an invalid quote outcome.');
}

function positiveCodec(value: string, message: string): bigint {
  const parsed = BigInt(toCodecAmount(value, COLLATERAL_PRECISION));
  if (parsed <= 0n) throw new Error(message);
  return parsed;
}

function claimAmount(value: string | undefined): bigint {
  return BigInt(integerString(value) ?? '0');
}

export class PolkamarktService {
  private readonly fetchFn: typeof fetch;
  private readonly api: UnknownRecord;
  private discoveredRpcMethods: Set<string> | null = null;

  constructor(private readonly options: PolkamarktServiceOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.api = asRecord(options.apiRoot.api);
  }

  private async graphql(query: string, variables: UnknownRecord): Promise<UnknownRecord> {
    if (!this.options.indexerUrl) throw new Error('SORA Polkamarkt indexer is not configured.');
    const response = await this.fetchFn(this.options.indexerUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new Error(`Polkamarkt indexer returned HTTP ${response.status}.`);
    const payload = asRecord(await response.json());
    const errors = payload.errors;
    if (Array.isArray(errors) && errors.length) {
      throw new Error(String(asRecord(errors[0]).message ?? 'Polkamarkt indexer query failed.'));
    }
    return asRecord(payload.data);
  }

  private async rawRpc(method: string, params: Array<string | number | boolean | null | { rawInteger: string }>): Promise<unknown> {
    if (this.options.rawRpc) return this.options.rawRpc(method, params);
    const endpoint = this.options.endpoint;
    if (!endpoint) throw new Error('SORA runtime endpoint is unavailable.');
    const id = ++rpcRequestId;
    const payload = rawRpcPayload(id, method, params);

    if (/^https?:/i.test(endpoint)) {
      const response = await this.fetchFn(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
      });
      const result = asRecord(await response.json());
      if (result.error) throw new Error(String(asRecord(result.error).message ?? `${method} failed.`));
      return result.result;
    }

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(endpoint);
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        socket.close();
        callback();
      };
      const timeout = setTimeout(
        () => finish(() => reject(new Error(`${method} timed out.`))),
        RPC_TIMEOUT_MS
      );
      socket.onopen = () => socket.send(payload);
      socket.onerror = () => finish(() => reject(new Error(`${method} websocket request failed.`)));
      socket.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        let response: UnknownRecord;
        try {
          response = asRecord(JSON.parse(event.data));
        } catch {
          finish(() => reject(new Error(`${method} returned invalid JSON.`)));
          return;
        }
        if (response.id !== id) return;
        if (response.error) finish(() => reject(new Error(String(asRecord(response.error).message ?? `${method} failed.`))));
        else finish(() => resolve(response.result));
      };
    });
  }

  private async runtimeRpcMethods(forceRefresh = false): Promise<Set<string>> {
    if (!forceRefresh && this.discoveredRpcMethods) return this.discoveredRpcMethods;
    try {
      const response = asRecord(await this.rawRpc('rpc_methods', []));
      const methods = Array.isArray(response.methods) ? response.methods.map(String) : [];
      this.discoveredRpcMethods = new Set(methods);
    } catch {
      this.discoveredRpcMethods = new Set();
    }
    return this.discoveredRpcMethods;
  }

  private async capabilities(forceRefresh = false): Promise<PolkamarktRuntimeCapabilities> {
    const result = negotiateCapabilities(this.api);
    const methods = await this.runtimeRpcMethods(forceRefresh);
    result.quoteBuy ||= methods.has('polkamarkt_quoteBuy');
    result.quoteSell ||= methods.has('polkamarkt_quoteSell');
    result.marketState ||= methods.has('polkamarkt_marketState');
    if (!result.quoteBuy || !result.quoteSell) {
      if (!result.reasons.includes('Authoritative runtime quotes are unavailable.')) {
        result.reasons.push('Authoritative runtime quotes are unavailable.');
      }
    } else {
      result.reasons = result.reasons.filter((reason) => reason !== 'Authoritative runtime quotes are unavailable.');
    }
    return result;
  }

  private async currentBlock(): Promise<string> {
    const chainRpc = asRecord(asRecord(this.api.rpc).chain);
    const getHeader = callable(chainRpc, 'getHeader');
    if (!getHeader) return '0';
    try {
      const header = asRecord(codecValue(await getHeader()));
      return integerString(header.number) ?? integerString(String(header.number ?? '')) ?? '0';
    } catch {
      return '0';
    }
  }

  private async authoritativeCurrentBlock(): Promise<string> {
    const chainRpc = asRecord(asRecord(this.api.rpc).chain);
    const getHeader = callable(chainRpc, 'getHeader');
    if (!getHeader) throw new Error('The current SORA block is unavailable. Refresh before trading.');

    const header = asRecord(codecValue(await getHeader()));
    const block = integerString(header.number) ?? integerString(String(header.number ?? ''));
    if (!block) throw new Error('The current SORA block is unavailable. Refresh before trading.');

    return block;
  }

  private async indexedMarkets(currentBlock: string): Promise<PolkamarktMarket[]> {
    let data: UnknownRecord;
    try {
      data = await this.graphql(LATEST_MARKETS_QUERY, { limit: MAX_MARKETS });
      if (!graphNodes(data.markets).length) data = await this.graphql(LEGACY_MARKETS_QUERY, { limit: MAX_MARKETS });
    } catch (latestError) {
      try {
        data = await this.graphql(LEGACY_MARKETS_QUERY, { limit: MAX_MARKETS });
      } catch {
        throw latestError;
      }
    }
    return graphNodes(data.markets).flatMap((record) => {
      const market = parseIndexedMarket(record, currentBlock);
      return market ? [market] : [];
    });
  }

  private async runtimeMarkets(currentBlock: string): Promise<PolkamarktMarket[]> {
    const storage = asRecord(asRecord(this.api.query).polkamarkt);
    const storageMarkets = recordValue(storage, 'markets') as { entries?: () => Promise<Array<[UnknownRecord, unknown]>> } | undefined;
    if (!storageMarkets?.entries) return [];
    const decoratedRpc = asRecord(asRecord(this.api.rpc).polkamarkt);
    const methods = await this.runtimeRpcMethods();
    const marketState = callable(decoratedRpc, 'marketState');
    const runtimeRpc: UnknownRecord = {
      ...decoratedRpc,
      marketState:
        marketState ??
        (methods.has('polkamarkt_marketState')
          ? (marketId: unknown) => this.rawRpc('polkamarkt_marketState', [Number(marketId)])
          : undefined),
    };
    const entries = await storageMarkets.entries();
    const parsed = await Promise.all(
      entries.slice(0, MAX_MARKETS).map(async ([key, value]) => {
        const args = Array.isArray(key.args) ? key.args : [];
        const marketId = integerString(args[0]);
        return marketId ? parseRuntimeMarket(storage, runtimeRpc, marketId, value, currentBlock) : null;
      })
    );
    return parsed.filter((market): market is PolkamarktMarket => Boolean(market));
  }

  private async history(marketId?: string): Promise<ReturnType<typeof parseHistory>> {
    if (!marketId) return [];
    try {
      const data = await this.graphql(HISTORY_QUERY, { marketId: runtimeId(marketId), limit: 96 });
      return parseHistory(data);
    } catch {
      return [];
    }
  }

  private async activity(): Promise<ReturnType<typeof parseActivity>> {
    if (!this.options.accountAddress) return { positions: [], trades: [] };
    try {
      let data: UnknownRecord;
      try {
        data = await this.graphql(ACTIVITY_QUERY, { account: this.options.accountAddress, limit: 50 });
      } catch {
        data = await this.graphql(LEGACY_ACTIVITY_QUERY, { account: this.options.accountAddress, limit: 50 });
      }
      return parseActivity(data);
    } catch {
      return { positions: [], trades: [] };
    }
  }

  private async claimable(marketIds: string[]): Promise<PolkamarktClaimable[]> {
    const account = this.options.accountAddress;
    if (!account || !marketIds.length) return [];
    const rpc = asRecord(asRecord(this.api.rpc).polkamarkt);
    const decorated = callable(rpc, 'claimable');
    const methods = await this.runtimeRpcMethods();
    if (!decorated && !methods.has('polkamarkt_claimable')) return [];
    const uniqueIds = [...new Set(marketIds)].slice(0, 50);
    const claims = await Promise.all(
      uniqueIds.map(async (marketId) => {
        try {
          const result = decorated
            ? await decorated(account, runtimeId(marketId))
            : await this.rawRpc('polkamarkt_claimable', [account, runtimeId(marketId)]);
          return parseClaimable(result, account, marketId);
        } catch {
          return null;
        }
      })
    );
    return claims.filter((claim): claim is PolkamarktClaimable => Boolean(claim));
  }

  private async usableAssetBalance(assetId: string): Promise<bigint | null> {
    const account = this.options.accountAddress;
    if (!account) return null;
    const assetsRpc = asRecord(asRecord(this.api.rpc).assets);
    const usableBalance = callable(assetsRpc, 'usableBalance');
    if (!usableBalance) return null;
    try {
      const value = codecValue(await usableBalance(account, assetId));
      return BigInt(integerString(value) ?? '0');
    } catch {
      return null;
    }
  }

  private async positiveAssetBalance(assetId: string): Promise<boolean> {
    const balance = await this.usableAssetBalance(assetId);
    return balance !== null && balance > 0n;
  }

  private async authoritativeMarketStatus(marketId: string): Promise<PolkamarktMarket['displayStatus']> {
    const storage = asRecord(asRecord(this.api.query).polkamarkt);
    const markets = recordValue(storage, 'markets') as
      | (((id: number) => Promise<unknown>) & {
          entries?: () => Promise<Array<[UnknownRecord, unknown]>>;
        })
      | { entries?: () => Promise<Array<[UnknownRecord, unknown]>> }
      | undefined;
    if (!markets) throw new Error('The selected market is not authoritative in the connected SORA runtime.');

    let value: unknown;
    if (typeof markets === 'function') {
      value = await markets(runtimeId(marketId));
    } else if (markets.entries) {
      const entries = await markets.entries();
      value = entries.find(([key]) => {
        const args = Array.isArray(key.args) ? key.args : [];

        return integerString(args[0]) === marketId;
      })?.[1];
    }

    const market = codecRecord(value);
    if (!Object.keys(market).length) {
      throw new Error('The selected market is not authoritative in the connected SORA runtime.');
    }
    const returnedId = integerString(recordValue(market, 'marketId', 'id'));
    if (returnedId && returnedId !== marketId) {
      throw new Error('The selected market is not authoritative in the connected SORA runtime.');
    }

    const runtimeStatus = String(recordValue(market, 'status') ?? '').replace(/[_\s-]/g, '').toLowerCase();
    if (!['open', 'active', 'trading', 'closed', 'resolved', 'cancelled', 'canceled', 'locked', 'earlyreportlocked'].includes(runtimeStatus)) {
      throw new Error('Live market status is unavailable. Refresh before trading.');
    }

    return deriveMarketStatus(
      recordValue(market, 'status'),
      recordValue(market, 'closeBlock'),
      await this.authoritativeCurrentBlock()
    );
  }

  async snapshot(marketId?: string): Promise<PolkamarktSnapshot> {
    const warnings: string[] = [];
    const currentBlock = await this.currentBlock();
    let indexed: PolkamarktMarket[] = [];
    let runtime: PolkamarktMarket[] = [];
    let indexerStale = false;
    try {
      indexed = await this.indexedMarkets(currentBlock);
    } catch (error) {
      indexerStale = true;
      warnings.push(error instanceof Error ? error.message : 'Polkamarkt indexer is unavailable.');
    }
    try {
      runtime = await this.runtimeMarkets(currentBlock);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'SORA runtime market catalog is unavailable.');
    }
    const markets = mergeAndSortMarkets(indexed, runtime);
    const [history, activity, capabilities, hasKusd, hasXorForFees] = await Promise.all([
      this.history(marketId),
      this.activity(),
      this.capabilities(),
      this.positiveAssetBalance(KUSD_ASSET_ID),
      this.positiveAssetBalance(XOR_ASSET_ID),
    ]);
    const claimIds = [...activity.positions.map((position) => position.marketId), ...markets.filter((market) => market.displayStatus === 'resolved' || market.displayStatus === 'cancelled').map((market) => market.id)];
    const claimable = await this.claimable(claimIds);
    const signable = Boolean(this.options.accountAddress && this.options.signable);
    const accountReason = !this.options.accountAddress
      ? 'Add a SORA account to trade or claim.'
      : !signable
        ? 'This SORA account is watch-only or requires an unsupported external signer.'
        : !hasXorForFees
          ? 'Add XOR to pay SORA network fees.'
          : !hasKusd
            ? 'Add KUSD collateral to buy market shares.'
            : undefined;
    return {
      network: 'SORA Mainnet',
      collateral: 'KUSD',
      feeAsset: 'XOR',
      currentBlock,
      markets,
      history,
      positions: activity.positions,
      trades: activity.trades,
      claimable,
      capabilities,
      account: {
        address: this.options.accountAddress ?? null,
        signable,
        hasKusd,
        hasXorForFees,
        reason: accountReason,
      },
      indexerStale,
      warnings: [...warnings, ...capabilities.reasons],
    };
  }

  private async quoteRecord(request: PolkamarktQuoteRequest): Promise<UnknownRecord> {
    const apiRpc = asRecord(asRecord(this.api.rpc).polkamarkt);
    const amountCodec = toCodecAmount(request.amount, COLLATERAL_PRECISION);
    const method = request.mode === 'buy' ? 'polkamarkt_quoteBuy' : 'polkamarkt_quoteSell';
    const decorated = callable(apiRpc, request.mode === 'buy' ? 'quoteBuy' : 'quoteSell');
    try {
      const record = codecRecord(
        await this.rawRpc(method, [runtimeId(request.marketId), request.outcome, rawInteger(amountCodec)])
      );
      if (Object.keys(record).length || !decorated) return record;
    } catch (rawError) {
      if (!decorated) throw rawError;
    }

    return codecRecord(await decorated(runtimeId(request.marketId), request.outcome, amountCodec));
  }

  async quote(request: PolkamarktQuoteRequest): Promise<PolkamarktQuote> {
    if (!['buy', 'sell'].includes(request.mode) || !['Yes', 'No'].includes(request.outcome)) {
      throw new Error('Invalid Polkamarkt quote request.');
    }
    if (!request.amount || BigInt(toCodecAmount(request.amount, COLLATERAL_PRECISION)) <= 0n) {
      throw new Error('Amount must be greater than zero.');
    }
    const record = await this.quoteRecord(request);
    if (!Object.keys(record).length) throw new Error('SORA runtime returned no quote.');
    const resultCodec = request.mode === 'buy'
      ? integerField(record, 'sharesOut')
      : integerField(record, 'collateralOut');
    const amountCodec = request.mode === 'buy'
      ? integerField(record, 'collateralIn')
      : integerField(record, 'sharesIn');
    const tx = this.buildTradeTx(request, amountCodec, minimumAfterSlippage(resultCodec));
    const networkFeeCodec = await this.options.estimateFee(tx);
    return {
      marketId: integerString(recordValue(record, 'marketId')) ?? request.marketId,
      mode: request.mode,
      outcome: exactOutcome(record.outcome, request.outcome),
      amount: fromCodecAmount(amountCodec, COLLATERAL_PRECISION),
      feeAmount: fromCodecAmount(integerField(record, 'feeAmount'), COLLATERAL_PRECISION),
      networkFee: fromCodecAmount(integerString(networkFeeCodec) ?? '0', COLLATERAL_PRECISION),
      resultAmount: fromCodecAmount(resultCodec, COLLATERAL_PRECISION),
      minimumResult: fromCodecAmount(minimumAfterSlippage(resultCodec), COLLATERAL_PRECISION),
    };
  }

  private buildTradeTx(request: PolkamarktQuoteRequest, amountCodec: string, minimumResultCodec: string): unknown {
    const tx = asRecord(asRecord(this.api.tx).polkamarkt);
    const factory = txFactory(tx, request.mode === 'buy' ? 'buy' : 'sell');
    if (!factory) throw new Error(`Connected SORA runtime does not expose Polkamarkt ${request.mode}.`);
    return factory(runtimeId(request.marketId), request.outcome, amountCodec, minimumResultCodec);
  }

  private buildClaimTx(action: 'claimMarket' | 'claimCreatorFees', marketId: string): unknown {
    const tx = asRecord(asRecord(this.api.tx).polkamarkt);
    const factory = txFactory(tx, action, action === 'claimMarket' ? 'claim_market' : 'claim_creator_fees');
    if (!factory) throw new Error(`Connected SORA runtime does not expose ${action}.`);
    return factory(runtimeId(marketId));
  }

  private async prepareMutation(
    request: PolkamarktMutationRequest,
    forceCapabilityRefresh = false
  ): Promise<{ extrinsic: unknown; networkFeeCodec: bigint }> {
    if (!['buy', 'sell', 'claimMarket', 'claimCreatorFees'].includes(request.action)) {
      throw new Error('Unsupported Polkamarkt action.');
    }

    const capabilities = await this.capabilities(forceCapabilityRefresh);
    let extrinsic: unknown;
    let networkFeeCodec: bigint;
    if (request.action === 'buy' || request.action === 'sell') {
      if (request.action !== request.mode) throw new Error('The market order action no longer matches its quote.');
      const displayStatus = await this.authoritativeMarketStatus(request.marketId);
      if (displayStatus !== 'open') throw new Error('This market is no longer open. Refresh before trading.');
      if (!capabilities.marketState) throw new Error('Live market state is unavailable.');
      if (
        (request.mode === 'buy' && (!capabilities.buy || !capabilities.quoteBuy)) ||
        (request.mode === 'sell' && (!capabilities.sell || !capabilities.quoteSell))
      ) {
        throw new Error('Connected SORA runtime does not expose this Polkamarkt trade.');
      }

      const requestedAmountCodec = positiveCodec(request.amount, 'Enter a positive trade amount.');
      const requestedMinimumCodec = positiveCodec(
        request.minimumResult,
        'Refresh the market quote before confirming.'
      );
      const freshQuote = await this.quote({
        marketId: request.marketId,
        mode: request.mode,
        outcome: request.outcome,
        amount: request.amount,
      });
      const quotedAmountCodec = positiveCodec(freshQuote.amount, 'SORA returned an invalid quote amount.');
      const quotedMinimumCodec = positiveCodec(
        freshQuote.minimumResult,
        'SORA returned an invalid minimum result.'
      );
      const quotedResultCodec = positiveCodec(freshQuote.resultAmount, 'SORA returned an invalid quote result.');
      if (
        freshQuote.marketId !== request.marketId ||
        freshQuote.mode !== request.mode ||
        freshQuote.outcome !== request.outcome ||
        quotedAmountCodec !== requestedAmountCodec
      ) {
        throw new Error('The market quote no longer matches this order. Refresh before confirming.');
      }
      if (requestedMinimumCodec !== quotedMinimumCodec || quotedMinimumCodec > quotedResultCodec) {
        throw new Error('The market quote changed. Review the new minimum before confirming.');
      }

      if (request.mode === 'buy') {
        const marketFeeCodec = BigInt(toCodecAmount(freshQuote.feeAmount, COLLATERAL_PRECISION));
        const kusdBalance = await this.usableAssetBalance(KUSD_ASSET_ID);
        if (kusdBalance === null || kusdBalance < requestedAmountCodec + marketFeeCodec) {
          throw new Error('Add enough KUSD for the order and its current market fee.');
        }
      } else {
        const [position] = await this.claimable([request.marketId]);
        const availableShares = position
          ? claimAmount(request.outcome === 'Yes' ? position.yesShares : position.noShares)
          : 0n;
        if (availableShares < requestedAmountCodec) {
          throw new Error('The order exceeds the available market shares.');
        }
      }

      networkFeeCodec = positiveCodec(freshQuote.networkFee, 'Refresh the current XOR network fee.');
      extrinsic = this.buildTradeTx(request, quotedAmountCodec.toString(), quotedMinimumCodec.toString());
    } else {
      const [authoritativeClaim] = await this.claimable([request.marketId]);
      if (!authoritativeClaim || authoritativeClaim.marketId !== request.marketId) {
        throw new Error('This market has no authoritative claim for the selected SORA account.');
      }
      if (request.action === 'claimMarket') {
        if (!capabilities.claimMarket) throw new Error('Trader claims are unavailable on this runtime.');
        const payout = [authoritativeClaim.claimablePayout, authoritativeClaim.traderPayout]
          .map(claimAmount)
          .reduce((maximum, value) => (value > maximum ? value : maximum), 0n);
        if (payout <= 0n) throw new Error('There is no trader payout to claim.');
      } else {
        if (!capabilities.claimCreatorFees) throw new Error('Creator claims are unavailable on this runtime.');
        if (!authoritativeClaim.isCreator || claimAmount(authoritativeClaim.creatorFees) <= 0n) {
          throw new Error('There are no creator fees to claim.');
        }
      }
      extrinsic = this.buildClaimTx(request.action, request.marketId);
      networkFeeCodec = BigInt(integerString(await this.options.estimateFee(extrinsic)) ?? '0');
      if (networkFeeCodec <= 0n) throw new Error('Refresh the current XOR network fee.');
    }

    const xorBalance = await this.usableAssetBalance(XOR_ASSET_ID);
    if (xorBalance === null || xorBalance < networkFeeCodec) {
      throw new Error('Add enough XOR to pay the current SORA network fee.');
    }

    return { extrinsic, networkFeeCodec };
  }

  async mutate(request: PolkamarktMutationRequest): Promise<PolkamarktMutationResponse> {
    if (!this.options.isDisclaimerAccepted?.()) {
      return { status: false, error: 'Accept the Polkaswap and SORA risk disclaimer first.' };
    }
    const accountAddress = this.options.accountAddress;
    if (!accountAddress) return { status: false, error: 'Add a SORA account.' };
    if (!this.options.signable) return { status: false, error: 'This SORA account cannot sign in this wallet.' };
    const capturedRequest = Object.freeze({ ...request }) as PolkamarktMutationRequest;

    try {
      // Preflight produces user-facing failures early. Every mutable runtime
      // fact is deliberately fetched again below at the execution boundary.
      await this.prepareMutation(capturedRequest);
      const final = await this.prepareMutation(capturedRequest, true);
      await this.options.authorizeBeforeSubmit({
        accountAddress,
        request: capturedRequest,
        extrinsic: final.extrinsic,
        networkFeeCodec: final.networkFeeCodec.toString(),
      });
      const result = await this.options.submit(final.extrinsic);
      return { status: true, hash: result.hash };
    } catch (error) {
      return { status: false, error: error instanceof Error ? error.message : 'Polkamarkt transaction failed.' };
    }
  }
}
