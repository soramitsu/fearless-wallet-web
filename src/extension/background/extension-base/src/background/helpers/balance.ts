import type { NetworkJson } from '@extension-base/types';
import type { NetworkName } from '@/interfaces';

type NetworkMapLike = Record<string, Pick<NetworkJson, 'ecosystem'> | undefined>;

function filterNetworksByEcosystem(
  networkMap: NetworkMapLike,
  networks: NetworkName[],
  ecosystems: readonly NetworkJson['ecosystem'][]
): NetworkName[] {
  const allowed = new Set<NetworkJson['ecosystem']>(ecosystems);

  return networks.filter((network) => {
    const ecosystem = networkMap[network]?.ecosystem;

    return ecosystem !== undefined && allowed.has(ecosystem);
  });
}

export { filterNetworksByEcosystem };
