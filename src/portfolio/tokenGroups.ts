import type { NetworkJson } from '@extension-base/types';
import { APPROVED_GROUPS, type CanonicalGroupEntry, type CanonicalMemberRole } from '@/portfolio/canonicalGroups';
import { isTestnetNetwork, registryAssetKey } from '@/portfolio/zeroRule';
import { isUntrustedAsset, type UntrustedAssetCheck } from '@/portfolio/untrustedAssets';

/** A member of an approved group, resolved against the networks this build loaded. */
export interface CanonicalGroupMember {
  groupId: string;
  /** The key `buildPortfolioSections` gives the asset. */
  key: string;
  /** The registry `assets[].id`: what routes and transfer requests carry. */
  assetId: string;
  chainId: string;
  networkName: string;
  role: CanonicalMemberRole;
}

export interface CanonicalGroup {
  id: string;
  symbol: string;
  name: string;
  members: CanonicalGroupMember[];
}

export interface CanonicalGroupIndex {
  groups: Map<string, CanonicalGroup>;
  memberOfKey: Map<string, CanonicalGroupMember>;
  /** Members left out, and why. A left-out member renders as its own row. */
  diagnostics: string[];
}

export interface CanonicalGroupIndexOptions {
  networks: NetworkJson[];
  groups?: readonly CanonicalGroupEntry[];
  isTestnet?: (network: NetworkJson) => boolean;
  isUntrusted?: UntrustedAssetCheck;
}

const isEvmEcosystem = (network: NetworkJson): boolean => {
  const ecosystem = String(network.ecosystem ?? '').toLowerCase();
  return ecosystem === 'evm' || ecosystem.includes('ethereum');
};

const sameId = (network: NetworkJson, left: unknown, right: unknown): boolean =>
  isEvmEcosystem(network)
    ? String(left).toLowerCase() === String(right).toLowerCase()
    : String(left) === String(right);

/**
 * The approved groups of the shared file, resolved against today's registry (portfolio contract §2, §6). Groups come
 * only from this file: never from symbols and never from `priceId`. A member is kept only while the live registry
 * still has it on an enabled mainnet with the reviewed symbol and precision, and while its price is trusted; a key
 * that two groups claim (or one group twice) invalidates every group containing it, so a bad file can only split
 * rows, never merge the wrong ones.
 */
export function buildCanonicalGroupIndex({
  networks,
  groups = APPROVED_GROUPS,
  isTestnet = (network) => isTestnetNetwork(network),
  isUntrusted = isUntrustedAsset,
}: CanonicalGroupIndexOptions): CanonicalGroupIndex {
  const diagnostics: string[] = [];
  const networksByChainId = new Map<string, NetworkJson>();
  networks.forEach((network) => {
    const chainId = String(network.chainId || network.name);
    if (!networksByChainId.has(chainId)) networksByChainId.set(chainId, network);
  });

  const resolved = groups.map((group) => ({
    group,
    members: group.members.flatMap((entry): CanonicalGroupMember[] => {
      const skip = (reason: string): CanonicalGroupMember[] => {
        diagnostics.push(`${group.id}: ${entry.symbol}@${entry.network || entry.chainId} ${reason}`);
        return [];
      };
      const network = networksByChainId.get(entry.chainId);

      if (!network) return skip('is on a network this build does not load');
      if (network.disabled || isTestnet(network)) return skip('is on a disabled or test network');

      const asset = network.assets.find(({ id }) => sameId(network, id, entry.assetId));
      if (!asset) return skip('is not in the registry');
      if (String(asset.symbol).toLowerCase() !== entry.symbol.toLowerCase() || Number(asset.precision) !== entry.precision) {
        return skip('changed its symbol or precision in the registry');
      }
      if (isUntrusted(network, asset.id)) return skip('has an untrusted price');

      return [
        {
          groupId: group.id,
          key: registryAssetKey(network, asset),
          assetId: String(asset.id),
          chainId: entry.chainId,
          networkName: network.name,
          role: entry.role,
        },
      ];
    }),
  }));

  const claims = new Map<string, number>();
  resolved.forEach(({ members }) => members.forEach(({ key }) => claims.set(key, (claims.get(key) ?? 0) + 1)));

  const index: CanonicalGroupIndex = { groups: new Map(), memberOfKey: new Map(), diagnostics };

  resolved.forEach(({ group, members }) => {
    const duplicate = members.find(({ key }) => (claims.get(key) ?? 0) > 1);
    if (duplicate) {
      diagnostics.push(`${group.id} is not grouped: ${duplicate.key} is claimed twice`);
      return;
    }
    if (members.length === 0) return;

    index.groups.set(group.id, { id: group.id, symbol: group.symbol, name: group.name, members });
    members.forEach((member) => index.memberOfKey.set(member.key, member));
  });

  return index;
}

const indexCache = new WeakMap<NetworkJson[], CanonicalGroupIndex>();

/** The index of the bundled groups for one network list; components that share the store's list share the index. */
export function canonicalGroupIndexFor(networks: NetworkJson[]): CanonicalGroupIndex {
  let index = indexCache.get(networks);

  if (!index) {
    index = buildCanonicalGroupIndex({ networks });
    indexCache.set(networks, index);
    if (index.diagnostics.length && networks.length) {
      console.info(`[portfolio] ${index.diagnostics.length} token group members are shown as separate rows`);
    }
  }

  return index;
}

/** The group a registry asset of this network belongs to, if any. */
export function canonicalGroupOf(
  index: CanonicalGroupIndex,
  network: NetworkJson | undefined,
  assetId: unknown
): { group: CanonicalGroup; member: CanonicalGroupMember } | undefined {
  if (!network || assetId === undefined || assetId === null || assetId === '') return undefined;

  const member = index.memberOfKey.get(registryAssetKey(network, { id: String(assetId) } as NetworkJson['assets'][number]));
  const group = member ? index.groups.get(member.groupId) : undefined;

  return member && group ? { group, member } : undefined;
}
