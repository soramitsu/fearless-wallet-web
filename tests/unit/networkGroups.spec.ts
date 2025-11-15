import {
  filterNetworksBySelection,
  createNormalizedNetworkNameSet,
  createNetworkSelectionContext,
  networkMatchesSelection,
  createNetworkGroupingIndex,
  getNetworksForGroup,
  getNetworkByName,
} from '@/helpers/networkGroups';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';
import type { NetworkJson } from '@extension-base/types';

const buildNetwork = ({
  name,
  rank,
  favorite = [],
  chainId,
}: {
  name: string;
  rank?: number;
  favorite?: string[];
  chainId?: string;
}): NetworkJson =>
  ({
    name,
    chainId: chainId ?? name.toLowerCase(),
    rank,
    favorite,
  }) as unknown as NetworkJson;

const mockNetworks: NetworkJson[] = [
  buildNetwork({ name: 'Sora', rank: 1, favorite: ['alice'] }),
  buildNetwork({ name: 'Polkadot', rank: 2, favorite: ['bob'] }),
  buildNetwork({ name: 'Kusama', favorite: [] }),
];

describe('filterNetworksBySelection', () => {
  it('returns matching network when a concrete name is provided', () => {
    const result = filterNetworksBySelection(mockNetworks, 'Polkadot');

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Polkadot');
  });

  it('returns all networks when selecting ALL_NETWORKS', () => {
    const result = filterNetworksBySelection(mockNetworks, ALL_NETWORKS);

    expect(result).toHaveLength(mockNetworks.length);
  });

  it('returns only ranked networks for POPULAR_NETWORKS', () => {
    const result = filterNetworksBySelection(mockNetworks, POPULAR_NETWORKS);

    const names = result.map(({ name }) => name);

    expect(names).toEqual(['Sora', 'Polkadot']);
  });

  it('filters favorites for a specific address when FAVORITE_NETWORKS is selected', () => {
    const result = filterNetworksBySelection(mockNetworks, FAVORITE_NETWORKS, { favoriteAddress: 'alice' });

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Sora');
  });

  it('returns all favorites when no address is provided', () => {
    const result = filterNetworksBySelection(mockNetworks, FAVORITE_NETWORKS);

    const names = result.map(({ name }) => name);

    expect(names).toEqual(['Sora', 'Polkadot']);
  });
});

describe('createNormalizedNetworkNameSet', () => {
  it('returns a normalized set for the provided selection', () => {
    const result = createNormalizedNetworkNameSet(mockNetworks, FAVORITE_NETWORKS, { favoriteAddress: 'bob' });

    expect(Array.from(result)).toEqual(['polkadot']);
  });

  it('returns the selected network when a concrete name is provided', () => {
    const result = createNormalizedNetworkNameSet(mockNetworks, 'Sora');

    expect(result.size).toBe(1);
    expect(result.has('sora')).toBe(true);
  });

  it('returns an empty set when no networks match', () => {
    const result = createNormalizedNetworkNameSet(mockNetworks, 'Unknown');

    expect(result.size).toBe(0);
  });
});

describe('createNetworkSelectionContext', () => {
  it('captures metadata for direct network selections', () => {
    const context = createNetworkSelectionContext(mockNetworks, 'Polkadot');

    expect(context.isGroup).toBe(false);
    expect(context.normalizedSelection).toBe('polkadot');
    expect(context.allowedNames.has('polkadot')).toBe(true);
    expect(networkMatchesSelection(context, 'Polkadot')).toBe(true);
  });

  it('applies favorite filtering when requested', () => {
    const context = createNetworkSelectionContext(mockNetworks, FAVORITE_NETWORKS, { favoriteAddress: 'alice' });

    expect(context.isGroup).toBe(true);
    expect(Array.from(context.allowedNames)).toEqual(['sora']);
    expect(networkMatchesSelection(context, 'Polkadot')).toBe(false);
    expect(networkMatchesSelection(context, 'Sora')).toBe(true);
  });

  it('falls back to the normalized selection when no networks match', () => {
    const context = createNetworkSelectionContext(mockNetworks, 'Atlantis');

    expect(context.allowedNames.has('atlantis')).toBe(true);
    expect(networkMatchesSelection(context, 'Atlantis')).toBe(true);
  });
});

describe('createNetworkGroupingIndex', () => {
  it('captures grouped networks and normalized lookups', () => {
    const index = createNetworkGroupingIndex(mockNetworks, POPULAR_NETWORKS, { favoriteAddress: 'alice' });

    expect(index.selection.isGroup).toBe(true);
    expect(getNetworksForGroup(index, ALL_NETWORKS)).toHaveLength(mockNetworks.length);
    expect(getNetworksForGroup(index, POPULAR_NETWORKS).map(({ name }) => name)).toEqual(['Sora', 'Polkadot']);
    expect(getNetworkByName(index, 'sora')?.name).toBe('Sora');
  });
});
