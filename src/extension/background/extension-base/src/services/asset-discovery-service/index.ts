import type { NetworkJson } from '@extension-base/types';
import type { UniversalWalletPublicAccount } from '@/util/universalWalletIdentity';
import { WalletEcosystem } from '@/interfaces';

export type AssetDiscoverySweepState = {
  lastRun?: number;
  /** Read by builds up to 4.2.8, which swept the registry by position. */
  cursor: number;
  registrySignature?: string;
  registryKeys?: string[];
  /** When every wallet of `wallets` was last read on a network, by registry key. A network without one is unread. */
  scannedAt?: Record<string, number>;
  /** When the last read of a network failed, with no success since. */
  failedAt?: Record<string, number>;
  /** The assets each network listed when it was read, so a network that gains an asset is read again. */
  networkSignatures?: Record<string, string>;
  /** The wallets those reads covered. A wallet added since has been read on no network. */
  wallets?: string[];
};

/** How far the wallet is with finding what its wallets hold, for the open pages. */
export type AssetDiscoveryProgress = {
  /** Production networks of the registry. */
  total: number;
  /** Of those, the networks every wallet has been read on at least once. */
  checked: number;
  /** Networks whose first read failed. They are tried again later. */
  unreachable: number;
  /** A first read of the remaining networks is running now. */
  running: boolean;
};

type AssetDiscoverySweepOptions = {
  getRegistryNetworks: () => NetworkJson[];
  scanNetwork: (network: NetworkJson) => Promise<void>;
  readState: () => Promise<AssetDiscoverySweepState | undefined>;
  writeState: (state: AssetDiscoverySweepState) => Promise<void>;
  /** The wallets a scan reads. Without it the sweep cannot tell that a wallet was added. */
  getWalletKeys?: () => string[];
  onProgress?: (progress: AssetDiscoveryProgress) => void;
  now?: () => number;
  intervalMs?: number;
  maxNetworksPerRun?: number;
  concurrency?: number;
  /** How long one network may take. Past it the network counts as failed and its place goes to the next one. */
  scanTimeoutMs?: number;
  /** How soon a network whose first read failed is tried again. */
  firstReadRetryMs?: number;
};

export type RunAssetDiscoverySweepOptions = {
  force?: boolean;
  includeTestnets?: boolean;
};

export type AssetDiscoverySweepResult = {
  due: boolean;
  scanned: string[];
  failed: string[];
  nextCursor: number;
};

type AssetDiscoveryWalletIdentity = {
  primaryAddress: string;
  primaryEcosystem?: WalletEcosystem;
  ethereumAddress?: string;
  publicAccounts?: Pick<UniversalWalletPublicAccount, 'ecosystem' | 'address' | 'chainId'>[];
};

/**
 * Background discovery contract shared by registry, wallet lifecycle, and
 * explicit refresh triggers. Implementations must not depend on Portfolio
 * filters or feature activation state.
 */
