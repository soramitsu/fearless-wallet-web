import { Address, type Cell } from '@ton/core';
import {
  TonProviderError,
  type TonAccountBalance,
  type TonDataProvider,
  type TonHistoryAction,
  type TonHistoryEvent,
  type TonHistoryJetton,
  type TonJettonHolding,
  type TonJettonScan,
  type TonNetworkKind,
  type TonWalletState,
} from './types';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

// The routes below are TI's own (`/api/indexer/v1/...`, OpenAPI at /api/indexer/v1/openapi.json); TI does not
// serve TonAPI's `/v2/...` routes.
type TiServiceInfo = {
  schemaVersion: number;
  serviceId: string;
  ecosystem: string;
  chainId: string;
  network: string;
  publicBaseUrl: string;
  readOnly: boolean;
  capabilities: string[];
};

type TiBalanceResponse = {
  ton: { balance: string; last_tx_lt?: string; last_tx_hash?: string };
  jettons: Array<{ master: string; wallet: string; balance: string; decimals?: number; symbol?: string }>;
  network: string;
};

type TiStateResponse = {
  address: string;
  account_state?: 'active' | 'uninitialized' | 'frozen' | null;
  network: string;
};

type TiAssetRef = { kind: 'ton' } | { kind: 'jetton'; master: string; symbol?: string };

type TiTxAction =
  | { kind: 'transfer'; asset: TiAssetRef; amount: string; from?: string; to?: string }
  | { kind: 'swap'; tokenIn?: TiAssetRef; tokenOut?: TiAssetRef; amountIn?: string; amountOut?: string; sender?: string }
  | { kind: string };

type TiTx = {
  txId: string;
  utime: number;
  status: string;
  lt: string;
  hash: string;
  actions: TiTxAction[];
};

type TiTxResponse = {
  page_size: number;
  txs: TiTx[];
  network: string;
};

type TiRunGetMethodResponse = {
  exit_code: number;
  stack: Array<[string, unknown]>;
};

type TiJsonRpcResponse = { ok: boolean; error?: string; code?: number };

const TI_SERVICE_ID = 'ti.soramitsu.io';
const TI_REQUIRED_CAPABILITIES = ['account-balance', 'account-state', 'account-transactions', 'run-get-method'];
const TI_REQUEST_TIMEOUT_MS = 10_000;
// History is read a page (10 transactions) at a time; the wallet shows the latest ones.
const TI_HISTORY_MAX_PAGES = 5;

/**
 * TON through the TONSWAP indexer's own API. Nothing is read before `verify()` has seen TI name the requested
 * network in its service-info, and every balance, state and history answer must name it again.
 */
class TiTonProvider implements TonDataProvider {
  readonly source = 'ti' as const;
  readonly baseUrl: string;
  private serviceInfo?: TiServiceInfo;

  constructor(
    baseUrl: string,
    readonly network: TonNetworkKind,
    private readonly fetchFn: FetchLike = globalThis.fetch.bind(globalThis)
  ) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  /** TI accepts transactions only when its service-info says it is not read-only. */
  get canBroadcast(): boolean {
    return this.serviceInfo?.readOnly === false;
  }

  async verify(): Promise<void> {
    let info: unknown;

    try {
      info = await this.request('/api/indexer/v1/service-info');
    } catch (error) {
      throw new TonProviderError('ton_provider_unverified', `service-info: ${describeError(error)}`);
    }

    const problem = serviceInfoProblem(info, this.network, this.baseUrl);

    if (problem) throw new TonProviderError('ton_provider_unverified', problem);

    this.serviceInfo = info as TiServiceInfo;
  }

  async getAccountBalance(address: Address): Promise<TonAccountBalance> {
    const { ton } = await this.getBalanceResponse(address);
    const balance = parseUnsigned(ton?.balance, 'ton.balance');
    const lastTxLt = ton.last_tx_lt?.trim();

    return { balance, hasActivity: balance > 0n || Boolean(lastTxLt && lastTxLt !== '0') };
  }

