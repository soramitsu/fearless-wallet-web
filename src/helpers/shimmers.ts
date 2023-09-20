import { NetworkJson } from '@extension-base/types';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import { isSameString } from '.';
import { ALL_NETWORKS } from '@/consts/networks';
import { NetworkName } from '@/interfaces';

function networksIsPending(networks: NetworkJson[], selectedNetwork: NetworkName = 'all') {
  if (selectedNetwork === ALL_NETWORKS) {
    const isPendingExists = networks.some(({ apiStatus }) => apiStatus === NETWORK_STATUS.PENDING);

    return isPendingExists;
  }

  const apiStatus = networks.find(({ name }) => isSameString(name, selectedNetwork))?.apiStatus;

  return apiStatus === NETWORK_STATUS.PENDING;
}

export { networksIsPending };
