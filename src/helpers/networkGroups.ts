import type { NetworkJson } from '@extension-base/types';
import type { NetworkFilter, NetworkGroup, NormalizedNetworkName } from '@/interfaces';
import { ALL_NETWORKS, FAVORITE_NETWORKS, POPULAR_NETWORKS } from '@/consts/networks';

export const NETWORK_GROUP_VALUES: NetworkGroup[] = [ALL_NETWORKS, POPULAR_NETWORKS, FAVORITE_NETWORKS];

const NETWORK_GROUP_SET = new Set<NetworkGroup>(NETWORK_GROUP_VALUES);

export const isNetworkGroup = (value: NetworkFilter): value is NetworkGroup =>
  NETWORK_GROUP_SET.has(value as NetworkGroup);

export const normalizeNetworkName = (value: NetworkFilter): NormalizedNetworkName =>
  value.toLowerCase() as NormalizedNetworkName;

export type FilterOptions = {
  favoriteAddress?: string;
};

export interface NetworkSelectionContext {
  selection: NetworkFilter;
  normalizedSelection: NormalizedNetworkName;
  allowedNames: Set<NormalizedNetworkName>;
  isGroup: boolean;
}

export interface NetworkGroupingIndex {
  selection: NetworkSelectionContext;
  groups: Map<NetworkGroup, NetworkJson[]>;
  networksByName: Map<NormalizedNetworkName, NetworkJson>;
}

export const filterNetworksByGroup = (
  networks: NetworkJson[],
  group: NetworkGroup,
  { favoriteAddress }: FilterOptions = {}
): NetworkJson[] => {
  switch (group) {
    case ALL_NETWORKS:
      return networks;
    case POPULAR_NETWORKS:
      return networks.filter(({ rank }) => rank !== undefined);
    case FAVORITE_NETWORKS:
      if (!favoriteAddress) {
        return networks.filter(({ favorite }) => favorite.length > 0);
      }

      return networks.filter(({ favorite }) => favorite.includes(favoriteAddress));
    default:
      return networks;
  }
};

const matchesNetworkName = (lhs: string, rhs: string) => lhs.toLowerCase() === rhs.toLowerCase();

const buildNetworkSelectionContext = (
  networks: NetworkJson[],
  selection: NetworkFilter,
  options: FilterOptions = {}
): NetworkSelectionContext => {
  const normalizedSelection = normalizeNetworkName(selection);
  const allowedNames = createNormalizedNetworkNameSet(networks, selection, options);
  const isGroupSelection = isNetworkGroup(selection);

  if (!isGroupSelection && !allowedNames.has(normalizedSelection)) {
    allowedNames.add(normalizedSelection);
  }

  return {
    selection,
    normalizedSelection,
    allowedNames,
    isGroup: isGroupSelection,
  };
};

export const filterNetworksBySelection = (
  networks: NetworkJson[],
  selection: NetworkFilter,
  options: FilterOptions = {}
): NetworkJson[] => {
  if (!isNetworkGroup(selection)) {
    return networks.filter(({ name }) => matchesNetworkName(name, selection));
  }

  return filterNetworksByGroup(networks, selection, options);
};

export const createNormalizedNetworkNameSet = (
  networks: NetworkJson[],
  selection: NetworkFilter,
  options: FilterOptions = {}
): Set<NormalizedNetworkName> => {
  const matchedNetworks = filterNetworksBySelection(networks, selection, options);

  return new Set(matchedNetworks.map(({ name }) => normalizeNetworkName(name)));
};

export const createNetworkSelectionContext = (
  networks: NetworkJson[],
  selection: NetworkFilter,
  options: FilterOptions = {}
): NetworkSelectionContext => buildNetworkSelectionContext(networks, selection, options);

const buildNetworksByNameMap = (networks: NetworkJson[]) => {
  const map = new Map<NormalizedNetworkName, NetworkJson>();

  networks.forEach((network) => {
    map.set(normalizeNetworkName(network.name), network);
  });

  return map;
};

export const createNetworkGroupingIndex = (
  networks: NetworkJson[],
  selection: NetworkFilter,
  options: FilterOptions = {}
): NetworkGroupingIndex => {
  const selectionContext = buildNetworkSelectionContext(networks, selection, options);
  const groups = new Map<NetworkGroup, NetworkJson[]>();

  NETWORK_GROUP_VALUES.forEach((group) => {
    groups.set(group, filterNetworksByGroup(networks, group, options));
  });

  return {
    selection: selectionContext,
    groups,
    networksByName: buildNetworksByNameMap(networks),
  };
};

export const networkMatchesSelection = (context: NetworkSelectionContext, networkName: NetworkFilter): boolean =>
  context.allowedNames.has(normalizeNetworkName(networkName));

export const getNetworksForGroup = (index: NetworkGroupingIndex, group: NetworkGroup): NetworkJson[] =>
  index.groups.get(group) ?? [];

export const getNetworkByName = (index: NetworkGroupingIndex, networkName: NetworkFilter): NetworkJson | undefined =>
  index.networksByName.get(normalizeNetworkName(networkName));