  async getJettonBalances(address: Address): Promise<TonJettonScan> {
    const { jettons } = await this.getBalanceResponse(address);

    if (!Array.isArray(jettons)) throw new TonProviderError('ton_provider_invalid_response', 'jettons');

    const holdings = jettons.flatMap<TonJettonHolding>(({ master, wallet, balance, decimals, symbol }) => {
      // An amount without its decimals cannot be shown truthfully.
      if (!Number.isInteger(decimals) || decimals! < 0 || decimals! > 255) {
        console.warn('[TON][TI] Skipping a jetton without decimals', master);

        return [];
      }

      return [
        {
          master: parseAddress(master, 'jetton master'),
          wallet: parseAddress(wallet, 'jetton wallet'),
          balance: parseUnsigned(balance, 'jetton balance'),
          decimals: decimals!,
          symbol: symbol?.trim() ?? '',
          name: symbol?.trim() ?? '',
          image: '',
          verified: false,
        },
      ];
    });

    // TI reports only the jettons it indexes, so a jetton it does not list may still be held.
    return { holdings, complete: false };
  }

  async getHistory(address: Address, limit: number): Promise<TonHistoryEvent[]> {
    const events: TonHistoryEvent[] = [];

    for (let page = 1; page <= TI_HISTORY_MAX_PAGES && events.length < limit; page += 1) {
      const response = await this.requestForNetwork<TiTxResponse>(`${accountPath(address)}/txs?page=${page}`);

      if (!Array.isArray(response.txs)) throw new TonProviderError('ton_provider_invalid_response', 'txs');

      events.push(...response.txs.map(toHistoryEvent));

      if (response.txs.length === 0 || response.txs.length < response.page_size) break;
    }

    return events.slice(0, limit);
  }

  async getRates(): Promise<undefined> {
    return undefined;
  }

  async getWalletState(address: Address): Promise<TonWalletState> {
    const { account_state: accountState } = await this.requestForNetwork<TiStateResponse>(`${accountPath(address)}/state`);

    if (accountState === 'frozen') throw new TonProviderError('ton_provider_invalid_response', 'wallet is frozen');
    if (accountState === 'uninitialized') return { seqno: 0, deployed: false };

    try {
      return { seqno: await this.getSeqno(address), deployed: true };
    } catch (error) {
      // An active wallet always answers `seqno`; only a wallet TI has not seen yet may have no code.
      if (accountState === 'active') throw error;

      return { seqno: 0, deployed: false };
    }
  }

  async sendMessage(boc: Cell): Promise<void> {
    this.assertVerified();

    if (!this.canBroadcast) throw new TonProviderError('ton_broadcast_unavailable', 'TI is read-only');

    const response = await this.request<TiJsonRpcResponse>('/api/v2/jsonRPC', {
      method: 'POST',
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'sendBoc', params: { boc: boc.toBoc().toString('base64') } }),
    });

    if (response?.ok !== true) {
      throw new TonProviderError('ton_provider_request_failed', `sendBoc: ${response?.error ?? 'rejected'}`, response?.code);
    }
  }

  private async getSeqno(address: Address): Promise<number> {
    this.assertVerified();

    const response = await this.request<TiRunGetMethodResponse>('/api/indexer/v1/runGetMethod', {
      method: 'POST',
      body: JSON.stringify({ address: address.toString(), method: 'seqno', stack: [] }),
    });

    if (response?.exit_code !== 0 || !Array.isArray(response.stack)) {
      throw new TonProviderError('ton_provider_invalid_response', `seqno exit code ${response?.exit_code}`);
    }

    const [type, value] = response.stack[0] ?? [];
    const seqno = type === 'num' && typeof value === 'string' ? Number(BigInt(value)) : NaN;

    if (!Number.isSafeInteger(seqno) || seqno < 0) throw new TonProviderError('ton_provider_invalid_response', 'seqno');

    return seqno;
  }

  private getBalanceResponse(address: Address): Promise<TiBalanceResponse> {
    return this.requestForNetwork<TiBalanceResponse>(`${accountPath(address)}/balance`);
  }

  private async requestForNetwork<T extends { network: string }>(path: string): Promise<T> {
    this.assertVerified();

    const body = await this.request<T>(path);

    if (!isRecord(body)) throw new TonProviderError('ton_provider_invalid_response', path);
    if (body.network !== this.network) {
      throw new TonProviderError(
        'ton_provider_network_mismatch',
        `asked for TON ${this.network}, TI answered ${String(body.network)}`
      );
    }

    return body;
  }

  private assertVerified(): void {
    if (!this.serviceInfo) throw new TonProviderError('ton_provider_unverified', 'service-info not checked');
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TI_REQUEST_TIMEOUT_MS);
    let response: Response;

    try {
      response = await this.fetchFn(`${this.baseUrl}${path}`, {
        ...init,
        headers: init.body ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' },
        redirect: 'error',
        signal: controller.signal,
      });
    } catch (error) {
      throw new TonProviderError('ton_provider_request_failed', describeError(error));
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) throw new TonProviderError('ton_provider_request_failed', `HTTP ${response.status}`, response.status);

    try {
      return (await response.json()) as T;
    } catch {
      throw new TonProviderError('ton_provider_invalid_response', `${path}: not JSON`);
    }
  }
}

