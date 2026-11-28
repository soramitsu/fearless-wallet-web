import axios from 'axios';
import { parseEvmTokenList, parseEvmTokenListIndex, type EvmListedToken } from './tokenList';

export type { EvmListedToken } from './tokenList';

/** How long a list file may take to arrive. */
export const EVM_TOKEN_LIST_FETCH_TIMEOUT_MS = 15_000;

/**
 * Fetches `index.json` or `<chainId>.json` from the lists' folder, or undefined when the file does not exist. The
 * request carries no wallet address: every wallet fetches the same files.
 */
export function createEvmTokenListFetcher(baseUrl: string) {
  return async (name: string): Promise<unknown> => {
    if (!/^(?:index|\d{1,12})\.json$/u.test(name)) throw new Error('evm_token_list_name');

    const { status, data } = await axios.get<unknown>(`${baseUrl}/${name}`, {
      timeout: EVM_TOKEN_LIST_FETCH_TIMEOUT_MS,
      responseType: 'json',
      validateStatus: (code) => code === 200 || code === 404,
    });

    return status === 404 ? undefined : data;
  };
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** A wallet's list on a network is read again after this long (docs/evm-token-discovery.md). */
export const EVM_TOKEN_SCAN_INTERVAL_MS = 24 * HOUR_MS;
/** Refresh reads the list again when the last read of it began longer ago than this. */
export const EVM_TOKEN_SCAN_REFRESH_MS = 5 * MINUTE_MS;
/** A list read that failed is tried again after this long. */
export const EVM_TOKEN_SCAN_RETRY_MS = 10 * MINUTE_MS;
/** A fetched list, or the index of lists, is used this long before it is fetched again. */
export const EVM_TOKEN_LIST_CACHE_MS = 6 * HOUR_MS;

/** When a wallet's list read on one network last succeeded, and when it last failed with no success since. */
export interface EvmTokenScan {
  scannedAt?: number;
  failedAt?: number;
}

export interface EvmTokenDiscoveryState {
  version: 1;
  /** By wallet (its balance map address), then by chain id. */
  scans: Record<string, Record<string, EvmTokenScan>>;
}

interface EvmTokenDiscoveryOptions {
  /** A file of the lists' folder (`index.json`, `<chainId>.json`), or undefined when there is none. */
  fetchListFile: (name: string) => Promise<unknown>;
  readState: () => Promise<unknown>;
  writeState: (state: EvmTokenDiscoveryState) => Promise<void>;
  /** The wallets that exist. A removed wallet's scan times are dropped at the next write. */
  getWalletKeys?: () => string[];
  now?: () => number;
}

const emptyState = (): EvmTokenDiscoveryState => ({ version: 1, scans: {} });

const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** A stored state that is not this shape (another version, a damaged write) counts as none: every list is read once. */
function readableState(value: unknown): EvmTokenDiscoveryState {
  if (!value || typeof value !== 'object') return emptyState();

  const { version, scans } = value as { version?: unknown; scans?: unknown };

  if (version !== 1 || !scans || typeof scans !== 'object') return emptyState();

  return {
    version: 1,
    scans: Object.fromEntries(
      Object.entries(scans as Record<string, unknown>).flatMap(([wallet, chains]) => {
        if (!chains || typeof chains !== 'object') return [];

        return [
          [
            wallet,
            Object.fromEntries(
              Object.entries(chains as Record<string, unknown>).map(([chainId, scan]) => {
                const { scannedAt, failedAt } = (scan ?? {}) as EvmTokenScan;

                return [chainId, { ...(isTime(scannedAt) ? { scannedAt } : {}), ...(isTime(failedAt) ? { failedAt } : {}) }];
              })
            ),
          ],
        ];
      })
    ),
  };
}

/**
 * Keeps the token lists the wallet reads to find ERC-20 tokens outside the registry, and when each wallet's list was
 * last read on each network. The reads themselves are EvmBalanceService's: they go to the network's own node.
 */
export class EvmTokenDiscoveryService {
  private readonly now: () => number;
  private state?: Promise<EvmTokenDiscoveryState>;
  private stateWrite: Promise<void> = Promise.resolve();
  private index?: { at: number; chains: Promise<Set<string>> };
  private readonly lists = new Map<string, { at: number; tokens: Promise<EvmListedToken[]> }>();

  constructor(private readonly options: EvmTokenDiscoveryOptions) {
    this.now = options.now ?? Date.now;
  }

  private load(): Promise<EvmTokenDiscoveryState> {
    this.state ??= this.options.readState().then(readableState, () => emptyState());

    return this.state;
  }

  /**
   * Whether the wallet's list on this network should be read now: never read, read a day ago, failed ten minutes ago,
   * or, with `force` (Refresh, the discovery sweep), last tried more than five minutes ago.
   */
  async isScanDue(walletKey: string, chainId: string, force = false): Promise<boolean> {
    const scan = (await this.load()).scans[walletKey]?.[chainId];

    if (!scan) return true;

    const now = this.now();
    const lastTried = Math.max(scan.scannedAt ?? 0, scan.failedAt ?? 0);

    // A clock that went back must not postpone the next read for as long as it went back.
    if (lastTried > now + MINUTE_MS) return true;
    if (force) return now - lastTried >= EVM_TOKEN_SCAN_REFRESH_MS;
    if (scan.failedAt !== undefined && scan.failedAt > (scan.scannedAt ?? 0)) {
      return now - scan.failedAt >= EVM_TOKEN_SCAN_RETRY_MS;
    }

    return now - (scan.scannedAt ?? 0) >= EVM_TOKEN_SCAN_INTERVAL_MS;
  }

  /** Records a list read that finished (`ok`) or failed, and saves it, so a restart does not read the list again. */
  async recordScan(walletKey: string, chainId: string, ok: boolean): Promise<void> {
    const state = await this.load();
    const previous = state.scans[walletKey]?.[chainId];
    const now = this.now();
    const wallets = this.options.getWalletKeys?.();

    state.scans[walletKey] = {
      ...(state.scans[walletKey] ?? {}),
      [chainId]: ok
        ? { scannedAt: now }
        : { ...(previous?.scannedAt !== undefined ? { scannedAt: previous.scannedAt } : {}), failedAt: now },
    };
    if (wallets) {
      const kept = new Set([...wallets, walletKey]);

      Object.keys(state.scans).forEach((wallet) => {
        if (!kept.has(wallet)) delete state.scans[wallet];
      });
    }

    const snapshot = structuredClone(state);

    this.stateWrite = this.stateWrite.then(() => this.options.writeState(snapshot)).catch(() => undefined);
    await this.stateWrite;
  }

  /** The chain ids that have a list. A failed fetch is not kept, so the next read asks again. */
  private chainsWithLists(): Promise<Set<string>> {
    const now = this.now();

    if (!this.index || now - this.index.at >= EVM_TOKEN_LIST_CACHE_MS || now < this.index.at) {
      const chains = this.options.fetchListFile('index.json').then((document) => {
        if (document === undefined) return new Set<string>();

        return parseEvmTokenListIndex(document);
      });
      const entry = { at: now, chains };

      this.index = entry;
      chains.catch(() => {
        if (this.index === entry) this.index = undefined;
      });
    }

    return this.index.chains;
  }

  /**
   * The listed tokens of a network, or undefined when it has no list. Throws when the list could not be fetched or
   * read, which the caller records as a failed read to try again later.
   */
  async getTokens(chainId: string): Promise<EvmListedToken[] | undefined> {
    if (!(await this.chainsWithLists()).has(chainId)) return undefined;

    const now = this.now();
    const cached = this.lists.get(chainId);

    if (cached && now - cached.at < EVM_TOKEN_LIST_CACHE_MS && now >= cached.at) return cached.tokens;

    const tokens = this.options.fetchListFile(`${chainId}.json`).then((document) => {
      // The index names it: a missing file is a deployment still in progress, tried again later.
      if (document === undefined) throw new Error('evm_token_list_missing');

      return parseEvmTokenList(document, chainId);
    });
    const entry = { at: now, tokens };

    this.lists.set(chainId, entry);
    tokens.catch(() => {
      if (this.lists.get(chainId) === entry) this.lists.delete(chainId);
    });

    return tokens;
  }
}
