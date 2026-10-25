import type { NetworkJson } from '@extension-base/types';
import type { UniversalWalletPublicAccount } from '@/util/universalWalletIdentity';
import { WalletEcosystem } from '@/interfaces';

export type AssetDiscoverySweepState = {
  lastRun?: number;
  cursor: number;
  registrySignature?: string;
  registryKeys?: string[];
};

type AssetDiscoverySweepOptions = {
  getRegistryNetworks: () => NetworkJson[];
  scanNetwork: (network: NetworkJson) => Promise<void>;
  readState: () => Promise<AssetDiscoverySweepState | undefined>;
  writeState: (state: AssetDiscoverySweepState) => Promise<void>;
  now?: () => number;
  intervalMs?: number;
  maxNetworksPerRun?: number;
  concurrency?: number;
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

export class AssetDiscoverySweepService implements AssetDiscoveryService {
  private readonly now: () => number;
  private readonly intervalMs: number;
  private readonly maxNetworksPerRun: number;
  private readonly concurrency: number;

  constructor(private readonly options: AssetDiscoverySweepOptions) {
    this.now = options.now ?? Date.now;
    this.intervalMs = options.intervalMs ?? DAY_MS;
    this.maxNetworksPerRun = Math.max(1, options.maxNetworksPerRun ?? 24);
    this.concurrency = Math.max(1, options.concurrency ?? 3);
  }

  async runIfDue({ force = false, includeTestnets = false }: RunAssetDiscoverySweepOptions = {}): Promise<AssetDiscoverySweepResult> {
    const previous = (await this.options.readState()) ?? { cursor: 0 };
    const now = this.now();

    // Registry order, rank, activation, favorites, and UI filters are not
    // discovery inputs. Testnets are included only by explicit caller opt-in.
    const registry = this.options
      .getRegistryNetworks()
      // `disabled` is presentation/activation state, not a discovery veto. In
      // particular, production Nexus starts disabled until a user pins it.
      .filter((network) => includeTestnets || !isTestnet(network))
      .sort((left, right) => `${left.ecosystem}:${left.chainId}`.localeCompare(`${right.ecosystem}:${right.chainId}`));
    const registrySignature = getAssetDiscoveryRegistrySignature(registry);
    const registryChanged = previous.registrySignature !== registrySignature;

    if (!force && !registryChanged && previous.lastRun !== undefined && now - previous.lastRun < this.intervalMs) {
      return { due: false, scanned: [], failed: [], nextCursor: previous.cursor };
    }

    if (!registry.length) {
      await this.options.writeState({ lastRun: now, cursor: 0, registryKeys: [], registrySignature });
      return { due: true, scanned: [], failed: [], nextCursor: 0 };
    }

    const cursor = (registryChanged ? 0 : previous.cursor) % registry.length;
    const count = Math.min(this.maxNetworksPerRun, registry.length);
    const cursorOrder = Array.from({ length: registry.length }, (_, index) => registry[(cursor + index) % registry.length]);
    const previousKeys = new Set(previous.registryKeys ?? []);
    const newNetworks = registryChanged
      ? registry.filter((network) => !previousKeys.has(registryNetworkKey(network)))
      : [];
    const selected = [...newNetworks, ...cursorOrder]
      .filter((network, index, list) => list.findIndex((item) => registryNetworkKey(item) === registryNetworkKey(network)) === index)
      .slice(0, count);
    const scanned: string[] = [];
    const failed: string[] = [];

    for (let offset = 0; offset < selected.length; offset += this.concurrency) {
      await Promise.all(
        selected.slice(offset, offset + this.concurrency).map(async (network) => {
          try {
            await this.options.scanNetwork(network);
            scanned.push(network.name);
          } catch {
            failed.push(network.name);
          }
        })
      );
    }

    const nextCursor = (cursor + count) % registry.length;
    await this.options.writeState({
      lastRun: now,
      cursor: nextCursor,
      registryKeys: registry.map(registryNetworkKey),
      registrySignature,
    });

    return { due: true, scanned, failed, nextCursor };
  }
}