function serviceInfoProblem(info: unknown, network: TonNetworkKind, baseUrl: string): string | undefined {
  if (!isRecord(info)) return 'service-info is not an object';
  if (info.schemaVersion !== 1) return `service-info schemaVersion ${String(info.schemaVersion)}`;
  if (info.serviceId !== TI_SERVICE_ID) return `service-info serviceId ${String(info.serviceId)}`;
  if (info.ecosystem !== 'ton') return `service-info ecosystem ${String(info.ecosystem)}`;
  if (info.chainId !== `ton:${network}` || info.network !== network) {
    return `TI serves ${String(info.chainId)} (${String(info.network)}), not ton:${network}`;
  }
  if (typeof info.publicBaseUrl !== 'string' || normalizeBaseUrl(info.publicBaseUrl) !== baseUrl) {
    return `service-info publicBaseUrl ${String(info.publicBaseUrl)}`;
  }

  const capabilities = Array.isArray(info.capabilities) ? info.capabilities : [];
  const missing = TI_REQUIRED_CAPABILITIES.filter((capability) => !capabilities.includes(capability));

  return missing.length ? `service-info lacks ${missing.join(', ')}` : undefined;
}

function toHistoryEvent({ txId, lt, hash, utime, status, actions }: TiTx): TonHistoryEvent {
  const success = status === 'success';

  return {
    eventId: txId || `${lt}:${hash}`,
    timestamp: utime,
    actions: (Array.isArray(actions) ? actions : []).flatMap((action): TonHistoryAction[] => {
      if (action.kind === 'transfer' && 'asset' in action) {
        const { asset, amount, from, to } = action;
        const parties = { sender: optionalAddress(from), recipient: optionalAddress(to) };

        if (asset?.kind === 'ton') return [{ type: 'ton-transfer', success, amount: String(amount), ...parties }];

        const jetton = jettonOf(asset);

        return jetton ? [{ type: 'jetton-transfer', success, amount: String(amount), jetton, ...parties }] : [];
      }

      if (action.kind === 'swap' && ('amountIn' in action || 'amountOut' in action)) {
        const { tokenIn, tokenOut, amountIn, amountOut, sender } = action as Extract<TiTxAction, { kind: 'swap' }>;

        return [
          {
            type: 'jetton-swap',
            success,
            amountIn: String(amountIn ?? '0'),
            amountOut: String(amountOut ?? '0'),
            userWallet: optionalAddress(sender),
            jettonIn: jettonOf(tokenIn),
            jettonOut: jettonOf(tokenOut),
          },
        ];
      }

      return [];
    }),
  };
}

function jettonOf(asset: TiAssetRef | undefined): TonHistoryJetton | undefined {
  if (asset?.kind !== 'jetton') return undefined;

  const master = optionalAddress(asset.master);

  return master ? { master, symbol: asset.symbol ?? '' } : undefined;
}

function accountPath(address: Address): string {
  return `/api/indexer/v1/accounts/${encodeURIComponent(address.toString())}`;
}

function parseAddress(value: unknown, label: string): Address {
  try {
    return Address.parse(String(value));
  } catch {
    throw new TonProviderError('ton_provider_invalid_response', label);
  }
}

function optionalAddress(value: unknown): Address | undefined {
  try {
    return typeof value === 'string' && value ? Address.parse(value) : undefined;
  } catch {
    return undefined;
  }
}

function parseUnsigned(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new TonProviderError('ton_provider_invalid_response', label);

  return BigInt(value);
}

function normalizeBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);

  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new TonProviderError('ton_provider_unverified', `not https: ${baseUrl}`);
  }

  return url.origin;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { TiTonProvider, type TiServiceInfo };