export interface AssetDiscoveryService {
  runIfDue(options?: RunAssetDiscoverySweepOptions): Promise<AssetDiscoverySweepResult>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const isTestnet = (network: NetworkJson): boolean =>
  Boolean(network.options?.some((option) => option.toLowerCase() === 'testnet')) ||
  /(?:^|\s)(?:testnet|test|dev)(?:\s|$)/iu.test(`${network.name} ${network.chainId}`);

const registryNetworkKey = (network: NetworkJson): string => `${network.ecosystem}:${network.chainId}`;

export function resolveAssetDiscoveryEvmAddress({
  primaryAddress,
  primaryEcosystem,
  ethereumAddress,
  publicAccounts = [],
}: AssetDiscoveryWalletIdentity): string | undefined {
  return (
    ethereumAddress?.trim() ||
    publicAccounts.find(({ ecosystem, address }) => ecosystem === WalletEcosystem.Evm && address.trim())?.address ||
    (primaryEcosystem === WalletEcosystem.Evm ? primaryAddress.trim() : undefined) ||
    undefined
  );
}

export function canScanSubstrateBackedDiscoveryNetwork(
  ecosystem: NetworkJson['ecosystem'],
  supportsSubstrate: boolean,
  evmAddress?: string
): boolean {
  if (ecosystem === 'substrate') return supportsSubstrate;
  if (ecosystem === 'ethereumBased') return supportsSubstrate || Boolean(evmAddress?.trim());

  return false;
}

export const getAssetDiscoveryRegistrySignature = (networks: NetworkJson[]): string =>
  networks
    .map(
      (network) =>
        `${registryNetworkKey(network)}:${network.assets
          .map(({ currencyId, id }) => String(currencyId ?? id))
          .sort()
          .join(',')}`
    )
    .join('|');

/** A short, stable mark of a network's asset list. */
function assetListSignature(network: NetworkJson): string {
  const text = network.assets
    .map(({ currencyId, id }) => String(currencyId ?? id))
    .sort()
    .join(',');
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `${network.assets.length}:${(hash >>> 0).toString(16)}`;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Finds what the wallets hold on networks they do not follow.
 *
 * A network no wallet has been read on yet is read in the first sweep after that becomes true: a wallet that was just
 * created or imported, a network or an asset the registry gained, the first start after an update from a build that
 * swept 24 networks a day. Those reads are not limited in number, only in how many run at once, so a new wallet's
 * holdings are found in minutes instead of days. After that, each due sweep reads again the `maxNetworksPerRun`
 * networks that were read longest ago.
 */
export class AssetDiscoverySweepService implements AssetDiscoveryService {
  private readonly now: () => number;
  private readonly intervalMs: number;
  private readonly maxNetworksPerRun: number;
  private readonly concurrency: number;
  private readonly scanTimeoutMs: number;
  private readonly firstReadRetryMs: number;
  private running?: Promise<AssetDiscoverySweepResult>;
  private progress?: AssetDiscoveryProgress;
  private stateWrite: Promise<void> = Promise.resolve();

  constructor(private readonly options: AssetDiscoverySweepOptions) {
    this.now = options.now ?? Date.now;
    this.intervalMs = options.intervalMs ?? DAY_MS;
    this.maxNetworksPerRun = Math.max(1, options.maxNetworksPerRun ?? 24);
    this.concurrency = Math.max(1, options.concurrency ?? 4);
    this.scanTimeoutMs = Math.max(1, options.scanTimeoutMs ?? 60_000);
    this.firstReadRetryMs = Math.max(0, options.firstReadRetryMs ?? HOUR_MS);
  }

  /** Unknown until the first sweep has read its saved state. */
  getProgress(): AssetDiscoveryProgress | undefined {
    return this.progress ? { ...this.progress } : undefined;
  }

  /** One sweep runs at a time; a request made meanwhile is answered by the sweep that is running. */
  runIfDue(options: RunAssetDiscoverySweepOptions = {}): Promise<AssetDiscoverySweepResult> {
    this.running ??= this.run(options).finally(() => {
      this.running = undefined;
    });

    return this.running;
  }

  private walletKeys(): string[] {
    return [...new Set(this.options.getWalletKeys?.() ?? [])].sort();
  }

  private async run(options: RunAssetDiscoverySweepOptions): Promise<AssetDiscoverySweepResult> {
    let result = await this.sweep(options);

    // A wallet added while the sweep ran was read on only the networks that came after it.
    for (let again = 0; again < 3 && result.wallets.join() !== this.walletKeys().join(); again += 1) {
      const next = await this.sweep({ ...options, force: false });

      result = {
        ...next,
        due: result.due || next.due,
        scanned: [...new Set([...result.scanned, ...next.scanned])],
        failed: [...new Set([...result.failed, ...next.failed])].filter((name) => !next.scanned.includes(name)),
      };
    }

    return { due: result.due, scanned: result.scanned, failed: result.failed, nextCursor: result.nextCursor };
  }

  private setProgress(total: number, scannedAt: Record<string, number>, failedAt: Record<string, number>, running: boolean) {
    const checked = Object.keys(scannedAt).length;
    const unreachable = Object.keys(failedAt).filter((key) => scannedAt[key] === undefined).length;
    const next = { total, checked, unreachable, running };
    const previous = this.progress;

    this.progress = next;
    if (
      !previous || previous.total !== total || previous.checked !== checked ||
      previous.unreachable !== unreachable || previous.running !== running
    ) {
      this.options.onProgress?.({ ...next });
    }
  }

  private async sweep({
    force = false,
    includeTestnets = false,
  }: RunAssetDiscoverySweepOptions): Promise<AssetDiscoverySweepResult & { wallets: string[] }> {
    const previous = (await this.options.readState()) ?? { cursor: 0 };
    const now = this.now();
    const wallets = this.walletKeys();

    // Registry order, rank, activation, favorites, and UI filters are not
    // discovery inputs. Testnets are included only by explicit caller opt-in.
    const registry = this.options
      .getRegistryNetworks()
      // `disabled` is presentation/activation state, not a discovery veto. In
      // particular, production Nexus starts disabled until a user pins it.
      .filter((network) => includeTestnets || !isTestnet(network))
      .sort((left, right) => `${left.ecosystem}:${left.chainId}`.localeCompare(`${right.ecosystem}:${right.chainId}`));
    const registrySignature = getAssetDiscoveryRegistrySignature(registry);
    const keyOf = registryNetworkKey;
    const keys = new Set(registry.map(keyOf));
    const signatures = Object.fromEntries(registry.map((network) => [keyOf(network), assetListSignature(network)]));
    // A state written by a build that swept by position names no wallets: nothing in it says what was read for whom.
    const knownWallets = previous.wallets ? new Set(previous.wallets) : undefined;
    const walletAdded = !knownWallets || wallets.some((wallet) => !knownWallets.has(wallet));
    const kept = (times: Record<string, number> | undefined): Record<string, number> =>
      walletAdded
        ? {}
        : Object.fromEntries(
            Object.entries(times ?? {}).filter(
              // A network that left the registry is forgotten; one that gained or lost an asset is unread again.
              ([key]) => keys.has(key) && previous.networkSignatures?.[key] === signatures[key]
            )
          );
    const scannedAt = kept(previous.scannedAt);
    const failedAt = kept(previous.failedAt);
    // A change of the registry makes the networks it touched unread; it does not bring the daily round forward.
    const due = force || previous.lastRun === undefined || now - previous.lastRun >= this.intervalMs;
    const byRank = (left: NetworkJson, right: NetworkJson) =>
      (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER);
    // The networks most wallets use come first; the rest keep the registry order.
    const unread = registry
      .filter((network) => {
        const key = keyOf(network);

        if (scannedAt[key] !== undefined) return false;

        return force || failedAt[key] === undefined || now - failedAt[key] >= this.firstReadRetryMs;
      })
      .sort(byRank);
    const lastTried = (network: NetworkJson) => Math.max(scannedAt[keyOf(network)] ?? 0, failedAt[keyOf(network)] ?? 0);
    const again = due
      ? registry
          .filter((network) => scannedAt[keyOf(network)] !== undefined)
          .sort((left, right) => lastTried(left) - lastTried(right))
          .slice(0, this.maxNetworksPerRun)
      : [];
    const selected = [...unread, ...again];
    const state = (): AssetDiscoverySweepState => ({
      lastRun: due ? now : previous.lastRun,
      cursor: previous.cursor ?? 0,
      registryKeys: registry.map(keyOf),
      registrySignature,
      scannedAt: { ...scannedAt },
      failedAt: { ...failedAt },
      networkSignatures: signatures,
      wallets,
    });
    const save = () => {
      const snapshot = state();

      this.stateWrite = this.stateWrite.then(() => this.options.writeState(snapshot)).catch(() => undefined);

      return this.stateWrite;
    };
    const scanned: string[] = [];
    const failed: string[] = [];
    const firstReads = new Set(unread.map(keyOf));

    this.setProgress(registry.length, scannedAt, failedAt, firstReads.size > 0);

    if (!selected.length) {
      // Nothing to read. A due sweep of an empty registry still records that it ran.
      if (due) await save();

      return { due, scanned, failed, nextCursor: previous.cursor ?? 0, wallets };
    }

    // The wallets are recorded before the first read, so a sweep that is cut short resumes instead of starting over.
    if (walletAdded || unread.length) await save();

    let next = 0;
    const worker = async () => {
      while (next < selected.length) {
        const network = selected[next];
        const key = keyOf(network);
        let timer: ReturnType<typeof setTimeout> | undefined;

        next += 1;
        try {
          await Promise.race([
            this.options.scanNetwork(network),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error('discovery_scan_timeout')), this.scanTimeoutMs);
            }),
          ]);
          scannedAt[key] = this.now();
          delete failedAt[key];
          scanned.push(network.name);
        } catch {
          failedAt[key] = this.now();
          failed.push(network.name);
        } finally {
          clearTimeout(timer);
        }

        firstReads.delete(key);
        this.setProgress(registry.length, scannedAt, failedAt, firstReads.size > 0);
        void save();
      }
    };

    await Promise.all(Array.from({ length: Math.min(this.concurrency, selected.length) }, worker));
    this.setProgress(registry.length, scannedAt, failedAt, false);
    await save();

    return { due: true, scanned, failed, nextCursor: previous.cursor ?? 0, wallets };
  }
}
