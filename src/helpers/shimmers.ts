import { type NetworkJson } from '@extension-base/types';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { isNetworkGroup } from './common';
import { matchesNetworkSelection } from './networkSelection';
import { type NetworkName } from '@/interfaces';

function networksIsPending(networks: NetworkJson[], selectedNetwork: NetworkName = 'all', address = '') {
  if (isNetworkGroup(selectedNetwork)) {
    const isPendingExists = networks.some((network) =>
      network.active !== false && matchesNetworkSelection(network, selectedNetwork, address) &&
      network.networkStatus === NETWORK_STATUS.CONNECTING
    );

    return !navigator.onLine || isPendingExists;
  }

  const networkStatus = networks.find(
    ({ name }) => name.toLowerCase() === selectedNetwork.toLowerCase()
  )?.networkStatus;

  return networkStatus === NETWORK_STATUS.CONNECTING;
}

export { networksIsPending };
