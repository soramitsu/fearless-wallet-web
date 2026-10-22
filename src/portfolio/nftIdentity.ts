import type { NftCollection, ChainNftState } from '@extension-base/services/nft-service/types';
import type { NetworkJson } from '@extension-base/types';
import { isSameString } from '@/helpers';

export type PortfolioNftCollection = NftCollection & {
  key: string;
  chainId: string;
  ecosystem: string;
};

export type PortfolioNftNetworkSection = {
  key: string;
  chainId: string;
  name: string;
  ecosystem: string;
  icon: string;
  address: string;
  latestTimestamp: number | null;
  stale: boolean;
  collections: PortfolioNftCollection[];
};

type BuildNftNetworkSectionsOptions = {
  nfts: ChainNftState;
  networks: NetworkJson[];
  address: string;
};

function normalizeNftContract(ecosystem: string, contract: string): string {
  const value = contract.trim();

  return ecosystem.toLowerCase() === 'evm' || ecosystem.toLowerCase() === 'ethereum'
    ? value.toLowerCase()
    : value;
}

export function buildNftCollectionKey(ecosystem: string, chainId: string, contract: string): string {
  return `${ecosystem.toLowerCase()}:${chainId}:${normalizeNftContract(ecosystem, contract)}`;
}

export function buildAvailableNftKey(chainId: string, contract: string): string {
  return `${chainId}:${contract.trim().toLowerCase()}`;
}

export function findNftCollection(
  nfts: ChainNftState,
  networks: NetworkJson[],
  chainId: string,
  contract: string
): NftCollection | undefined {
  const network = networks.find((item) => isSameString(String(item.chainId), chainId));
  const ecosystem = String(network?.ecosystem ?? 'evm');
  const expected = normalizeNftContract(ecosystem, contract);

  return Object.values(nfts[chainId] ?? {}).find(
    (collection) => normalizeNftContract(ecosystem, collection.address) === expected
  );
}

export function buildNftNetworkSections({
  nfts,
  networks,
  address,
}: BuildNftNetworkSectionsOptions): PortfolioNftNetworkSection[] {
  const sections: PortfolioNftNetworkSection[] = [];

  Object.entries(nfts).forEach(([chainId, state]) => {
    const network = networks.find((item) => isSameString(String(item.chainId), chainId));
    const ecosystem = String(network?.ecosystem ?? 'evm');
    const collections = new Map<string, PortfolioNftCollection>();

    Object.values(state ?? {}).forEach((collection) => {
      if (!collection?.address || !collection.ownedNfts?.length) return;

      const key = buildNftCollectionKey(ecosystem, chainId, collection.address);
      const existing = collections.get(key);

      if (!existing) {
        collections.set(key, { ...collection, key, chainId, ecosystem });
        return;
      }

      const tokens = new Map(existing.ownedNfts.map((nft) => [nft.id, nft]));
      collection.ownedNfts.forEach((nft) => tokens.set(nft.id, nft));
      existing.ownedNfts = [...tokens.values()];
      existing.lastSyncedAt = Math.max(existing.lastSyncedAt ?? 0, collection.lastSyncedAt ?? 0) || undefined;
      existing.syncStale = existing.syncStale || collection.syncStale;
    });

    if (!collections.size) return;

    const values = [...collections.values()].sort((left, right) =>
      (left.name || left.address).localeCompare(right.name || right.address)
    );
    const timestamps = values.map(({ lastSyncedAt }) => lastSyncedAt ?? 0).filter(Boolean);

    sections.push({
      key: `${ecosystem.toLowerCase()}:${chainId}`,
      chainId,
      name: network?.name ?? values[0].network ?? chainId,
      ecosystem,
      icon: network?.icon ?? ecosystem,
      address,
      latestTimestamp: timestamps.length ? Math.max(...timestamps) : null,
      stale: values.some(({ syncStale }) => syncStale === true),
      collections: values,
    });
  });

  return sections.sort((left, right) => left.name.localeCompare(right.name));
}
