import { type NetworkJson } from '@extension-base/types';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { type NetworkFilter } from '@/interfaces';
import { ALL_NETWORKS } from '@/consts/networks';
import { filterNetworksBySelection } from '@/helpers/networkGroups';

function networksIsPending(networks: NetworkJson[], selectedNetwork: NetworkFilter = ALL_NETWORKS) {
  const relevantNetworks = filterNetworksBySelection(networks, selectedNetwork);
  const isPendingExists = relevantNetworks.some(({ networkStatus }) => networkStatus === NETWORK_STATUS.CONNECTING);
  const isOnline = 'onLine' in navigator ? navigator.onLine : true;

  return !isOnline || isPendingExists;
}

export { networksIsPending };
